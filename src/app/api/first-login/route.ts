import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSql } from "@/lib/neon";
import { ensureAuthSchema } from "@/lib/authDb";

export const runtime = "nodejs";

/**
 * POST /api/first-login — 初回ログイン時のパスワード設定。
 * ポータルから社員番号（login_id）で発行されたアカウント（pending=true・パスワード未設定）に、
 * 本人がはじめに使うパスワードを設定して pending を解除する。
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const loginId = (body.loginId ?? "").toString().trim();
    const password = (body.password ?? "").toString();

    // login_id 列・pending 列などを冪等に整えてから処理する（一時失敗では止めない）
    try {
      await ensureAuthSchema();
    } catch {
      /* スキーマ初期化の一時失敗ではパスワード設定自体は止めない */
    }

    const sql = getSql();
    // authorize() と同じ二段検索: ①社員番号（login_id）→ ②従来のメールアドレス（移行互換）
    let rows: Record<string, unknown>[];
    try {
      rows = await sql`SELECT id, pending FROM users WHERE login_id = ${loginId} LIMIT 1`;
      if (rows.length === 0 && loginId) {
        rows = await sql`SELECT id, pending FROM users WHERE email = ${loginId.toLowerCase()} LIMIT 1`;
      }
    } catch {
      rows = [];
    }
    const user = rows[0] as { id: string; pending: boolean } | undefined;
    if (!loginId || !user) {
      return NextResponse.json(
        { error: "該当するアカウントが見つかりません。社員番号をご確認ください。" },
        { status: 404 }
      );
    }
    if (!user.pending) {
      return NextResponse.json(
        {
          error:
            "このアカウントは既にパスワード設定済みです。ログイン画面からログインしてください。パスワードを忘れた場合は管理者に再発行を依頼してください。",
        },
        { status: 409 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "パスワードは8文字以上で設定してください。" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await sql`UPDATE users SET password_hash = ${passwordHash}, pending = false WHERE id = ${user.id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[first-login] error:", err);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }
}
