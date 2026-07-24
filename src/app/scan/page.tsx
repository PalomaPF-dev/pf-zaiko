import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getProductByAnyCode, getLocationByCode } from "@/lib/db";
import { currentScope } from "@/lib/scope";
import { isLocCode } from "@/lib/location";
import PageHeader from "@/components/PageHeader";
import InventoryQrScanner from "@/components/InventoryQrScanner";

export const dynamic = "force-dynamic";

/** 手入力（QRが読めないとき）: 図番 or ロケコードを解決して該当ページへ。 */
async function lookupAction(fd: FormData) {
  "use server";
  const { companyId } = await requireEntitledSession();
  const raw = String(fd.get("code") ?? "").trim();
  if (!raw) redirect("/scan");
  if (isLocCode(raw)) {
    // 他工場の置き場は開かせない（スコープ外なら「見つかりません」に落とす）
    const { siteId } = await currentScope();
    const loc = await getLocationByCode(companyId, raw, siteId);
    if (loc) redirect(`/locations/${encodeURIComponent(loc.code)}`);
  }
  const product = await getProductByAnyCode(companyId, raw);
  if (product) redirect(`/products/${product.id}`);
  // 見つからなければスキャン画面に戻り、その場でメッセージを表示（再入力できるように入力値も保持）
  redirect(`/scan?notfound=${encodeURIComponent(raw)}`);
}

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ notfound?: string }>;
}) {
  await requireEntitledSession();
  const { notfound } = await searchParams;
  const notFoundCode = (notfound ?? "").trim().slice(0, 100);
  return (
    <div className="mx-auto max-w-md p-4 sm:p-6">
      <PageHeader title="スキャン" description="QRを読むと、商品なら在庫画面、ロケなら在庫照会が開きます。" />

      <InventoryQrScanner />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <Search className="h-4 w-4" />
          手入力で開く
        </h2>
        <p className="mb-3 text-xs text-slate-400">カメラが使えないときは、図番（例 ZU-A102-03）・商品CD・在庫管理キー・ロケ番号（例 A-01-3-2）を入力してください。</p>
        {notFoundCode && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            「{notFoundCode}」に一致する商品・ロケが見つかりません。入力内容をご確認ください。
          </div>
        )}
        <form action={lookupAction} className="flex items-center gap-2">
          <input
            name="code"
            required
            defaultValue={notFoundCode}
            placeholder="図番 / ロケ番号"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
          />
          <button className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">開く</button>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm font-medium">
        <Link href="/inbound" className="whitespace-nowrap text-fuchsia-600 hover:underline">
          入荷（受入）→
        </Link>
        <Link href="/putaway" className="whitespace-nowrap text-fuchsia-600 hover:underline">
          入庫（棚入れ）→
        </Link>
        <Link href="/issue-orders" className="whitespace-nowrap text-fuchsia-600 hover:underline">
          出庫 →
        </Link>
        <Link href="/move" className="whitespace-nowrap text-fuchsia-600 hover:underline">
          移動・調整 →
        </Link>
      </div>
    </div>
  );
}
