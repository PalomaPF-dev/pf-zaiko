import Link from "next/link";
import { Truck, Plus } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { listIssueOrders } from "@/lib/db";
import { currentScope } from "@/lib/scope";
import { formatDate } from "@/lib/format";
import { ISSUE_ORDER_STATUS_LABEL, type IssueOrderStatus } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<IssueOrderStatus, string> = {
  open: "bg-sky-50 text-sky-700 ring-sky-600/20",
  picking: "bg-amber-50 text-amber-700 ring-amber-600/20",
  done: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-500/20",
};

export default async function IssueOrdersPage() {
  const session = await requireEntitledSession();

  const { siteId } = await currentScope();

  let orders;
  try {
    orders = await listIssueOrders(session.companyId, { siteId });
  } catch (e) {
    console.error("[issue-orders]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="出庫" />
        <DbErrorState />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="出庫"
        description="出庫する部材を明細に追加し、確定前に一覧（出庫指示リスト）で確認・印刷してから出庫します。"
        action={
          <Link
            href="/issue-orders/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
          >
            <Plus className="h-4 w-4" />
            新規出庫
          </Link>
        }
      />

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Truck className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">出庫はまだありません。</p>
          <Link href="/issue-orders/new" className="mt-3 inline-block text-sm font-medium text-fuchsia-600 hover:underline">
            最初の出庫を作成する
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/issue-orders/${o.id}`}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-800">{o.orderNo}</span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${STATUS_STYLE[o.status]}`}>
                    {ISSUE_ORDER_STATUS_LABEL[o.status]}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-400">
                  {o.customer ?? "得意先未設定"}
                  {o.shipGroup ? ` ・ ${o.shipGroup}` : ""}
                  {o.shipDate ? ` ・ 出荷 ${formatDate(o.shipDate)}` : ""}
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="text-xs text-slate-400">出庫進捗</div>
                <div className="font-bold tabular-nums text-slate-700">
                  {o.issuedCount}/{o.lineCount}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
