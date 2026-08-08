"use client";

import { useRef, useState } from "react";
import { Tag, Trash2 } from "lucide-react";

/**
 * 品目マスタの一括操作フォーム（分類の設定／削除）。
 *
 * - 分類の設定: 選択した品目の分類をまとめて付け替える（カタログから一括登録した
 *   品目の分類分け用）。空欄で実行すると未分類に戻す。
 * - 削除: 一括登録のやり直し用。受払履歴・入荷/出庫明細のある品目はサーバー側で
 *   スキップされる（証跡保護）。
 *
 * 一覧テーブルを children として受け取り、その中の `input[name="ids"]` を数える。
 * ボタンごとに Server Action を formAction で切り替える。
 */
export default function ProductBulkDeleteForm({
  deleteAction,
  categoryAction,
  categorySuggestions = [],
  rowCount,
  children,
}: {
  deleteAction: (fd: FormData) => void | Promise<void>;
  categoryAction: (fd: FormData) => void | Promise<void>;
  /** 既存の分類（入力欄のサジェスト） */
  categorySuggestions?: string[];
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

  /** ボタン押下時の確認。キャンセルなら送信させない（formAction 単位で発火）。 */
  const guard = (message: (n: number) => string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (count === 0 || !window.confirm(message(count))) e.preventDefault();
  };

  const categoryValue = () => {
    const el = formRef.current?.elements.namedItem("category");
    return el instanceof HTMLInputElement ? el.value.trim() : "";
  };

  return (
    <form ref={formRef} onChange={recount}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Tag className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              name="category"
              placeholder="分類名（例 消耗品）"
              list="bulk-category-options"
              className="w-36 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 sm:w-44"
            />
            <datalist id="bulk-category-options">
              {categorySuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <button
              type="submit"
              formAction={categoryAction}
              disabled={count === 0}
              onClick={guard((n) => {
                const cat = categoryValue();
                return cat
                  ? `選択した ${n} 品目の分類を「${cat}」に設定します。よろしいですか？`
                  : `分類名が空欄です。選択した ${n} 品目を未分類に戻します。よろしいですか？`;
              })}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              分類を設定
            </button>
          </div>
          <button
            type="submit"
            formAction={deleteAction}
            disabled={count === 0}
            onClick={guard(
              (n) =>
                `選択した ${n} 品目を品目マスタから削除します。\n受払履歴（入荷・出庫などの記録）がある品目はスキップされます。よろしいですか？`
            )}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            選択を削除
          </button>
        </div>
      </div>

      {children}
    </form>
  );
}
