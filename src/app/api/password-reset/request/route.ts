import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSql } from "@/lib/neon";
import { ensurePasswordResetSchema, storeResetToken, RESET_TOKEN_TTL_MINUTES } from "@/lib/passwordReset";

export const runtime = "nodejs";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// 簡易レート制限（同一メール/IP で10分5回、in-memory）
const RL = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const WIN = 10 * 60 * 1000;
  const MAX = 5;
  const arr = (RL.get(key) ?? []).filter((t) => now - t < WIN);
  if (arr.length >= MAX) { RL.set(key, arr); return true; }
  arr.push(now);
  RL.set(key, arr);
  return false;
}

/**
 * POST /api/password-reset/request — 再設定メールを送信。
 * ユーザーの存在有無に関わらず常に {ok:true} を返す（メールアドレス列挙攻撃の防止）。
 */
export async function POST(req: Request) {
  try {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const body = await req.json().catch(() => ({}));
    const email = (body.email ?? "").toString().toLowerCase().trim();

    if (!email || !isEmail(email) || email.length > 254) {
      // 形式不正でも成功扱い（列挙防止）。ただし送信はしない。
      return NextResponse.json({ ok: true });
    }
    if (rateLimited(`mail:${email}`) || rateLimited(`ip:${ip}`)) {
      return NextResponse.json(
        { message: "送信が多すぎます。時間をおいて再度お試しください。" },
        { status: 429 }
      );
    }

    await ensurePasswordResetSchema();
    const sql = getSql();
    const rows = await sql`SELECT id, name FROM users WHERE email = ${email} LIMIT 1`;
    const user = rows[0] as { id: string; name: string } | undefined;

    // 存在しない場合・デモアカウントの場合も {ok:true}（実際の送信のみ行わない）
    if (user && !email.endsWith("@demo.local")) {
      const token = randomBytes(32).toString("hex");
      await storeResetToken(user.id, token);

      const base = process.env.NEXTAUTH_URL || "https://paloma-pf-zaiko.vercel.app";
      const link = `${base.replace(/\/$/, "")}/password-reset/confirm?token=${token}`;

      if (process.env.RESEND_API_KEY) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${(process.env.RESEND_API_KEY || "").trim()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: process.env.CONTACT_FROM || "PF在庫管理 <noreply@paloma-pf.com>",
              to: [email],
              subject: "【PF在庫管理】パスワード再設定のご案内",
              text:
                `${user.name} 様\n\n` +
                `PF在庫管理のパスワード再設定を受け付けました。\n` +
                `以下のリンクから${RESET_TOKEN_TTL_MINUTES}分以内に再設定してください。\n\n` +
                `${link}\n\n` +
                `心当たりがない場合は、このメールを破棄してください（パスワードは変更されません）。\n\n` +
                `--\nPF在庫管理\n`,
              // MAIL_REPLY_TO（設定時のみ）を既定の Reply-To として付与
              ...(process.env.MAIL_REPLY_TO?.trim() ? { reply_to: process.env.MAIL_REPLY_TO.trim() } : {}),
            }),
          });
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            console.warn("[password-reset] Resend error", res.status, t.slice(0, 200));
          }
        } catch (e) {
          console.warn("[password-reset] mail send failed:", (e as Error).message);
        }
      } else {
        console.warn("[password-reset] RESEND_API_KEY 未設定のためメール送信をスキップしました");
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[password-reset/request] error:", err);
    // 内部エラーでも列挙につながる差は出さない
    return NextResponse.json({ ok: true });
  }
}
