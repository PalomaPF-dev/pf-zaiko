"use client";

import { useRef, useState } from "react";
import { PackagePlus } from "lucide-react";

/**
 * 資材W/F 品目カタログの一括登録フォーム。
 *
 * カタログには役務・費用系（保守・処理・運賃など）も含まれるため全件は入れず、
 * 現物在庫を持つ品目だけをチェックして品目マスタへ登録してもらう。
 * 一覧テーブル（サーバー側で描画）を children として受け取り、その中の
 * `input[name="codes"]` を数えて選択件数と全選択を面倒みる。
 */
export default function ItemBulkRegisterForm({
  action,
  selectableCount,
  children,
}: {
  action: (fd: FormData) => void | Promise<void>;
  /** このページで選択できる（＝未登録の）品目数 */
  selectableCount: number;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [count, setCount] = useState(0);

  const boxes = () =>
    Array.from(formRef.current?.querySelectorAll<HTMLInputElement>('input[name="codes"]') ?? []).filter(
      (el) => !el.disabled
    );

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
        if (count === 0) {
          e.preventDefault();
          return;
        }
        if (!window.confirm(`選択した ${count} 品目を品目マスタに登録します。よろしいですか？`)) {
          e.preventDefault();
        }
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
        <label className="inline-flex items-center gap-2 font-medium text-slate-600">
          <input
            type="checkbox"
            checked={selectableCount > 0 && count === selectableCount}
            disabled={selectableCount === 0}
            onChange={(e) => toggleAll(e.currentTarget.checked)}
            className="h-4 w-4 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500"
          />
          このページの未登録をすべて選択（{selectableCount}件）
        </label>
        <span className="text-slate-500">
          選択中 <b className="tabular-nums text-slate-800">{count}</b> 品目
        </span>
        <button
          type="submit"
          disabled={count === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PackagePlus className="h-4 w-4" />
          品目マスタに一括登録
        </button>
      </div>

      {children}
    </form>
  );
}
