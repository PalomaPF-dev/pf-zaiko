import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { encode } from "next-auth/jwt";
import { getSql } from "@/lib/neon";
import { ensureAuthSchema } from "@/lib/authDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ポータルからのSSOログインAPI。
 * ポータルが発行した短命トークン（HMAC-SHA256署名・60秒有効）を検証し、
 * パスワード入力なしで next-auth の JWT セッションを発行して "/" へ遷移する。
 * トークン: base64url(JSON{loginId, app, exp}) + "." + hex(HMAC-SHA256(payload, PF_PROVISION_KEY))
 */

// このアプリのキー（ポータル側の app 指定と一致する必要がある）
const APP_KEY = "zaiko";
// セッション有効期間（next-auth 既定の30日に合わせる）
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

// authOptions と同じロジックでクッキー名（inventory.session-token）を決める
const useSecureCookies =
  (process.env.NEXTAUTH_URL ?? "").startsWith("https://") || process.env.VERCEL === "1";
const SESSION_COOKIE_NAME = `${useSecureCookies ? "__Secure-" : ""}inventory.session-token`;

/** タイミング安全な比較（長さ違いは即 false）。 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** トークンを検証し、有効なら loginId を返す（無効は null）。 */
function verifySsoToken(token: string, key: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", key).update(payload).digest("hex");
  if (!safeEqual(sig, expected)) return null;
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { loginId, app, exp } = data as { loginId?: unknown; app?: unknown; exp?: unknown };
  if (typeof loginId !== "string" || loginId.length === 0) return null;
  if (app !== APP_KEY) return null;
  if (typeof exp !== "number" || !(exp > Date.now())) return null;
  return loginId;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  // 失敗時は詳細を漏らさずログイン画面へ（302）
  const fail = () => NextResponse.redirect(new URL("/login?error=sso", url), 302);

  const key = process.env.PF_PROVISION_KEY;
  if (!key) return new NextResponse("SSO is not configured", { status: 503 });

  const token = url.searchParams.get("token");
  if (!token) return fail();
  const loginId = verifySsoToken(token, key);
  if (!loginId) return fail();

  try {
    // authorize と同様にスキーマを冪等に整えてから検索（一時失敗では止めない）
    try {
      await ensureAuthSchema();
    } catch {
      /* noop */
    }
    const sql = getSql();
    const rows = await sql`
      SELECT u.id, u.email, u.name, u.role,
             c.id AS company_id, c.name AS company_name, c.is_demo
      FROM users u
      JOIN companies c ON c.id = u.company_id
      WHERE u.login_id = ${loginId}
      LIMIT 1
    `;
    const user = rows[0];
    if (!user) return fail();
    // pending（パスワード未設定）でもポータル経由ならログイン可（ポータルが本人確認済み）

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) return fail();

    // authorize → jwt コールバック通過後と同じ形のトークンを組み立てる
    const jwt = await encode({
      token: {
        name: user.name as string,
        email: (user.email ?? null) as string | null,
        sub: user.id as string,
        id: user.id as string,
        companyId: user.company_id as string,
        companyName: user.company_name as string,
        isDemo: Boolean(user.is_demo),
        // 役割導入前のユーザー（role 未設定）は管理者として扱う（authorize と同じ）
        role: (user.role ?? "admin") as "admin" | "member" | "worker",
      },
      secret,
      maxAge: SESSION_MAX_AGE,
    });

    const res = NextResponse.redirect(new URL("/", url), 302);
    res.cookies.set(SESSION_COOKIE_NAME, jwt, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch {
    return fail();
  }
}
