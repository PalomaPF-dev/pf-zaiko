import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getIssueOrder, listIssueOrderLines } from "@/lib/db";
import { currentScope } from "@/lib/scope";
import { productLabelCode } from "@/lib/types";
import { buildQrDataUrls } from "@/lib/qr";
import { formatDate, formatDateTime } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

const printCss = `
  @media print {
    @page { size: A4 portrait; margin: 8mm; }
    .no-print { display: none !important; }
  }
  .ol-table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  .ol-table th, .ol-table td { border: 0.25mm solid #475569; padding: 2px 4px; vertical-align: middle; }
  .ol-table thead th { background: #f1f5f9; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 8.5px; line-height: 1.2; }
  .ol-loc { font-family: ui-monospace, monospace; font-size: 16px; font-weight: 800; letter-spacing: -0.04em; white-space: nowrap; }
  .ol-name { font-weight: 700; }
  .ol-mono { font-family: ui-monospace, monospace; color: #475569; }
  .ol-qr { width: 12mm; height: 12mm; display: block; }
  .ol-qty { text-align: right; font-variant-numeric: tabular-nums; line-height: 1.35; }
  .ol-qty .n { font-weight: 800; }
  .ol-qty .pk { color: #475569; font-size: 8.5px; }
  .ol-hd-box { border: 1px solid #334155; padding: 1px 8px; font-weight: 800; letter-spacing: 2px; }
`;

export default async function PickingListPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireEntitledSession();
  const { id } = await params;

  const { siteId } = await currentScope();

  let order, lines;
  try {
    order = await getIssueOrder(session.companyId, id, siteId);
    if (!order) notFound();
    lines = await listIssueOrderLines(session.companyId, id);
  } catch (e) {
    console.error("[picking list]", e);
    return (
      <div className="p-6">
        <DbErrorState />
      </div>
    );
  }

  // 各行のQR＝在庫管理キー（無ければ品目CD/図番）。ヘッダQR＝出庫指示No。
  const lineKey = (l: (typeof lines)[number]) => productLabelCode(l);
  const qrMap = await buildQrDataUrls(
    [...lines.map(lineKey), order.orderNo],
    { width: 200, margin: 0 }
  );
  const orderQr = await QRCode.toDataURL(order.orderNo, { width: 200, margin: 0 });
  const issuedAt = formatDateTime(new Date().toISOString());

  // 荷姿（ロットサイズ）表示：荷姿数＝総数/入数、単位(入数)、総数
  const packOf = (qty: number, lotSize: number | null, unit: string) => {
    const ls = lotSize && lotSize > 0 ? lotSize : 1;
    const pkgs = Math.ceil(qty / ls);
    return { pkgs, label: `${unit}(${ls})`, total: qty };
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <style>{printCss}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/issue-orders/${id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" />
          出庫に戻る
        </Link>
        <PrintButton />
      </div>

      {/* ===== 帳票ヘッダ ===== */}
      <div className="mb-1 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-slate-400">WSHK-OUT</span>
          <span className="ol-hd-box text-sm">出庫</span>
          <h1 className="text-lg font-bold text-slate-800">出庫指示リスト</h1>
        </div>
        <div className="text-right text-[11px] text-slate-600">
          発行日：{issuedAt}
          <div className="font-bold text-slate-700">{session.companyName}</div>
        </div>
      </div>
      <div className="mb-2 flex items-end justify-between gap-4 border-y border-slate-300 py-1.5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11px] text-slate-700">
          <div>出荷予定日：{formatDate(order.shipDate)}</div>
          <div>得意先：{order.customer ?? "—"}</div>
          <div>荷揃え日：{formatDate(order.pickDate)}</div>
          <div>納入先：{order.deliverTo ?? "—"}</div>
          <div>伝票No：<span className="font-mono">{order.orderNo}</span></div>
          <div>出荷グループ：{order.shipGroup ?? "—"}</div>
        </div>
        <div className="flex items-center gap-2 text-right text-[11px] text-slate-700">
          <div>
            <div>出庫指示No</div>
            <div className="font-mono font-bold">{order.orderNo}</div>
            <div className="text-slate-500">（1 / 1）</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={orderQr} alt="" style={{ width: "13mm", height: "13mm" }} />
        </div>
      </div>
      <p className="mb-2 text-[10px] text-slate-500">
        ※ <b>ロケーションが近い順</b>に並んでいます。各行のQR（在庫管理キー）と、<b>現物の品目ラベル</b>・<b>棚のロケーションQR</b>を照合してから出庫してください。
      </p>

      {/* ===== 明細 ===== */}
      <table className="ol-table">
        <thead>
          <tr>
            <th style={{ width: "16mm" }}>予定行No<br />QR</th>
            <th style={{ width: "34mm", textAlign: "left" }}>ロケ</th>
            <th style={{ textAlign: "left" }}>
              品目名 / ロットNo
              <br />
              品目CD・在庫管理キー
            </th>
            <th style={{ width: "18mm" }}>入荷日</th>
            <th style={{ width: "20mm" }}>
              出荷予定数
              <br />
              荷姿 /（総数）
            </th>
            <th style={{ width: "20mm" }}>
              指示数
              <br />
              荷姿 /（総数）
            </th>
            <th style={{ width: "18mm" }}>
              在庫残数
              <br />
              （総数）
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const plan = packOf(l.qtyPlanned, l.lotSize, l.unit);
            const inst = packOf(l.qtyInstructed, l.lotSize, l.unit);
            return (
              <tr key={l.id}>
                <td style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 700 }}>{l.seq}</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="ol-qr" style={{ margin: "2px auto 0" }} src={qrMap[lineKey(l)]} alt="" />
                </td>
                <td>
                  <div className="ol-loc">{l.locationCode ?? "未引当"}</div>
                </td>
                <td>
                  <div className="ol-name">{l.productName}</div>
                  {l.lotNo && <div className="ol-mono">ロット {l.lotNo}</div>}
                  <div className="ol-mono">
                    {l.productCode ?? l.drawingNo} / {l.stockKey ?? "—"}
                  </div>
                </td>
                <td style={{ textAlign: "center", color: "#64748b" }}>—</td>
                <td className="ol-qty">
                  <div>（{plan.pkgs.toLocaleString()}）</div>
                  <div className="pk">{plan.label}</div>
                  <div>（{plan.total.toLocaleString()}）</div>
                </td>
                <td className="ol-qty">
                  <div className="n">{inst.pkgs.toLocaleString()}</div>
                  <div className="pk">{inst.label}</div>
                  <div>（{inst.total.toLocaleString()}）</div>
                </td>
                <td className="ol-qty">
                  <div>（{l.stockOnHand.toLocaleString()}）</div>
                </td>
              </tr>
            );
          })}
          {lines.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", color: "#94a3b8" }}>
                明細がありません。
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-2 text-center text-[10px] text-slate-400">— 1 / 1 —</div>
    </div>
  );
}
