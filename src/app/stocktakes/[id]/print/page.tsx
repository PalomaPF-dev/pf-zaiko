import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getStocktake, listStocktakeLines } from "@/lib/db";
import { currentScope } from "@/lib/scope";
import { formatDateTime } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

const printCss = `
  @media print {
    @page { size: A4 portrait; margin: 12mm; }
    .no-print { display: none !important; }
  }
  .st-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .st-table th, .st-table td { border: 0.3mm solid #94a3b8; padding: 4px 6px; }
  .st-table thead th { background: #f1f5f9; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

export default async function StocktakePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { companyId } = await requireEntitledSession();
  const { id } = await params;

  const { siteId } = await currentScope();

  let take, lines;
  try {
    take = await getStocktake(companyId, id, siteId);
    if (!take) notFound();
    lines = await listStocktakeLines(companyId, id);
  } catch (e) {
    console.error("[stocktake print]", e);
    return (
      <div className="p-6">
        <DbErrorState />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <style>{printCss}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/stocktakes/${id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" />
          棚卸に戻る
        </Link>
        <PrintButton />
      </div>

      <div className="mb-3">
        <h1 className="text-lg font-bold text-slate-800">棚卸 記入リスト</h1>
        <div className="text-xs text-slate-500">
          {take.title} ／ {take.scopeArea ?? "—"} ／ 作成 {formatDateTime(take.createdAt)}
        </div>
        <div className="mt-1 text-xs text-slate-500">記入者: ______________　日付: ______________</div>
      </div>

      <table className="st-table">
        <thead>
          <tr>
            <th style={{ width: "22%" }}>ロケーション</th>
            <th style={{ width: "18%" }}>図番</th>
            <th>品名</th>
            <th style={{ width: "12%" }}>帳簿数</th>
            <th style={{ width: "16%" }}>実棚数（記入）</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td style={{ fontFamily: "ui-monospace, monospace" }}>{l.locationCode}</td>
              <td style={{ fontFamily: "ui-monospace, monospace" }}>{l.drawingNo}</td>
              <td>{l.productName}</td>
              <td style={{ textAlign: "right" }}>
                {l.bookQty.toLocaleString()} {l.unit}
              </td>
              <td></td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "#94a3b8" }}>
                対象在庫がありません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
