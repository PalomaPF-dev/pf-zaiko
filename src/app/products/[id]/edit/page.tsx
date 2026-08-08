import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { getProduct, listCategories, listPartners } from "@/lib/db";
import { updateProductAction, deleteProductAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import ProductForm from "@/components/ProductForm";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { companyId } = await requireAdminPage();
  const { id } = await params;
  const [product, categories, suppliers] = await Promise.all([
    getProduct(companyId, id),
    listCategories(companyId),
    listPartners(companyId, { kind: "supplier", activeOnly: true }),
  ]);
  if (!product) notFound();

  const update = updateProductAction.bind(null, id);
  const del = deleteProductAction.bind(null, id);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Link
        href={`/products/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        品目詳細に戻る
      </Link>
      <PageHeader title="品目情報を編集" description={`${product.drawingNo} ${product.name}`} />

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <ProductForm
          action={update}
          product={product}
          submitLabel="変更を保存"
          categorySuggestions={categories}
          supplierSuggestions={suppliers.map((p) => p.name)}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/50 p-5">
        <h2 className="mb-1 text-sm font-bold text-red-700">品目を削除</h2>
        <p className="mb-3 text-xs text-red-600/80">
          この品目の在庫・受払履歴もすべて削除されます。この操作は取り消せません。
        </p>
        <ConfirmForm
          action={del}
          message={`「${product.drawingNo} ${product.name}」を在庫・受払履歴ごと完全に削除します。よろしいですか？`}
        >
          <button className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
            完全に削除する
          </button>
        </ConfirmForm>
      </div>
    </div>
  );
}
