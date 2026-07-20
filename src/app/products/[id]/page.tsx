import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, ArrowDownToLine, MapPin, ClipboardList } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { resolveProduct, listStockForProduct, listTransactions } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { TxTypeBadge, BelowSafetyBadge } from "@/components/Badges";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { companyId, role } = await requireEntitledSession();
  const isAdmin = role === "admin";
  const { id } = await params;

  let product, stock, txs;
  try {
    product = await resolveProduct(companyId, id);
    if (!product) notFound();
    [stock, txs] = await Promise.all([
      listStockForProduct(companyId, product.id),
      listTransactions(companyId, { productId: product.id, limit: 30 }),
    ]);
  } catch (e) {
    console.error("[product detail]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="商品詳細" />
        <DbErrorState />
      </div>
    );
  }

  const totalQty = stock.reduce((s, r) => s + r.qty, 0);
  const belowSafety = product.safetyStock != null && totalQty < product.safetyStock;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <PageHeader
        title={product.name}
        description={product.drawingNo}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/inbound?product=${product.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
            >
              <ArrowDownToLine className="h-4 w-4" />
              入荷
            </Link>
            {isAdmin && (
              <Link
                href={`/products/${product.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <Pencil className="h-4 w-4" />
                編集
              </Link>
            )}
          </div>
        }
      />

      {/* サマリ */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="現在庫（合計）" value={`${totalQty.toLocaleString()} ${product.unit}`} tone={belowSafety ? "red" : "slate"} />
        <SummaryCard label="安全在庫" value={product.safetyStock != null ? `${product.safetyStock} ${product.unit}` : "—"} tone="slate" />
        <SummaryCard label="規格・型式" value={product.spec ?? "—"} tone="slate" />
        <SummaryCard label="メーカー" value={product.maker ?? "—"} tone="slate" />
      </div>
      {belowSafety && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <BelowSafetyBadge />
          安全在庫（{product.safetyStock} {product.unit}）を下回っています。補充をご検討ください。
        </div>
      )}

      {/* ロケ別在庫 */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <MapPin className="h-4 w-4 text-slate-400" />
          ロケ別在庫
        </h2>
        {stock.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">在庫のあるロケーションはありません。</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-3 py-2">ロケーション</th>
                  <th className="px-3 py-2 text-right">数量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stock.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link href={`/locations/${encodeURIComponent(r.locationCode)}`} className="font-mono text-slate-700 hover:text-fuchsia-600">
                        {r.locationCode}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-800">
                      {r.qty.toLocaleString()} <span className="text-xs font-normal text-slate-400">{product.unit}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 受払履歴 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <ClipboardList className="h-4 w-4 text-slate-400" />
            受払履歴
          </h2>
          <Link href={`/records?product=${id}`} className="text-xs font-medium text-fuchsia-600 hover:underline">
            すべて見る
          </Link>
        </div>
        {txs.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">受払の記録はまだありません。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {txs.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <TxTypeBadge type={t.txType} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-700">
                    {t.locationCode}
                    {t.refNo && <span className="ml-2 text-xs text-slate-400">{t.refNo}</span>}
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {t.operator} ・ {formatDateTime(t.createdAt)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-sm font-bold tabular-nums ${t.qtyDelta >= 0 ? "text-fuchsia-600" : "text-red-600"}`}>
                    {t.qtyDelta >= 0 ? "+" : ""}
                    {t.qtyDelta}
                  </div>
                  <div className="text-xs text-slate-400">残 {t.qtyAfter}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const TONE: Record<string, string> = {
  slate: "text-slate-800",
  red: "text-red-600",
};

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONE }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-0.5 truncate text-base font-bold ${TONE[tone]}`}>{value}</div>
    </div>
  );
}
