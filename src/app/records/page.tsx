import Link from "next/link";
import { Download, Printer, Factory } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { listTransactions, listProducts } from "@/lib/db";
import { resolveCurrentWorkplace } from "@/lib/workplace";
import { formatDateTime } from "@/lib/format";
import { TX_TYPE_LABEL, IO_TX_TYPES, type TxType } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import { TxTypeBadge } from "@/components/Badges";
import DbErrorState from "@/components/DbErrorState";
import NoWorkplaceState from "@/components/NoWorkplaceState";

export const dynamic = "force-dynamic";

const ALL_TX_TYPES: TxType[] = [...IO_TX_TYPES, "putaway", "move_in", "move_out", "stocktake"];

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; type?: string; from?: string; to?: string }>;
}) {
  const session = await requireEntitledSession();
  const sp = await searchParams;
  const txType = (ALL_TX_TYPES as string[]).includes(sp.type ?? "") ? (sp.type as TxType) : null;

  let workplace, txs, products;
  try {
    workplace = await resolveCurrentWorkplace(session.companyId);
    if (!workplace) {
      return (
        <div className="p-4 sm:p-6">
          <PageHeader title="受払履歴" />
          <NoWorkplaceState />
        </div>
      );
    }
    [txs, products] = await Promise.all([
      listTransactions(session.companyId, {
        workplaceId: workplace.id,
        productId: sp.product || null,
        txType,
        dateFrom: sp.from || null,
        dateTo: sp.to || null,
        limit: 500,
      }),
      listProducts(session.companyId),
    ]);
  } catch (e) {
    console.error("[records]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="受払履歴" />
        <DbErrorState />
      </div>
    );
  }

  const qs = new URLSearchParams({ workplace: workplace.id });
  if (sp.product) qs.set("product", sp.product);
  if (txType) qs.set("type", txType);
  if (sp.from) qs.set("from", sp.from);
  if (sp.to) qs.set("to", sp.to);
  const exportHref = `/api/records/export${qs.toString() ? `?${qs.toString()}` : ""}`;

  const inputCls =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="受払履歴"
        description="現在の職場の入庫・払い出し・調整・移動・棚卸差異を時系列で照会します。"
        action={
          <a
            href={exportHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            CSV出力
          </a>
        }
      />

      <div className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-50 px-3 py-1.5 text-sm font-semibold text-fuchsia-800">
        <Factory className="h-4 w-4" />
        {workplace.siteName}／{workplace.name}
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">品目</label>
          <select name="product" defaultValue={sp.product ?? ""} className={inputCls}>
            <option value="">すべての品目</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.makerCode ?? p.drawingNo} {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">区分</label>
          <select name="type" defaultValue={txType ?? ""} className={inputCls}>
            <option value="">すべての区分</option>
            {ALL_TX_TYPES.map((t) => (
              <option key={t} value={t}>
                {TX_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">開始日</label>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">終了日</label>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={inputCls} />
        </div>
        <button className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">絞り込む</button>
        <Link href="/records" className="px-2 py-2 text-sm text-slate-500 hover:underline">
          クリア
        </Link>
      </form>

      {txs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          該当する受払記録がありません。
        </div>
      ) : (
        <>
        {/* モバイル: カード型リスト（品名・区分・増減を大きく） */}
        <ul className="space-y-2 md:hidden">
          {txs.map((t) => (
            <li key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-slate-500">{t.makerCode ?? t.drawingNo}</div>
                  <div className="truncate text-sm font-semibold text-slate-800">{t.productName}</div>
                </div>
                <TxTypeBadge type={t.txType} />
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0 text-xs text-slate-500">
                  <div className="font-mono">{t.locationCode}</div>
                  <div className="whitespace-nowrap">{formatDateTime(t.createdAt)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`text-xl font-bold tabular-nums ${t.qtyDelta >= 0 ? "text-fuchsia-600" : "text-red-600"}`}>
                    {t.qtyDelta >= 0 ? "+" : ""}
                    {t.qtyDelta}
                  </span>
                  <span className="ml-2 whitespace-nowrap text-xs text-slate-500">残 {t.qtyAfter}</span>
                </div>
              </div>
              {(t.refNo || t.operator || t.txType === "receipt") && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  <span className="min-w-0 truncate">
                    {t.refNo ?? "—"}
                    {t.operator && <span className="ml-2">{t.operator}</span>}
                  </span>
                  {t.txType === "receipt" && (
                    <Link
                      href={`/labels/receipt/${t.id}`}
                      className="inline-flex shrink-0 items-center gap-1 font-medium text-slate-500 hover:text-fuchsia-600"
                      title="現品票を印刷"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      現品票
                    </Link>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {/* PC/タブレット: テーブル */}
        <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2.5">日時</th>
                <th className="px-4 py-2.5">区分</th>
                <th className="px-4 py-2.5">品名・メーカー品番</th>
                <th className="px-4 py-2.5">置き場</th>
                <th className="px-4 py-2.5 text-right">増減</th>
                <th className="px-4 py-2.5 text-right">残数</th>
                <th className="px-4 py-2.5">伝票/ロット</th>
                <th className="px-4 py-2.5">実施者</th>
                <th className="px-4 py-2.5">票</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {txs.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{formatDateTime(t.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <TxTypeBadge type={t.txType} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-xs text-slate-500">{t.makerCode ?? t.drawingNo}</div>
                    <div className="text-slate-700">{t.productName}</div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{t.locationCode}</td>
                  <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${t.qtyDelta >= 0 ? "text-fuchsia-600" : "text-red-600"}`}>
                    {t.qtyDelta >= 0 ? "+" : ""}
                    {t.qtyDelta}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{t.qtyAfter}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{t.refNo ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{t.operator}</td>
                  <td className="px-4 py-2.5">
                    {t.txType === "receipt" && (
                      <Link
                        href={`/labels/receipt/${t.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-fuchsia-600"
                        title="現品票を印刷"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        現品票
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
