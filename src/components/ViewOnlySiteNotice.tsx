import { Eye } from "lucide-react";
import { currentWorkplaceOperation } from "@/lib/workplace";

/**
 * 「いま選んでいる職場では入出庫できない」ことの案内バナー。
 *
 * 管理者は全工場を閲覧できるが、入出庫できるのは所属工場だけ（工場に所属していない
 * ポータル管理者などは全工場で入出庫できる）。他工場の職場を選んで見ているときに、
 * ボタンが効かない理由をその場で示す。サーバー側の実施は scope.ts の assert* が行う。
 */
export default async function ViewOnlySiteNotice({ companyId }: { companyId: string }) {
  const { workplace, operable, operableFactory } = await currentWorkplaceOperation(companyId);
  if (operable || !operableFactory) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <Eye className="mt-0.5 h-4 w-4 shrink-0" />
      {workplace ? (
        <span>
          <b>閲覧のみ</b>：{workplace.siteName}／{workplace.name} は所属工場（{operableFactory}）以外のため、
          入出庫はできません。入出庫するときは、ヘッダの職場セレクタで{operableFactory}の職場に切り替えてください。
        </span>
      ) : (
        <span>
          <b>閲覧のみ</b>：入出庫できる職場が選択されていません。
          {operableFactory}の職場が登録されているか、管理者にご確認ください。
        </span>
      )}
    </div>
  );
}
