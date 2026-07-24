"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

/**
 * 記録フォーム用の作業者セレクト（name="operator" で FormData に載る）。
 * - 作業者（role='worker'）でログイン中：本人名で固定表示（選択不可。サーバー側でも本人名を強制）。
 * - 管理者・一般：/api/workers の作業者アカウント一覧から代理入力できる。
 *   一覧が空のときは何も表示せず、従来どおりログイン中のアカウント名で記録される（サーバー側フォールバック）。
 */
export default function OperatorSelect() {
  const { data: session, status } = useSession();
  const isWorker = session?.user?.role === "worker";
  const [workers, setWorkers] = useState<string[]>([]);

  useEffect(() => {
    if (status === "loading" || isWorker) return; // 本人固定なら一覧の取得は不要
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workers");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setWorkers(
            (Array.isArray(data.workers) ? data.workers : []).map(
              (w: { name: string }) => w.name
            )
          );
        }
      } catch {
        /* 取得失敗時は従来どおりアカウント名で記録 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, isWorker]);

  if (status === "loading") return null;

  // 作業者本人：担当者は本人で固定（送信値もサーバー側で本人名に強制される）
  if (isWorker) {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">担当者</label>
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          担当者: {session?.user?.name ?? ""}（本人）
        </p>
      </div>
    );
  }

  if (workers.length === 0) return null;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600">
        作業者（代理入力可）
      </label>
      <select name="operator" defaultValue="" className={inputCls}>
        <option value="">選択してください</option>
        {workers.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-400">
        未選択の場合はログイン中のアカウント名で記録します。作業者アカウントはポータルのユーザー設定で管理します。
      </p>
    </div>
  );
}
