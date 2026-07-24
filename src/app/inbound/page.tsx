import Link from "next/link";
import { ArrowDownToLine, Plus } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { listReceipts } from "@/lib/db";
import { currentScope } from "@/lib/scope";
import { formatDate } from "@/lib/format";
import { RECEIPT_STATUS_LABEL, type ReceiptStatus } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<ReceiptStatus, string> = {
  open: "bg-amber-50 text-amber-700 ring-amber-600/20",
  done: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-500/20",
};

export default async function InboundPage() {
  const session = await requireEntitledSession();

  const { siteId } = await currentScope();

  let receipts;
  try {
    receipts = await listReceipts(session.companyId, { siteId });
  } catch (e) {
    console.error("[inbound]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="入荷（受入）" />
        <DbErrorState />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="入荷（受入）"
        description="納入場所を指定し、商品マスタから検索して入荷を登録します。登録後に商品ラベルを発行・一覧をPDF化できます。ロケーションは次の「入庫（棚入れ）」で付与します。"
        action={
          <Link
            href="/inbound/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
          >
            <Plus className="h-4 w-4" />
            新規入荷
          </Link>
        }
      />

      {receipts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <ArrowDownToLine className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">入荷（受入）はまだありません。</p>
          <Link href="/inbound/new" className="mt-3 inline-block text-sm font-medium text-fuchsia-600 hover:underline">
            最初の入荷を登録する
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {receipts.map((r) => (
            <Link
              key={r.id}
              href={`/inbound/${r.id}`}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-800">{r.receiptNo}</span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${STATUS_STYLE[r.status]}`}>
                    {RECEIPT_STATUS_LABEL[r.status]}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-400">
                  {r.deliverTo ? `納入場所 ${r.deliverTo}` : "納入場所未設定"} ・ {formatDate(r.createdAt)}
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="text-xs text-slate-400">未入庫 / 受入</div>
                <div className="font-bold tabular-nums text-slate-700">
                  <span className={r.pendingQty > 0 ? "text-amber-600" : "text-slate-400"}>{r.pendingQty.toLocaleString()}</span>
                  {" / "}
                  {r.totalQty.toLocaleString()}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
