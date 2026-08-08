import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getReceipt, getReceiptLinesByIds, markReceiptLinesLabelPrinted } from "@/lib/db";
import { currentScope } from "@/lib/scope";
import { productLabelCode } from "@/lib/types";
import { productQrPayload, buildQrDataUrls } from "@/lib/qr";
import { formatDate } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

/** ①入荷：レ点した受入明細の品目ラベル（50×35mm）を A4 面付けで発行する。 */
export default async function ReceiptLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const session = await requireEntitledSession();
  const { id } = await params;
  const sp = await searchParams;
  const ids = (sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const { siteId } = await currentScope();

  let receipt, lines;
  try {
    receipt = await getReceipt(session.companyId, id, siteId);
    if (!receipt) notFound();
    lines = await getReceiptLinesByIds(session.companyId, ids);
    if (lines.length > 0) await markReceiptLinesLabelPrinted(session.companyId, lines.map((l) => l.id));
  } catch (e) {
    console.error("[receipt labels]", e);
    return (
      <div className="p-6">
        <DbErrorState />
      </div>
    );
  }

  const head = await headers();
  const proto = head.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${head.get("host")}`;
  const qrMap = await buildQrDataUrls(
    lines.map((l) => productQrPayload(origin, productLabelCode(l))),
    { width: 260, margin: 1 }
  );

  const printCss = `
    @media print {
      @page { size: A4 portrait; margin: 8mm; }
      .no-print { display: none !important; }
      .lbl-sheet { gap: 3mm !important; }
      .rtag { break-inside: avoid; }
    }
    .lbl-sheet { display: flex; flex-wrap: wrap; gap: 4mm; }
    .rtag {
      width: 50mm; height: 35mm; box-sizing: border-box; background: #fff; color: #000;
      padding: 2mm 2.5mm; font-family: -apple-system, 'Hiragino Sans', sans-serif;
      display: flex; flex-direction: column; gap: 0.6mm; border-radius: 2mm; border: 0.2mm solid #94a3b8;
    }
    .rtag .nm { font-size: 3.0mm; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rtag .cdrow { display: flex; justify-content: space-between; font-size: 2.2mm; }
    .rtag .cdrow .cd { font-family: ui-monospace, monospace; font-weight: 700; }
    .rtag .cdrow .date { color: #333; }
    .rtag .mid { display: flex; gap: 1.5mm; align-items: flex-start; margin-top: 0.5mm; }
    .rtag .qr { width: 15mm; height: 15mm; flex: 0 0 auto; }
    .rtag .qrkey { font-size: 1.8mm; font-family: ui-monospace, monospace; text-align: center; margin-top: 0.3mm; }
    .rtag .right { flex: 1 1 auto; min-width: 0; }
    .rtag .qtybox { display: flex; align-items: stretch; border: 0.25mm solid #000; border-radius: 0.8mm; overflow: hidden; }
    .rtag .qtybox .lbl { background: #f1f5f9; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 2.2mm; padding: 0.6mm 1mm; display: flex; align-items: center; border-right: 0.25mm solid #000; }
    .rtag .qtybox .val { flex: 1; font-size: 3.6mm; font-weight: 800; text-align: right; padding: 0.4mm 1mm; }
    .rtag .qtybox .val span { font-size: 2.0mm; font-weight: 400; }
    .rtag .kv { font-size: 2.0mm; line-height: 1.3; }
    .rtag .kv b { font-weight: 400; color: #333; }
    .rtag .logo { text-align: center; font-size: 2.0mm; color: #64748b; margin-top: auto; }
  `;

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

      <h1 className="no-print mb-1 text-xl font-bold text-slate-800">品目ラベル（{lines.length}件）</h1>
      <p className="no-print mb-4 text-sm text-slate-500">
        入荷した現品に貼る品目ラベル（50×35mm・QR=在庫管理キー）です。SATO のラベルプリンターは用紙 50×35mm・
        <b>倍率100%（実寸）・余白なし</b>で印刷。A4プリンタなら「PDFとして保存」も可能です。
      </p>

      {lines.length === 0 ? (
        <p className="no-print rounded-lg bg-amber-50 p-4 text-sm text-amber-700">発行対象の明細が選択されていません。</p>
      ) : (
        <div className="lbl-sheet">
          {lines.map((l) => (
            <div key={l.id} className="rtag">
              <div className="nm">{l.productName}</div>
              <div className="cdrow">
                <span className="cd">品目CD:{l.productCode ?? l.drawingNo}</span>
                <span className="date">{formatDate(receipt.createdAt)}</span>
              </div>
              <div className="mid">
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrMap[productQrPayload(origin, productLabelCode(l))]} alt="QR" className="qr" />
                  <div className="qrkey">{l.stockKey ?? productLabelCode(l)}</div>
                </div>
                <div className="right">
                  <div className="qtybox">
                    <div className="lbl">数量</div>
                    <div className="val">
                      {l.qty.toLocaleString()} <span>{l.unit}</span>
                    </div>
                  </div>
                  <div className="kv" style={{ marginTop: "0.8mm" }}>
                    <div>
                      <b>納品No ：</b>
                      {l.refNo ?? "—"}
                    </div>
                    <div>
                      <b>仕入先 ：</b>
                      {l.supplier ?? "—"}
                    </div>
                    <div>
                      <b>納入場所：</b>
                      {receipt.deliverTo ?? "—"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="logo">{session.companyName}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
