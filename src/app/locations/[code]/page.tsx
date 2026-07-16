import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Tag, ArrowDownToLine, Boxes } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getLocationByCode, listStockForLocation } from "@/lib/db";
import { parseLocCode, describeLoc } from "@/lib/location";
import PageHeader from "@/components/PageHeader";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

export default async function LocationDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { companyId } = await requireEntitledSession();
  const { code } = await params;
  const decoded = decodeURIComponent(code);

  let location, stock;
  try {
    location = await getLocationByCode(companyId, decoded);
    if (!location) notFound();
    stock = await listStockForLocation(companyId, location.id);
  } catch (e) {
    console.error("[location detail]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="ロケーション照会" />
        <DbErrorState />
      </div>
    );
  }

  const parts = parseLocCode(location.code);
  const totalQty = stock.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Link href="/locations" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        ロケーション一覧に戻る
      </Link>
      <PageHeader
        title={location.code}
        description={`${parts ? describeLoc(parts) : ""}${location.name ? ` ・ ${location.name}` : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/inbound?location=${location.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
            >
              <ArrowDownToLine className="h-4 w-4" />
              入荷
            </Link>
            <Link
              href={`/locations/${encodeURIComponent(location.code)}/label`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Tag className="h-4 w-4" />
              ラベル
            </Link>
          </div>
        }
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <Boxes className="h-4 w-4 text-slate-400" />
            このロケーションの在庫
          </h2>
          <span className="text-xs text-slate-500">
            合計 <span className="font-bold text-slate-800">{totalQty.toLocaleString()}</span>
          </span>
        </div>
        {stock.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">在庫はありません。</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-3 py-2">図番</th>
                  <th className="px-3 py-2">品名</th>
                  <th className="px-3 py-2 text-right">数量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stock.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link href={`/products/${r.productId}`} className="font-mono text-slate-700 hover:text-fuchsia-600">
                        {r.drawingNo}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{r.productName}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-800">
                      {r.qty.toLocaleString()} <span className="text-xs font-normal text-slate-400">{r.unit}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
