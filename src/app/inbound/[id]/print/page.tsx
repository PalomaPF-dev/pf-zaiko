import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getReceipt, listReceiptLines } from "@/lib/db";
import { currentScope } from "@/lib/scope";
import { formatDate, formatDateTime } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

const printCss = `
  @media print {
    @page { size: A4 portrait; margin: 10mm; }
    .no-print { display: none !important; }
  }
  .rl-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .rl-table th, .rl-table td { border: 0.25mm solid #475569; padding: 4px 6px; vertical-align: middle; }
  .rl-table thead th { background: #f1f5f9; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10px; }
  .rl-mono { font-family: ui-monospace, monospace; }
  .rl-qty { text-align: right; font-variant-numeric: tabular-nums; }
`;

export default async function ReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireEntitledSession();
  const { id } = await params;

  const { siteId } = await currentScope();

  let receipt, lines;
  try {
    receipt = await getReceipt(session.companyId, id, siteId);
    if (!receipt) notFound();
    lines = await listReceiptLines(session.companyId, id);
  } catch (e) {
    console.error("[receipt print]", e);
    return (
      <div className="p-6">
        <DbErrorState />
      </div>
    );
  }

  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const issuedAt = formatDateTime(new Date().toISOString());

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <style>{printCss}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/inbound/${id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" />
          入荷に戻る
        </Link>
        <PrintButton />
      </div>

      {/* ヘッダ */}
      <div className="mb-3 flex items-start justify-between gap-4 border-b border-slate-300 pb-2">
        <div>
          <h1 className="text-lg font-bold text-slate-800">入荷一覧リスト</h1>
          <div className="mt-1 text-[11px] text-slate-600">
            受入No：<span className="font-mono font-bold">{receipt.receiptNo}</span>
            <span className="ml-4">納入場所：{receipt.deliverTo ?? "—"}</span>
          </div>
        </div>
        <div className="text-right text-[11px] text-slate-600">
          発行日：{issuedAt}
          <div className="font-bold text-slate-700">{session.companyName}</div>
        </div>
      </div>

      <table className="rl-table">
        <thead>
          <tr>
            <th style={{ width: "8mm" }}>行</th>
            <th style={{ textAlign: "left" }}>図番 / 品名</th>
            <th style={{ textAlign: "left", width: "34mm" }}>仕入先</th>
            <th style={{ width: "26mm" }}>荷姿（箱×入数）</th>
            <th style={{ width: "22mm" }}>受入数</th>
            <th style={{ width: "26mm" }}>納品No</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td style={{ textAlign: "center" }}>{l.seq}</td>
              <td>
                <div className="rl-mono" style={{ fontSize: 10, color: "#64748b" }}>
                  {l.drawingNo}
                </div>
                <div style={{ fontWeight: 700 }}>{l.productName}</div>
              </td>
              <td>{l.supplier ?? "—"}</td>
              <td style={{ textAlign: "center" }}>{l.boxCount && l.perBox ? `${l.boxCount}箱 × ${l.perBox}` : "—"}</td>
              <td className="rl-qty">
                {l.qty.toLocaleString()} {l.unit}
              </td>
              <td className="rl-mono" style={{ textAlign: "center" }}>
                {l.refNo ?? "—"}
              </td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "#94a3b8" }}>
                明細がありません。
              </td>
            </tr>
          )}
        </tbody>
        {lines.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={4} style={{ textAlign: "right", fontWeight: 700 }}>
                合計
              </td>
              <td className="rl-qty" style={{ fontWeight: 800 }}>
                {totalQty.toLocaleString()}
              </td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>

      <p className="mt-2 text-[10px] text-slate-500">
        ※ 受入時点。ロケーションは「入庫（棚入れ）」で付与します（発行日 {formatDate(receipt.createdAt)} の受入）。
      </p>
    </div>
  );
}
