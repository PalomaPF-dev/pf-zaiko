import { Factory } from "lucide-react";
import { currentSiteScope } from "@/lib/scope";

/** ポータルの管理画面（部署設定）。工場・職場はここで登録する。 */
const PORTAL_ADMIN_URL = "https://portal.paloma-pf.com/admin.html";

/**
 * 現在の職場が決まらないときの案内。
 * 工場所属のユーザー（管理者含む）には自工場の職場が無い（または所属工場名が
 * 工場マスタに無い）ことを、工場未所属のユーザーには全体が未連動なことを伝える。
 * 工場・職場はポータルの部署設定が正で、このアプリでは登録・編集できない（ポータルから連動される）。
 */
export default async function NoWorkplaceState() {
  const scope = await currentSiteScope();
  if (scope) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <Factory className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        <p className="mb-1 text-sm font-medium text-slate-600">
          {scope.factory}に表示できるデータがありません
        </p>
        <p className="text-xs text-slate-400">
          {scope.siteId
            ? `${scope.factory}に職場が連動されていません。ポータルの部署設定で職場を登録すると、この在庫管理へ連動されます。`
            : `${scope.factory}が工場マスタに連動されていません。ポータルの部署設定（部署種別「工場」）をご確認ください。`}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <Factory className="mx-auto mb-3 h-8 w-8 text-slate-300" />
      <p className="mb-1 text-sm font-medium text-slate-600">工場・職場がまだ連動されていません</p>
      <p className="mb-4 text-xs leading-relaxed text-slate-400">
        副資材の在庫は職場ごとに管理します。工場・職場は
        <span className="font-medium text-slate-500">ポータルの部署設定</span>が正で、
        ポータルで工場（部署種別「工場」）と職場を登録すると、この在庫管理へ自動で連動されます。
      </p>
      <a
        href={PORTAL_ADMIN_URL}
        className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
      >
        <Factory className="h-4 w-4" />
        ポータルの部署設定を開く
      </a>
    </div>
  );
}
