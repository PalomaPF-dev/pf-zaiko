"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";

/**
 * 品目マスタの一括削除フォーム。一括登録のやり直し（間違えて登録した品目の整理）用。
 * 受払履歴・入荷/出庫明細のある品目はサーバー側でスキップされる（証跡保護）。
 * 一覧テーブルを children として受け取り、その中の `input[name="ids"]` を数える。
 */
export default function ProductBulkDeleteForm({
  action,
  rowCount,
  children,
}: {
  action: (fd: FormData) => void | Promise<void>;
  /** このページで選択できる品目数 */
  rowCount: number;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [count, setCount] = useState(0);

  const boxes = () =>
    Array.from(formRef.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ?? []);

  const recount = () => setCount(boxes().filter((el) => el.checked).length);

  const toggleAll = (checked: boolean) => {
    for (const el of boxes()) el.checked = checked;
    recount();
  };

  return (
    <form
      ref={formRef}
      action={action}
      onChange={recount}
      onSubmit={(e) => {
        if (
          count === 0 ||
          !window.confirm(
            `選択した ${count} 品目を品目マスタから削除します。\n受払履歴（入荷・出庫などの記録）がある品目はスキップされます。よろしいですか？`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
        <label className="inline-flex items-center gap-2 font-medium text-slate-600">
          <input
            type="checkbox"
            checked={rowCount > 0 && count === rowCount}
            disabled={rowCount === 0}
            onChange={(e) => toggleAll(e.currentTarget.checked)}
            className="h-4 w-4 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500"
          />
          このページを選択（{rowCount}件）
        </label>
        <span className="text-slate-500">
          選択中 <b className="tabular-nums text-slate-800">{count}</b> 品目
        </span>
        <button
          type="submit"
          disabled={count === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          選択を削除
        </button>
      </div>

      {children}
    </form>
  );
}
