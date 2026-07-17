import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import {
  createInvitedUser,
  emailExists,
  ensureAuthSchema,
  listUsers,
  loginIdExists,
} from "@/lib/authDb";
import { getSessionWithRole } from "@/lib/session";
import { getSql } from "@/lib/neon";
import { ensurePasswordResetSchema, hashResetToken } from "@/lib/passwordReset";

export const runtime = "nodejs";

// 招待リンクの有効期限は長め（7日）。パスワード未設定のまま失効しにくくする。
const INVITE_TOKEN_TTL_MINUTES = 7 * 24 * 60;

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
// 社員番号は半角英数字とハイフン・アンダースコアのみ（1〜64文字）
const isLoginId = (s: string) => /^[A-Za-z0-9_-]{1,64}$/.test(s);

/** メンバー一覧（管理者限定）。 */
export async function GET() {
  const s = await getSessionWithRole();
  if (!s) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  if (s.role !== "admin") {
    return NextResponse.json({ message: "権限がありません。" }, { status: 403 });
  }
  try {
    // pending 列など招待モデル用スキーマを冪等に用意してから一覧取得
    await ensureAuthSchema();
    const members = await listUsers(s.companyId);
    return NextResponse.json({ members });
  } catch (err) {
    console.error("[members] list error:", err);
    return NextResponse.json({ message: "取得に失敗しました。" }, { status: 500 });
  }
}

/** メンバー招待（管理者限定）。社員番号でアカウント発行＋設定リンク発行＋（メールがあれば）送信。 */
export async function POST(req: Request) {
  const s = await getSessionWithRole();
  if (!s) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  if (s.role !== "admin") {
    return NextResponse.json({ message: "権限がありません。" }, { status: 403 });
  }
  if (s.isDemo) {
    return NextResponse.json(
      { message: "デモではメンバーを追加できません。" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const loginId = (body.loginId ?? "").toString().trim();
    const name = (body.name ?? "").toString().trim();
    const email = (body.email ?? "").toString().trim().toLowerCase();
    const role: "admin" | "member" = body.role === "admin" ? "admin" : "member";

    if (!loginId || !isLoginId(loginId)) {
      return NextResponse.json(
        { message: "社員番号は半角英数字（ハイフン・アンダースコア可）で入力してください。" },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json({ message: "お名前を入力してください。" }, { status: 400 });
    }
    // メールは任意。入力された場合のみ形式チェック
    if (email && (!isEmail(email) || email.length > 254)) {
      return NextResponse.json(
        { message: "メールアドレスの形式が正しくありません。" },
        { status: 400 }
      );
    }

    await ensureAuthSchema();
    if (await loginIdExists(loginId)) {
      return NextResponse.json(
        { message: "この社員番号は既に登録されています。" },
        { status: 409 }
      );
    }
    if (email && (await emailExists(email))) {
      return NextResponse.json(
        { message: "このメールアドレスは既に登録されています。" },
        { status: 409 }
      );
    }

    const userId = await createInvitedUser(s.companyId, loginId, name, role, email || null);

    // 招待リンク用トークンを発行（生トークンはリンクにのみ載せ、DBはハッシュだけ保存）
    await ensurePasswordResetSchema();
    const token = randomBytes(32).toString("hex");
    const sql = getSql();
    await sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${userId}, ${hashResetToken(token)},
              NOW() + make_interval(mins => ${INVITE_TOKEN_TTL_MINUTES}))`;

    const base = (process.env.NEXTAUTH_URL || "https://zaiko.paloma-pf.com").replace(/\/+$/, "");
    const inviteUrl = `${base}/password-reset/confirm?token=${token}`;

    // メールアドレスが入力されている場合のみ送信（無くても作成は成功させ、inviteUrl を必ず返す）
    let emailSent = false;
    if (email && process.env.RESEND_API_KEY) {
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
        emailSent = res.ok;
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.warn("[members] Resend error", res.status, t.slice(0, 200));
        }
      } catch (e) {
        console.warn("[members] invite mail send failed:", (e as Error).message);
      }
    }

    return NextResponse.json({ ok: true, inviteUrl, emailSent }, { status: 201 });
  } catch (err) {
    console.error("[members] invite error:", err);
    return NextResponse.json({ message: "招待に失敗しました。" }, { status: 500 });
  }
}
