import { Eye } from "lucide-react";
import { currentWorkplaceOperation } from "@/lib/workplace";

/**
 * 「いま選んでいる職場では入出庫できない」ことの案内バナー。
 *
 * 閲覧・入出庫のスコープはどちらも工場基準（工場所属者は管理者でも自工場のみ、
 * 工場未所属は制限なし）のため、通常ここに該当するのは所属工場名が工場マスタに
 * 一致せず職場を解決できないケース。万一スコープ外の職場が選ばれていた場合の
 * 案内も残す（安全側）。サーバー側の実施は scope.ts の assert* が行う。
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
          {operableFactory}の職場がポータルの部署設定に登録されているかご確認ください。
        </span>
      )}
    </div>
  );
}
