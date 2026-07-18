"use client";

import { useEffect, useState } from "react";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

/**
 * 記録フォーム用の作業者セレクト（name="operator" で FormData に載る）。
 * /api/workers の名簿から自分の名前を選ぶ。名簿が空のときは何も表示せず、
 * 従来どおりログイン中のアカウント名で記録される（サーバー側フォールバック）。
 */
export default function OperatorSelect() {
  const [workers, setWorkers] = useState<string[]>([]);

  useEffect(() => {
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
  }, []);

  if (workers.length === 0) return null;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600">作業者</label>
      <select name="operator" defaultValue="" className={inputCls}>
        <option value="">選択してください</option>
        {workers.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-400">
        未選択の場合はログイン中のアカウント名で記録します。作業者は設定ページの「作業者管理」で登録できます。
      </p>
    </div>
  );
}
