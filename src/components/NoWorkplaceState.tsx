import Link from "next/link";
import { Factory } from "lucide-react";

/** 工場・職場が未登録のときに表示する案内。副資材の在庫は職場ごとに持つため、まず職場登録が必要。 */
export default function NoWorkplaceState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <Factory className="mx-auto mb-3 h-8 w-8 text-slate-300" />
      <p className="mb-1 text-sm font-medium text-slate-600">工場・職場がまだ登録されていません</p>
      <p className="mb-4 text-xs text-slate-400">副資材の在庫は職場ごとに管理します。まず工場と職場を登録してください。</p>
      <Link
        href="/sites"
        className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
      >
        <Factory className="h-4 w-4" />
        工場・職場を登録する
      </Link>
    </div>
  );
}
