import { NextResponse } from "next/server";
import { randomBytes, timingSafeEqual } from "crypto";
import {
  createInvitedUser,
  ensureAuthSchema,
  getOrCreateCompanyByName,
} from "@/lib/authDb";
import { getSql } from "@/lib/neon";
import { ensurePasswordResetSchema, hashResetToken } from "@/lib/passwordReset";

export const runtime = "nodejs";

/**
 * ポータルからの一括アカウント発行API（内部用・UIなし）。
 * 認証はセッションではなく共有キー PF_PROVISION_KEY（未設定なら 503 で無効化）。
 * members API（招待）と同じ流れで、複数ユーザーをまとめて発行して招待リンクを返す。
 */

// 招待リンクの有効期限は members API と同じ7日
const INVITE_TOKEN_TTL_MINUTES = 7 * 24 * 60;
// 1リクエストで発行できる上限件数
const MAX_USERS_PER_REQUEST = 200;
// 発行先の会社（統一管理者ブートストラップと同じ固定値）
const PROVISION_COMPANY_NAME = "株式会社パロマ";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
// 社員番号は半角英数字とハイフン・アンダースコアのみ（1〜64文字）
const isLoginId = (s: string) => /^[A-Za-z0-9_-]{1,64}$/.test(s);

/** リンクの base URL（members API と同じ・NEXTAUTH_URL 優先）。 */
const inviteLinkBase = () =>
  (process.env.NEXTAUTH_URL || "https://zaiko.paloma-pf.com").replace(/\/+$/, "");

/** タイミング安全なキー比較（長さ違いは即 false 扱い）。 */
function safeKeyEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

type ProvisionResult = {
  loginId: string;
  status: "created" | "exists" | "error";
  inviteUrl?: string;
  message?: string;
};

/** 招待メール送信（members API の文面を流用）。失敗しても throw しない。 */
async function sendInviteMail(
  name: string,
  loginId: string,
  email: string,
  inviteUrl: string
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[provision] RESEND_API_KEY 未設定のため招待メール未送信");
    return;
  }
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
        subject: "【PF在庫管理】アカウント発行のご案内",
        text:
          `${name} 様\n\n` +
          `PF在庫管理の管理者からアカウントが発行されました。\n` +
          `社員番号: ${loginId}\n` +
          `以下のリンクから7日以内にパスワードを設定してください。\n\n` +
          `${inviteUrl}\n\n` +
          `パスワードを設定すると、社員番号とパスワードでログインできるようになります。\n` +
          `心当たりがない場合は、このメールを破棄してください。\n\n` +
          `--\nPF在庫管理\n`,
        // MAIL_REPLY_TO（設定時のみ）を既定の Reply-To として付与
        ...(process.env.MAIL_REPLY_TO?.trim() ? { reply_to: process.env.MAIL_REPLY_TO.trim() } : {}),
      }),
    });
    if (!res.ok) {
      const t = (await res.text().catch(() => "")).slice(0, 200);
      console.warn("[provision] invite mail Resend error", res.status, t);
    }
  } catch (e) {
    console.warn("[provision] invite mail send failed:", (e as Error).message);
  }
}

export async function POST(req: Request) {
  const provisionKey = process.env.PF_PROVISION_KEY;
  if (!provisionKey) {
    return NextResponse.json({ message: "provision未設定" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key : "";
  if (!safeKeyEqual(key, provisionKey)) {
    return NextResponse.json({ message: "認証に失敗しました。" }, { status: 401 });
  }

  const users = body.users;
  if (!Array.isArray(users) || users.length === 0) {
    return NextResponse.json({ message: "users を指定してください。" }, { status: 400 });
  }
  if (users.length > MAX_USERS_PER_REQUEST) {
    return NextResponse.json(
      { message: `一度に発行できるのは最大${MAX_USERS_PER_REQUEST}件です。` },
      { status: 400 }
    );
  }
  const regenerateLinks = body.regenerateLinks === true;

  try {
    await ensureAuthSchema();
    await ensurePasswordResetSchema();
    const companyId = await getOrCreateCompanyByName(PROVISION_COMPANY_NAME);
    const sql = getSql();

    const results: ProvisionResult[] = [];
    for (const u of users) {
      const loginId = (u?.loginId ?? "").toString().trim();
      try {
        if (!isLoginId(loginId)) {
          results.push({
            loginId,
            status: "error",
            message: "社員番号は半角英数字とハイフン・アンダースコア（1〜64文字）で入力してください。",
          });
          continue;
        }
        if (loginId === "admin") {
          results.push({
            loginId,
            status: "error",
            message: "社員番号 'admin' は発行できません。",
          });
          continue;
        }
        const name = (u?.name ?? "").toString().trim();
        const email = ((u?.email ?? "").toString().trim().toLowerCase() as string) || null;
        const role: "admin" | "member" = u?.role === "admin" ? "admin" : "member";
        // 承認者の社員番号（任意）。trim して空なら NULL（未設定）。
        const approverLoginId: string | null =
          (u?.approverLoginId ?? "").toString().trim() || null;
        if (email && (!isEmail(email) || email.length > 254)) {
          results.push({
            loginId,
            status: "error",
            message: "メールアドレスの形式が正しくありません。",
          });
          continue;
        }

        // 既存ユーザー（login_id 一致）: ポータル側の編集を反映（氏名・役割・承認者、
        // メールは非空指定時のみ）。pending / password_hash には触れない。
        // regenerateLinks のときだけ設定リンクを再発行。
        const existing = await sql`SELECT id FROM users WHERE login_id = ${loginId} LIMIT 1`;
        if (existing.length > 0) {
          const userId = existing[0].id as string;
          await sql`
            UPDATE users
            SET name = COALESCE(NULLIF(${name}, ''), name),
                role = ${role},
                approver_login_id = ${approverLoginId},
                email = COALESCE(${email}, email)
            WHERE id = ${userId}`;
          if (!regenerateLinks) {
            results.push({ loginId, status: "exists" });
            continue;
          }
          const token = randomBytes(32).toString("hex");
          await sql`
            INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
            VALUES (${userId}, ${hashResetToken(token)},
                    NOW() + make_interval(mins => ${INVITE_TOKEN_TTL_MINUTES}))`;
          results.push({
            loginId,
            status: "exists",
            inviteUrl: `${inviteLinkBase()}/password-reset/confirm?token=${token}`,
          });
          continue;
        }

        if (!name) {
          results.push({ loginId, status: "error", message: "お名前を入力してください。" });
          continue;
        }

        // 新規発行: 招待ユーザー作成 → 設定リンク発行 →（メールがあれば）送信
        const userId = await createInvitedUser(companyId, loginId, name, role, email, approverLoginId);
        const token = randomBytes(32).toString("hex");
        await sql`
          INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
          VALUES (${userId}, ${hashResetToken(token)},
                  NOW() + make_interval(mins => ${INVITE_TOKEN_TTL_MINUTES}))`;
        const inviteUrl = `${inviteLinkBase()}/password-reset/confirm?token=${token}`;
        if (email) await sendInviteMail(name, loginId, email, inviteUrl);
        results.push({ loginId, status: "created", inviteUrl });
      } catch (e) {
        // email 一意制約違反などもここに落として続行
        results.push({ loginId, status: "error", message: (e as Error).message });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[provision] error:", err);
    return NextResponse.json({ message: "一括発行に失敗しました。" }, { status: 500 });
  }
}
