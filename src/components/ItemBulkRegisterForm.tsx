"use client";

import { useRef, useState } from "react";
import { PackagePlus, Trash2, Undo2 } from "lucide-react";

/**
 * 資材W/F 品目カタログの一括操作フォーム（登録／削除／元に戻す）。
 *
 * カタログには役務・費用系（保守・処理・運賃など）も含まれるため、
 * 現物在庫を持つ品目はチェックして品目マスタへ「一括登録」、
 * 在庫管理に不要な品目は「削除」で一覧から外す（削除済みフィルタから復元可）。
 *
 * 一覧テーブル（サーバー側で描画）を children として受け取り、その中の
 * `input[name="codes"]` を数えて選択件数と全選択を面倒みる。
 * ボタンごとに Server Action を formAction で切り替える。
 */
export default function ItemBulkRegisterForm({
  mode,
  registerAction,
  deleteAction,
  restoreAction,
  selectableCount,
  children,
}: {
  /** active=通常一覧（登録・削除） / deleted=削除済み一覧（元に戻す） */
  mode: "active" | "deleted";
  registerAction?: (fd: FormData) => void | Promise<void>;
  deleteAction?: (fd: FormData) => void | Promise<void>;
  restoreAction?: (fd: FormData) => void | Promise<void>;
  /** このページで選択できる行数（active=未登録の品目数 / deleted=全行） */
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

  /** ボタン押下時の確認。キャンセルなら送信させない（formAction 単位で発火）。 */
  const guard = (message: (n: number) => string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (count === 0 || !window.confirm(message(count))) e.preventDefault();
  };

  return (
    <form ref={formRef} onChange={recount}>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
        <label className="inline-flex items-center gap-2 font-medium text-slate-600">
          <input
            type="checkbox"
            checked={selectableCount > 0 && count === selectableCount}
            disabled={selectableCount === 0}
            onChange={(e) => toggleAll(e.currentTarget.checked)}
            className="h-4 w-4 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500"
          />
          このページを選択（{selectableCount}件）
        </label>
        <span className="text-slate-500">
          選択中 <b className="tabular-nums text-slate-800">{count}</b> 品目
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {mode === "active" && deleteAction && (
            <button
              type="submit"
              formAction={deleteAction}
              disabled={count === 0}
              onClick={guard((n) => `選択した ${n} 品目をカタログから削除します。\n（「削除済み」フィルタからいつでも元に戻せます）`)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              選択を削除
            </button>
          )}
          {mode === "active" && registerAction && (
            <button
              type="submit"
              formAction={registerAction}
              disabled={count === 0}
              onClick={guard((n) => `選択した ${n} 品目を品目マスタに登録します。よろしいですか？`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PackagePlus className="h-4 w-4" />
              品目マスタに一括登録
            </button>
          )}
          {mode === "deleted" && restoreAction && (
            <button
              type="submit"
              formAction={restoreAction}
              disabled={count === 0}
              onClick={guard((n) => `選択した ${n} 品目をカタログに戻します。よろしいですか？`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Undo2 className="h-4 w-4" />
              選択を元に戻す
            </button>
          )}
        </div>
      </div>

      {children}
    </form>
  );
}
