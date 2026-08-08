"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, Trash2, CheckCircle2 } from "lucide-react";
import ConfirmForm from "@/components/ConfirmForm";
import { deleteReceiptLineAction } from "@/lib/actions";
import type { ReceiptLineWithMeta } from "@/lib/types";

/** ①入荷 明細テーブル。レ点でラベル発行対象を選び、品目ラベルを発行する。 */
export default function ReceiptLineTable({
  receiptId,
  lines,
  editable,
}: {
  receiptId: string;
  lines: ReceiptLineWithMeta[];
  editable: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === lines.length ? new Set() : new Set(lines.map((l) => l.id))));
  }
  function issueLabels() {
    if (selected.size === 0) return;
    router.push(`/inbound/${receiptId}/labels?ids=${[...selected].join(",")}`);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold text-slate-700">入庫一覧（受入明細）</div>
        <button
          type="button"
          onClick={issueLabels}
          disabled={selected.size === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:opacity-50"
        >
          <Tag className="h-4 w-4" />
          選択した品目ラベルを発行{selected.size > 0 ? `（${selected.size}）` : ""}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={lines.length > 0 && selected.size === lines.length}
                  onChange={toggleAll}
                  aria-label="全選択"
                  className="h-4 w-4 accent-fuchsia-600"
                />
              </th>
              <th className="px-3 py-2.5">行</th>
              <th className="px-3 py-2.5">図番 / 品名</th>
              <th className="px-3 py-2.5">仕入先</th>
              <th className="px-3 py-2.5 text-right">荷姿</th>
              <th className="px-3 py-2.5 text-right">受入数</th>
              <th className="px-3 py-2.5 text-right">未入庫</th>
              <th className="px-3 py-2.5">ラベル</th>
              {editable && <th className="px-3 py-2.5"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => {
              const pending = l.qty - l.qtyPutaway;
              const pack = l.boxCount && l.perBox ? `${l.boxCount}箱 × ${l.perBox}` : "—";
              return (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      onChange={() => toggle(l.id)}
                      aria-label="ラベル発行対象"
                      className="h-4 w-4 accent-fuchsia-600"
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-400">{l.seq}</td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs text-slate-500">{l.drawingNo}</div>
                    <div className="text-slate-700">{l.productName}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{l.supplier ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-xs text-slate-500">{pack}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-800">
                    {l.qty.toLocaleString()}
                    <span className="ml-0.5 text-xs font-normal text-slate-400">{l.unit}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {pending > 0 ? (
                      <span className="font-semibold text-amber-600">{pending.toLocaleString()}</span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-fuchsia-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        入庫済
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {l.labelPrinted ? (
                      <span className="text-xs font-medium text-slate-500">発行済</span>
                    ) : (
                      <span className="text-xs text-slate-300">未</span>
                    )}
                  </td>
                  {editable && (
                    <td className="px-3 py-2">
                      {l.qtyPutaway === 0 && (
                        <ConfirmForm
                          action={deleteReceiptLineAction.bind(null, receiptId, l.id)}
                          message={`「${l.productName}」の明細を削除します。よろしいですか？`}
                        >
                          <button className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" title="削除">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </ConfirmForm>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={editable ? 9 : 8} className="px-4 py-8 text-center text-sm text-slate-400">
                  明細がありません。上のフォームから入荷した品目を追加してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
