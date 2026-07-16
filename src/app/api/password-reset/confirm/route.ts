import { NextResponse } from "next/server";
import { consumeResetToken } from "@/lib/passwordReset";

export const runtime = "nodejs";

/** POST /api/password-reset/confirm — トークンを検証して新しいパスワードに更新。 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = (body.token ?? "").toString().trim();
    const password = (body.password ?? "").toString();

    if (!token) {
      return NextResponse.json(
        { message: "リンクが正しくありません。メールのリンクをもう一度開いてください。" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json({ message: "パスワードは8文字以上にしてください。" }, { status: 400 });
    }

    const result = await consumeResetToken(token, password);
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[password-reset/confirm] error:", err);
    return NextResponse.json(
      { message: "サーバーエラーが発生しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }
}
