import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSessionWithRole } from "@/lib/session";
import { getSql } from "@/lib/neon";
import { ensurePasswordResetSchema, hashResetToken } from "@/lib/passwordReset";

export const runtime = "nodejs";

// 設定リンクの有効期限は招待と同じ7日（メール未達・伝達漏れでも失効しにくくする）
const RESET_LINK_TTL_MINUTES = 7 * 24 * 60;

/**
 * パスワード設定リンクの再発行（管理者限定・自社ユーザーのみ）。
 * 古い未使用トークンは無効化し、新しいリンクを返す。メールアドレスがあれば送信もする。
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSessionWithRole();
  if (!s) return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
  if (s.role !== "admin") {
    return NextResponse.json({ message: "権限がありません。" }, { status: 403 });
  }
  if (s.isDemo) {
    return NextResponse.json({ message: "デモでは操作できません。" }, { status: 403 });
  }

  try {
    const { id } = await ctx.params;
    const sql = getSql();

    // 自社ユーザーのみ対象（他社ユーザーは404）
    const rows = await sql`
      SELECT id, name, email FROM users
      WHERE id = ${id} AND company_id = ${s.companyId} LIMIT 1`;
    const target = rows[0] as { id: string; name: string; email: string | null } | undefined;
    if (!target) {
      return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });
    }

    await ensurePasswordResetSchema();
    // 古い未使用リンクは無効化してから新規発行（生トークンはリンクにのみ載せ、DBはハッシュだけ保存）
    await sql`DELETE FROM password_reset_tokens WHERE user_id = ${id} AND used_at IS NULL`;
    const token = randomBytes(32).toString("hex");
    await sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${id}, ${hashResetToken(token)},
              NOW() + make_interval(mins => ${RESET_LINK_TTL_MINUTES}))`;

    const base = (process.env.NEXTAUTH_URL || "https://sumakouba-zaiko.vercel.app").replace(/\/+$/, "");
    const resetUrl = `${base}/password-reset/confirm?token=${token}`;

    // メールアドレスが登録されていれば送信（無くてもリンクは返す）
    let emailSent = false;
    if (target.email && process.env.RESEND_API_KEY) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${(process.env.RESEND_API_KEY || "").trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.CONTACT_FROM || "PF在庫管理 <noreply@sumakouba.com>",
            to: [target.email],
            subject: "【PF在庫管理】パスワード設定リンクのご案内",
            text:
              `${target.name} 様\n\n` +
              `PF在庫管理の管理者がパスワード設定リンクを再発行しました。\n` +
              `以下のリンクから7日以内にパスワードを設定してください。\n\n` +
              `${resetUrl}\n\n` +
              `パスワードを設定すると、社員番号とパスワードでログインできるようになります。\n` +
              `心当たりがない場合は、このメールを破棄してください。\n\n` +
              `--\nPF在庫管理\nPF運営事務局\n`,
            // MAIL_REPLY_TO（設定時のみ）を既定の Reply-To として付与
            ...(process.env.MAIL_REPLY_TO?.trim() ? { reply_to: process.env.MAIL_REPLY_TO.trim() } : {}),
          }),
        });
        emailSent = res.ok;
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.warn("[members/reset-link] Resend error", res.status, t.slice(0, 200));
        }
      } catch (e) {
        console.warn("[members/reset-link] mail send failed:", (e as Error).message);
      }
    }

    return NextResponse.json({ ok: true, resetUrl, emailSent });
  } catch (err) {
    console.error("[members/reset-link] error:", err);
    return NextResponse.json({ message: "再発行に失敗しました。" }, { status: 500 });
  }
}
