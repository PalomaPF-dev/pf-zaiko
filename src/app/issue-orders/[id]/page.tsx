import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer, Plus, ScanLine, Trash2, XCircle } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getIssueOrder, listIssueOrderLines, listProducts, listLocations } from "@/lib/db";
import { resolveCurrentWorkplace } from "@/lib/workplace";
import {
  addIssueOrderLineAction,
  deleteIssueOrderLineAction,
  issueOrderLineAction,
  issueAllOrderLinesAction,
  cancelIssueOrderAction,
} from "@/lib/actions";
import { formatDate } from "@/lib/format";
import { ISSUE_ORDER_STATUS_LABEL } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import IssueLineForm from "@/components/IssueLineForm";
import ConfirmForm from "@/components/ConfirmForm";
import PickVerify from "@/components/PickVerify";
import BulkIssueButton from "@/components/BulkIssueButton";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

export default async function IssueOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { companyId } = await requireEntitledSession();
  const { id } = await params;

  let order, lines, products, locations;
  try {
    order = await getIssueOrder(companyId, id);
    if (!order) notFound();
    const wp = await resolveCurrentWorkplace(companyId);
    [lines, products, locations] = await Promise.all([
      listIssueOrderLines(companyId, id),
      listProducts(companyId, { activeOnly: true }),
      listLocations(companyId, { workplaceId: wp?.id ?? null }),
    ]);
  } catch (e) {
    console.error("[issue-order detail]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="出庫" />
        <DbErrorState />
      </div>
    );
  }

  const editable = order.status === "open" || order.status === "picking";
  const remaining = lines.filter((l) => l.qtyIssued < l.qtyInstructed).length;
  const addLine = addIssueOrderLineAction.bind(null, id);

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link href="/issue-orders" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        出庫一覧に戻る
      </Link>
      <PageHeader
        title={order.orderNo}
        description={[order.customer, order.shipGroup, order.shipDate ? `出荷 ${formatDate(order.shipDate)}` : null]
          .filter(Boolean)
          .join(" ・ ")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
              {ISSUE_ORDER_STATUS_LABEL[order.status]}
            </span>
            <Link
              href={`/issue-orders/${id}/print`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              出庫指示リスト
            </Link>
            {editable && (
              <ConfirmForm action={cancelIssueOrderAction.bind(null, id)} message="この出庫を中止します。よろしいですか？">
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                  <XCircle className="h-4 w-4" />
                  中止
                </button>
              </ConfirmForm>
            )}
          </div>
        }
      />

      {/* 確定前の一覧確認・一括出庫 */}
      {editable && lines.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/60 p-4">
          <div className="text-sm text-slate-700">
            <span className="font-semibold">確定前の一覧確認</span>
            <span className="ml-2 text-xs text-slate-500">
              未出庫 {remaining} 件。<b>出庫指示リストを印刷</b>し、<b>ロケーション近い順</b>にピッキング。各明細の「照合出庫」で
              <b>指示・商品ラベル・ロケラベルの3つのQR</b>を照合すると出荷可能になります。
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="#order-lines"
              className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
            >
              <ScanLine className="h-4 w-4" />
              照合出庫をはじめる
            </a>
            <BulkIssueButton orderId={id} remaining={remaining} action={issueAllOrderLinesAction} />
          </div>
        </div>
      )}

      {/* 明細追加 */}
      {editable && (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <Plus className="h-4 w-4" />
            出庫する部材を追加（在庫状況から選択・箱数×入り数で指定）
          </h2>
          <IssueLineForm
            products={products.map((p) => ({ id: p.id, drawingNo: p.drawingNo, name: p.name, unit: p.unit, lotSize: p.lotSize }))}
            locations={locations.map((l) => ({ id: l.id, code: l.code }))}
            action={addLine}
          />
        </div>
      )}

      {/* 明細（ロケーション近い順） */}
      <div id="order-lines" className="mb-1.5 flex scroll-mt-20 items-center gap-1.5 text-xs text-slate-500">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">ロケーション近い順</span>
        効率よくピッキングできるよう、ロケーション順に並んでいます。
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-2.5">行</th>
              <th className="px-3 py-2.5">ロケ</th>
              <th className="px-3 py-2.5">図番 / 品名</th>
              <th className="px-3 py-2.5 text-right">出荷予定</th>
              <th className="px-3 py-2.5 text-right">指示数</th>
              <th className="px-3 py-2.5 text-right">在庫残</th>
              <th className="px-3 py-2.5 text-right">出庫</th>
              {editable && <th className="px-3 py-2.5"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => {
              const done = l.qtyIssued >= l.qtyInstructed && l.qtyInstructed > 0;
              return (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 tabular-nums text-slate-400">{l.seq}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">
                    {l.locationCode ?? <span className="text-red-500">未引当</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs text-slate-500">{l.drawingNo}</div>
                    <div className="text-slate-700">{l.productName}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{l.qtyPlanned.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-800">{l.qtyInstructed.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{l.stockOnHand.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    {editable ? (
                      <div className="flex justify-end">
                        <PickVerify
                          orderId={id}
                          lineId={l.id}
                          expectedLocationCode={l.locationCode}
                          productCodes={[l.stockKey, l.productCode, l.drawingNo].filter((c): c is string => !!c)}
                          productName={l.productName}
                          qtyInstructed={l.qtyInstructed}
                          unit={l.unit}
                          done={done}
                          action={issueOrderLineAction}
                        />
                      </div>
                    ) : done ? (
                      <span className="text-xs font-semibold text-fuchsia-600">出庫済</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {editable && (
                    <td className="px-3 py-2">
                      {!done && (
                        <ConfirmForm
                          action={deleteIssueOrderLineAction.bind(null, id, l.id)}
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
                <td colSpan={editable ? 8 : 7} className="px-4 py-8 text-center text-sm text-slate-400">
                  明細がありません。上のフォームから商品を追加してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
