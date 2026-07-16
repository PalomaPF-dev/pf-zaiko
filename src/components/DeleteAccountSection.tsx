"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { AlertTriangle } from "lucide-react";

/**
 * 設定ページ最下部の「危険な操作」ゾーン（アカウント削除＝退会）。
 * 確認欄に「削除」と入力しないと実行ボタンが有効にならない。
 */
export default function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canDelete = confirmText === "削除";

  async function onDelete() {
    if (!canDelete || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "削除に失敗しました。時間をおいて再度お試しください。");
        setBusy(false);
        return;
      }
      // 完了後はサインアウトしてログイン画面へ（削除完了の表示付き）
      await signOut({ callbackUrl: "/login?deleted=1" });
    } catch {
      setError("通信エラーが発生しました。時間をおいて再度お試しください。");
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 rounded-2xl border-2 border-red-300 bg-red-50/50 p-5">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-red-700">
        <AlertTriangle className="h-4 w-4" />
        危険な操作
      </h2>
      <p className="mb-3 text-xs text-red-600/80">
        アカウントの削除（退会）は元に戻せません。十分にご注意ください。
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          アカウントを削除（退会）
        </button>
      ) : (
        <div className="rounded-xl border border-red-200 bg-white p-4">
          <p className="text-sm font-semibold text-red-700">本当に削除しますか？</p>
          <ul className="mt-2 list-disc pl-5 text-xs leading-relaxed text-slate-600">
            <li>この操作は<strong>元に戻せません</strong>。すべてのデータが削除されます。</li>
            <li>あなたが会社で唯一のユーザーの場合、商品・在庫・受払履歴など会社の全データも削除されます。</li>
            <li>他にユーザーがいる場合は、あなたのユーザーのみ削除されます（唯一の管理者は先に他の管理者の設定が必要です）。</li>
          </ul>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              確認のため、下の欄に「<span className="font-bold text-red-600">削除</span>」と入力してください
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="削除"
              className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onDelete}
              disabled={!canDelete || busy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "削除中…" : "アカウントを完全に削除する"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmText("");
                setError("");
              }}
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              やめる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
