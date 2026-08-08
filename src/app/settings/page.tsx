import { AlertTriangle } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getCompanySettings } from "@/lib/db";
import { updateAllowNegativeAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import MasterTabs from "@/components/MasterTabs";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { companyId, role } = await requireEntitledSession();
  const isAdmin = role === "admin";
  const settings = await getCompanySettings(companyId);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <PageHeader title="マスタ設定" description="品目・工場職場・取引先の各マスタと、在庫ルールを管理します。上のタブで切り替えます。作業者アカウントはポータルのユーザー設定で管理します。" />

      {isAdmin && <MasterTabs />}

      {/* 在庫アラートの通知先はアプリ内では設定しない（ポータルのユーザー設定が正） */}

      {/* 在庫ルール（マイナス在庫許容） */}
      {isAdmin && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <AlertTriangle className="h-4 w-4" />
            在庫ルール
          </h2>
          <p className="mb-4 text-xs text-slate-400">
            通常は在庫不足の払い出しを拒否します。記録が後追いになる現場では、マイナス在庫を許容できます。
          </p>
          <form action={updateAllowNegativeAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="allowNegative" value="false" />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                name="allowNegative"
                value="true"
                defaultChecked={settings.allowNegative}
                className="h-4 w-4 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500"
              />
              在庫不足でも払い出しを許可する（マイナス在庫を許容）
            </label>
            <SubmitButton pendingText="保存中…">保存</SubmitButton>
          </form>
        </div>
      )}

      {/* 作業者管理（旧・アプリ内名簿）は廃止。作業者アカウントはポータルのユーザー設定で管理する */}

      {/* アカウント管理はポータルのユーザー設定で行う（アプリ内には該当導線を持たない） */}
    </div>
  );
}
