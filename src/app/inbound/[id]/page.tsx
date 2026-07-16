import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer, Plus, ArrowRightLeft } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getReceipt, listReceiptLines, listProducts } from "@/lib/db";
import { addReceiptLineAction } from "@/lib/actions";
import { formatDate } from "@/lib/format";
import { RECEIPT_STATUS_LABEL } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import DbErrorState from "@/components/DbErrorState";
import ReceivingLineForm, { type ReceivingProduct } from "@/components/ReceivingLineForm";
import ReceiptLineTable from "@/components/ReceiptLineTable";

export const dynamic = "force-dynamic";

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { companyId } = await requireEntitledSession();
  const { id } = await params;

  let receipt, lines, products;
  try {
    receipt = await getReceipt(companyId, id);
    if (!receipt) notFound();
    [lines, products] = await Promise.all([listReceiptLines(companyId, id), listProducts(companyId, { activeOnly: true })]);
  } catch (e) {
    console.error("[receipt detail]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="入荷（受入）" />
        <DbErrorState />
      </div>
    );
  }

  const editable = receipt.status === "open";
  const addLine = addReceiptLineAction.bind(null, id);
  const rProducts: ReceivingProduct[] = products.map((p) => ({
    id: p.id,
    drawingNo: p.drawingNo,
    productCode: p.productCode,
    name: p.name,
    unit: p.unit,
    supplier: p.supplier,
    lotSize: p.lotSize,
  }));

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link href="/inbound" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        入荷一覧に戻る
      </Link>
      <PageHeader
        title={receipt.receiptNo}
        description={[receipt.deliverTo ? `納入場所 ${receipt.deliverTo}` : null, formatDate(receipt.createdAt)]
          .filter(Boolean)
          .join(" ・ ")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
              {RECEIPT_STATUS_LABEL[receipt.status]}
            </span>
            <Link
              href={`/inbound/${id}/print`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              入荷一覧（PDF）
            </Link>
            <Link
              href="/putaway"
              className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-300 px-3 py-2 text-sm font-medium text-fuchsia-700 hover:bg-fuchsia-50"
            >
              <ArrowRightLeft className="h-4 w-4" />
              入庫（棚入れ）へ
            </Link>
          </div>
        }
      />

      {editable && (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <Plus className="h-4 w-4" />
            入荷した商品を登録
          </h2>
          {rProducts.length === 0 ? (
            <p className="text-sm text-slate-500">
              先に{" "}
              <Link href="/products/new" className="text-fuchsia-600 hover:underline">
                商品マスタ
              </Link>{" "}
              を登録してください。
            </p>
          ) : (
            <ReceivingLineForm products={rProducts} action={addLine} />
          )}
        </div>
      )}

      <ReceiptLineTable receiptId={id} lines={lines} editable={editable} />

      <p className="mt-3 text-xs text-slate-400">
        ※ この段階ではロケーションを設定しません（未入庫）。商品ラベルを貼ったら「入庫（棚入れ）」でラベルをスキャンし、ロケーションを付与します。
      </p>
    </div>
  );
}
