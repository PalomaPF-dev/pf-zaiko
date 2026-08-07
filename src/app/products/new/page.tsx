import Link from "next/link";
import { requireAdminPage } from "@/lib/session";
import { listCategories, listPartners, getItemMasterByCode } from "@/lib/db";
import { ensureItemMasterSeeded } from "@/lib/itemMasterSeed";
import { itemUnitLabel, normalizeItemCode } from "@/lib/itemCode";
import { createProductAction } from "@/lib/actions";
import type { ItemMasterLookup } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import ProductForm from "@/components/ProductForm";

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { companyId } = await requireAdminPage();
  const { item: itemParam } = await searchParams;
  const [categories, suppliers] = await Promise.all([
    listCategories(companyId),
    listPartners(companyId, { kind: "supplier", activeOnly: true }),
  ]);

  // 品目マスタ（/items）から「この品目で商品を登録」で来たときは、その品目を初期値にする
  let initialItem: ItemMasterLookup | null = null;
  const code = itemParam ? normalizeItemCode(itemParam) : null;
  if (code) {
    try {
      await ensureItemMasterSeeded(companyId);
      const found = await getItemMasterByCode(companyId, code);
      if (found) {
        initialItem = {
          ...found,
          unitLabel: itemUnitLabel(found.unitCode),
          packUnitLabel: itemUnitLabel(found.packUnitCode),
        };
      }
    } catch (e) {
      // 品目の引き当てに失敗しても、空のフォームは出す（手入力で登録できる）
      console.error("[products/new] 品目の呼び出しに失敗:", e);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <PageHeader
        title="商品を登録"
        description="登録後、ラベル発行・入出庫の対象になります。"
        action={
          <Link
            href="/items"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            品目マスタから探す
          </Link>
        }
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <ProductForm
          action={createProductAction}
          submitLabel="登録する"
          categorySuggestions={categories}
          supplierSuggestions={suppliers.map((p) => p.name)}
          itemLookup
          initialItem={initialItem}
        />
      </div>
    </div>
  );
}
