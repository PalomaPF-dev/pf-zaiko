"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageBody />
    </Suspense>
  );
}

/** callbackUrl は自サイト内パスのみ許可（オープンリダイレクト防止）。 */
function safeCallbackUrl(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

function LoginPageBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
  const showDeletedNotice = searchParams.get("deleted") === "1";
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // フィールド名 email は互換のため（値は社員番号。旧メールアドレスでもログイン可能）
    const res = await signIn("credentials", { email: loginId, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      // authorize が投げた具体的なメッセージ（パスワード未設定など）はそのまま表示する
      setError(
        res.error === "CredentialsSignin"
          ? "社員番号またはパスワードが違います。"
          : res.error
      );
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  /** 「ログインせずにデモを見る」: デモ会社を用意して即サインインする（社内紹介用）。 */
  async function startDemo() {
    setError("");
    setDemoLoading(true);
    try {
      const res = await fetch("/api/demo", { method: "POST" });
      if (!res.ok) throw new Error("demo setup failed");
      const creds = (await res.json()) as { email: string; password: string };
      const login = await signIn("credentials", {
        email: creds.email,
        password: creds.password,
        redirect: false,
      });
      if (login?.error) throw new Error(login.error);
      router.push("/");
      router.refresh();
    } catch {
      setError("デモの準備に失敗しました。少し時間をおいて再度お試しください。");
      setDemoLoading(false);
    }
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
            <p className="mt-1 text-sm text-[#707070]">在庫管理システム</p>
          </div>

          {showDeletedNotice && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>アカウントを削除しました。ご利用ありがとうございました。</span>
            </div>
          )}
          <div className="rounded-2xl border border-[#e5e5e5] bg-white px-8 py-8">
            <h2 className="text-lg font-semibold text-[#333333]">ログイン</h2>
            <div className="mb-6 mt-2 h-[3px] w-9 rounded-full bg-[#d44fe6]" />

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#333333]">社員番号</label>
                <input
                  type="text"
                  autoComplete="username"
                  required
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className="w-full rounded-lg border border-[#e5e5e5] px-3 py-2 text-sm focus:border-[#d44fe6] focus:outline-none focus:ring-1 focus:ring-[#d44fe6]"
                  placeholder="例: 12345（管理者は admin）"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#333333]">パスワード</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-[#e5e5e5] px-3 py-2 text-sm focus:border-[#d44fe6] focus:outline-none focus:ring-1 focus:ring-[#d44fe6]"
                  placeholder="••••••••"
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading || demoLoading}
                className="w-full rounded-lg bg-[#d44fe6] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ae41bd] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "ログイン中…" : "ログイン"}
              </button>
            </form>

            {/* 社内紹介用: サンプルデータ入りのデモ会社にワンクリックで入る（実データには影響しない） */}
            <button
              type="button"
              onClick={startDemo}
              disabled={loading || demoLoading}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2.5 text-sm font-semibold text-[#555555] transition-colors hover:bg-[#f7f7f5] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {demoLoading ? (
                <>
                  <span
                    aria-hidden
                    className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#c9c9c9] border-t-transparent"
                  />
                  <span className="text-xs">デモの準備をしています（最大1分ほどかかります）</span>
                </>
              ) : (
                "ログインせずにデモを見る"
              )}
            </button>

            {/* ポータルで発行された社員番号アカウント（pending）の初回パスワード設定 */}
            <div className="mt-4 rounded-lg border border-[#d44fe6]/40 bg-[#faf5fb] px-3 py-2.5 text-center text-sm">
              <Link href="/first-login" className="font-semibold text-[#d44fe6] hover:underline">
                初めてログインする方はこちら（パスワード設定）
              </Link>
            </div>

            <div className="mt-3 text-center text-sm">
              <Link href="/password-reset" className="text-[#d44fe6] hover:underline">
                パスワードをお忘れの方はこちら
              </Link>
              <p className="mt-1 text-xs text-[#707070]">
                メール未登録の方は管理者にお問い合わせください
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-[#707070]">
            QRラベルで入出庫・受払履歴・棚卸・在庫アラートを一元管理する社内ツール
          </p>
          <div className="mt-3 text-center">
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
