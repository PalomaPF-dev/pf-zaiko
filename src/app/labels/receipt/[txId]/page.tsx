import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getTransaction, getProduct } from "@/lib/db";
import { productLabelCode } from "@/lib/types";
import { productQrPayload } from "@/lib/qr";
import { formatDate } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import DbErrorState from "@/components/DbErrorState";

export const dynamic = "force-dynamic";

/** 入荷現品票（50×35mm）。入荷トランザクションから発行する。 */
export default async function ReceiptTagPage({ params }: { params: Promise<{ txId: string }> }) {
  const session = await requireEntitledSession();
  const { txId } = await params;

  let tx, product;
  try {
    tx = await getTransaction(session.companyId, txId);
    product = tx ? await getProduct(session.companyId, tx.productId) : null;
  } catch (e) {
    console.error("[receipt tag]", e);
    return (
      <div className="p-6">
        <DbErrorState />
      </div>
    );
  }
  if (!tx || !product) notFound();

  const isMove = tx.txType === "move_in" || tx.txType === "move_out";
  const partnerLabel = isMove ? "移動先" : "購入先";
  const partnerValue = tx.partnerName ?? (isMove ? "—" : product.supplier ?? "—");
  const tagTitle = isMove ? "移動現品票" : "入荷現品票";
  const qty = Math.abs(tx.qtyDelta);
  const head = await headers();
  const proto = head.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${head.get("host")}`;
  const qrDataUrl = await QRCode.toDataURL(productQrPayload(origin, productLabelCode(product)), { width: 260, margin: 1 });

  // 50×35mm 現品票（画像レイアウト踏襲）
  const printCss = `
    @media print {
      @page { size: 50mm 35mm; margin: 0; }
      .tag-print-root { padding: 0 !important; margin: 0 !important; max-width: none !important; }
      .tag-frame { padding: 0 !important; border: 0 !important; box-shadow: none !important; background: transparent !important; }
    }
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
    <div className="tag-print-root mx-auto max-w-md p-4 sm:p-6">
      <style>{printCss}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/records" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" />
          受払履歴に戻る
        </Link>
        <PrintButton />
      </div>

      <h1 className="no-print mb-1 text-xl font-bold text-slate-800">{tagTitle}</h1>
      <p className="no-print mb-4 text-sm text-slate-500">
        {isMove ? "移動ロットの数量・移動先" : "入荷ロットの数量・納品No・購入先・納入場所"}を印字します（50×35mm）。
      </p>

      <div className="tag-frame inline-block rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="rtag">
          <div className="nm">{product.name}</div>
          <div className="cdrow">
            <span className="cd">商品CD:{product.productCode ?? product.drawingNo}</span>
            <span className="date">{formatDate(tx.createdAt)}</span>
          </div>
          <div className="mid">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR" className="qr" />
              <div className="qrkey">{product.stockKey ?? productLabelCode(product)}</div>
            </div>
            <div className="right">
              <div className="qtybox">
                <div className="lbl">数量</div>
                <div className="val">
                  {qty.toLocaleString()} <span>{product.unit}</span>
                </div>
              </div>
              <div className="kv" style={{ marginTop: "0.8mm" }}>
                {!isMove && (
                  <div>
                    <b>納品No ：</b>
                    {tx.refNo ?? "—"}
                  </div>
                )}
                <div>
                  <b>{partnerLabel} ：</b>
                  {partnerValue}
                </div>
                <div>
                  <b>{isMove ? "移動先ロケ：" : "納入場所："}</b>
                  {isMove ? tx.locationCode : tx.deliverTo ?? "—"}
                </div>
                {isMove && tx.refNo && (
                  <div>
                    <b>伝票No ：</b>
                    {tx.refNo}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="logo">{session.companyName}</div>
        </div>
      </div>

      <p className="no-print mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
        SATO のラベルプリンターで印刷する場合は、印刷ダイアログで SATO プリンターと用紙（ラベル 50×35mm）を選び、
        <b>倍率100%（実寸）・余白なし</b>で印刷してください。A4プリンタなら「PDFとして保存」も可能です。
      </p>
    </div>
  );
}
