"use client";

import { useState } from "react";
import Link from "next/link";

/** パスワード再設定（メール入力→再設定リンクを送信）。 */
export default function PasswordResetPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "送信に失敗しました。時間をおいて再度お試しください。");
        setLoading(false);
        return;
      }
      setSent(true);
    } catch {
      setError("通信エラーが発生しました。時間をおいて再度お試しください。");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f5]">
      <div className="h-1 shrink-0 bg-[#d44fe6]" />
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" className="mx-auto mb-4 h-16 w-16 rounded-2xl" />
            <p className="text-[11px] tracking-[0.08em] text-[#707070]">生産・調達統括本部</p>
            <h1 className="mt-1 text-2xl font-bold text-[#333333]">PF在庫管理</h1>
            <p className="mt-1 text-sm text-[#707070]">パスワードの再設定</p>
          </div>

          <div className="rounded-2xl border border-[#e5e5e5] bg-white px-8 py-8">
            {sent ? (
              <div className="space-y-4 text-sm leading-relaxed text-[#333333]">
                <p className="font-semibold text-[#333333]">メールを送信しました。</p>
                <p>
                  ご登録のメールアドレス宛てに、パスワード再設定のご案内をお送りしました。
                  メールに書かれたリンクを<strong>60分以内</strong>に開いて、新しいパスワードを設定してください。
                </p>
                <p className="text-xs text-[#707070]">
                  ※数分待ってもメールが届かない場合は、メールアドレスの間違いや、迷惑メールフォルダに入っていないかをご確認ください。
                </p>
                <p className="pt-2 text-center">
                  <Link href="/login" className="font-medium text-[#d44fe6] hover:underline">
                    ログイン画面に戻る
                  </Link>
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-[#333333]">パスワードをお忘れの方</h2>
                <div className="mt-2 h-[3px] w-9 rounded-full bg-[#d44fe6]" />
                <p className="mt-3 mb-5 text-sm leading-relaxed text-[#707070]">
                  ご登録のメールアドレスを入力して「送信」を押してください。
                  パスワードを再設定するためのリンクをメールでお送りします。
                </p>
                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#333333]">メールアドレス</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-[#e5e5e5] px-3 py-2 text-sm focus:border-[#d44fe6] focus:outline-none focus:ring-1 focus:ring-[#d44fe6]"
                      placeholder="you@example.com"
                    />
                  </div>
                  {error && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-[#d44fe6] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ae41bd] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "送信中…" : "再設定メールを送信"}
                  </button>
                </form>
                <p className="mt-5 text-center text-sm">
                  <Link href="/login" className="font-medium text-[#d44fe6] hover:underline">
                    ログイン画面に戻る
                  </Link>
                </p>
              </>
            )}
          </div>
          <div className="mt-4 text-center">
            <a
              href="https://portal.paloma-pf.com"
              className="text-sm text-[#707070] transition-colors hover:text-[#d44fe6]"
            >
              ← ポータルへ戻る
            </a>
          </div>
        </div>
      </div>
      <footer className="bg-[#323232] py-4 text-center text-[11px] tracking-[0.08em] text-white/75">
        株式会社パロマ 生産・調達統括本部
      </footer>
    </div>
  );
}
