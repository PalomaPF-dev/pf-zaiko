import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * ログイン画面の「管理者にお問い合わせください」フォームからの送信を受け付ける公開API。
 * セッション不要（未ログインユーザーが使う）。ハニーポット＋レート制限で濫用を抑止。
 */

const CONTACT_TO = "info@paloma-pf.com";

// 簡易レート制限（同一IPで10分5回。in-memory＝インスタンス単位のベストエフォート）
const RL = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const WIN = 10 * 60 * 1000;
  const MAX = 5;
  const arr = (RL.get(key) ?? []).filter((t) => now - t < WIN);
  if (arr.length >= MAX) {
    RL.set(key, arr);
    return true;
  }
  arr.push(now);
  RL.set(key, arr);
  return false;
}

export async function POST(req: Request) {
  try {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const body = await req.json().catch(() => ({}));

    // ハニーポット（bot対策）: 画面に出ない website 欄に入力があれば送信せず成功を装う
    const website = (body.website ?? "").toString();
    if (website) return NextResponse.json({ ok: true });

    const name = (body.name ?? "").toString().trim();
    const loginId = (body.loginId ?? "").toString().trim();
    const message = (body.message ?? "").toString().trim();

    if (!message || message.length > 2000) {
      return NextResponse.json(
        { error: "お問い合わせ内容を入力してください" },
        { status: 400 }
      );
    }
    if (name.length > 100 || loginId.length > 100) {
      return NextResponse.json(
        { error: "お名前・社員番号は100文字以内で入力してください" },
        { status: 400 }
      );
    }
    if (rateLimited(`ip:${ip}`)) {
      return NextResponse.json(
        { error: "送信が多すぎます。10分ほど時間をおいて再度お試しください。" },
        { status: 429 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "send-unavailable" }, { status: 503 });
    }

    const appUrl = (process.env.APP_URL || "https://zaiko.paloma-pf.com").replace(/\/+$/, "");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${(process.env.RESEND_API_KEY || "").trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:
          process.env.CONTACT_FROM ||
          process.env.ALERT_MAIL_FROM ||
          "PF在庫管理 <noreply@paloma-pf.com>",
        to: [CONTACT_TO],
        subject: "【PF在庫管理】ログイン画面からのお問い合わせ",
        text:
          `ログイン画面のお問い合わせフォームから送信されました。\n\n` +
          `名前: ${name || "（未入力）"}\n` +
          `社員番号: ${loginId || "（未入力）"}\n\n` +
          `--- お問い合わせ内容 ---\n${message}\n\n` +
          `送信元アプリURL: ${appUrl}/login\n\n` +
          `──\nPF在庫管理（自動送信）\n`,
        // MAIL_REPLY_TO（設定時のみ）を既定の Reply-To として付与
        ...(process.env.MAIL_REPLY_TO?.trim() ? { reply_to: process.env.MAIL_REPLY_TO.trim() } : {}),
      }),
    });
    if (!res.ok) {
      const t = (await res.text().catch(() => "")).slice(0, 200);
      console.warn("[contact-admin] Resend error", res.status, t);
      return NextResponse.json(
        { error: "送信に失敗しました。時間をおいて再度お試しください。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact-admin] error:", err);
    return NextResponse.json(
      { error: "送信に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }
}
