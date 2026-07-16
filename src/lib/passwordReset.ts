import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { getSql } from "./neon";
import { ensureAuthSchema } from "./authDb";

/**
 * パスワード再設定トークン（メールリンク方式）。
 * - トークンは平文をメールに載せ、DB には SHA-256 ハッシュのみ保存する
 * - 有効期限 60 分・使い捨て（used_at で消込み）
 */
export const RESET_TOKEN_TTL_MINUTES = 60;

/** password_reset_tokens テーブルを冪等に作成（このシリーズの慣例）。 */
export async function ensurePasswordResetSchema(): Promise<void> {
  await ensureAuthSchema();
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id)`;
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** トークンを保存（発行済みの古い未使用トークンは無効化のため削除）。 */
export async function storeResetToken(userId: string, token: string): Promise<void> {
  await ensurePasswordResetSchema();
  const sql = getSql();
  await sql`DELETE FROM password_reset_tokens WHERE user_id = ${userId} AND used_at IS NULL`;
  await sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (${userId}, ${hashResetToken(token)}, NOW() + ${RESET_TOKEN_TTL_MINUTES + " minutes"}::interval)`;
}

/**
 * トークンを検証し、有効なら新パスワードへ更新して used_at を記録する。
 * 戻り値 ok=false のときは message に利用者向けの理由（平易な日本語）。
 */
export async function consumeResetToken(
  token: string,
  newPassword: string
): Promise<{ ok: boolean; message: string }> {
  await ensurePasswordResetSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, user_id, expires_at, used_at
    FROM password_reset_tokens
    WHERE token_hash = ${hashResetToken(token)}
    LIMIT 1`;
  const row = rows[0] as
    | { id: string; user_id: string; expires_at: string | Date; used_at: string | Date | null }
    | undefined;
  if (!row || row.used_at) {
    return { ok: false, message: "このリンクはすでに使用済みか、無効です。もう一度メール送信からやり直してください。" };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, message: "このリンクは有効期限（60分）が切れています。もう一度メール送信からやり直してください。" };
  }
  // 既存の登録処理（authDb.createUser）と同じ bcrypt でハッシュ化
  const passwordHash = await bcrypt.hash(newPassword, 12);
  // パスワード設定成功で pending も解除（招待完了）。通常のリセットでも false のままで無害。
  await sql`UPDATE users SET password_hash = ${passwordHash}, pending = false WHERE id = ${row.user_id}`;
  await sql`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${row.id}`;
  return { ok: true, message: "パスワードを変更しました。" };
}
