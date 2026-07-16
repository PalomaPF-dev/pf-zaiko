"use client";

import { useActionState } from "react";
import { PackageCheck, CheckCircle2, XCircle } from "lucide-react";
import type { ActionResult } from "@/lib/actions";

/**
 * 未出庫明細を一括確定（出庫）するボタン。確認ダイアログ＋結果をインライン表示。
 * QR照合をスキップする例外操作なので、アウトラインの副次ボタンとして表示する（主導線は「照合出庫」）。
 */
export default function BulkIssueButton({
  orderId,
  remaining,
  action,
}: {
  orderId: string;
  remaining: number;
  action: (orderId: string) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async () => action(orderId),
    null
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <form
        action={formAction}
        onSubmit={(e) => {
          if (
            !window.confirm(
              `QRの照合をスキップして、未出庫の ${remaining} 件をまとめて出庫（確定）します。\n現物・棚の確認は行われません。よろしいですか？`
            )
          )
            e.preventDefault();
        }}
      >
        <button
          type="submit"
          disabled={pending || remaining === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <PackageCheck className="h-4 w-4" />
          {pending ? "出庫中…" : "照合せず一括確定"}
        </button>
      </form>
      {state && (
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${state.ok ? "text-fuchsia-700" : "text-red-600"}`}>
          {state.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {state.message}
        </span>
      )}
    </div>
  );
}
