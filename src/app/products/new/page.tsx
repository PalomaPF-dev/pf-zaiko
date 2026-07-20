import { requireAdminPage } from "@/lib/session";
import { listCategories, listPartners } from "@/lib/db";
import { createProductAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import ProductForm from "@/components/ProductForm";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const { companyId } = await requireAdminPage();
  const [categories, suppliers] = await Promise.all([
    listCategories(companyId),
    listPartners(companyId, { kind: "supplier", activeOnly: true }),
  ]);
  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <PageHeader title="商品を登録" description="登録後、ラベル発行・入出庫の対象になります。" />
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <ProductForm
          action={createProductAction}
          submitLabel="登録する"
          categorySuggestions={categories}
          supplierSuggestions={suppliers.map((p) => p.name)}
        />
      </div>
    </div>
  );
}
