import { Bell, AlertTriangle } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { getCompanySettings } from "@/lib/db";
import { updateNotifyEmailsAction, updateAllowNegativeAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import MasterTabs from "@/components/MasterTabs";

export const dynamic = "force-dynamic";

const input =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";

export default async function SettingsPage() {
  const { companyId, email, role } = await requireEntitledSession();
  const isAdmin = role === "admin";
  const settings = await getCompanySettings(companyId);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <PageHeader title="マスタ設定" description="品目・工場職場・取引先の各マスタと、在庫ルール・通知先を管理します。上のタブで切り替えます。作業者アカウントはポータルのユーザー設定で管理します。" />

      {isAdmin && <MasterTabs />}

      {/* 在庫アラート通知先（マスタ設定＝管理者のみ） */}
      {isAdmin && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <Bell className="h-4 w-4" />
            在庫アラート通知先
          </h2>
          <p className="mb-4 text-xs text-slate-400">
            安全在庫を下回った品目を毎日の定期チェックで検出し、以下のアドレスへメール通知します。
            カンマ区切りで複数指定できます。未設定なら登録ユーザー全員
            {!email ? "（メールアドレス登録済みの方）" : `（${email} など）`}に送信します。
          </p>
          <form action={updateNotifyEmailsAction} className="flex flex-col gap-4">
            <textarea
              name="emails"
              defaultValue={settings.notifyEmails}
              rows={3}
              placeholder="shizai@example.co.jp, koujou-cho@example.co.jp"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
            />
            <div>
              <SubmitButton pendingText="保存中…">設定を保存</SubmitButton>
            </div>
          </form>
        </div>
      )}

      {/* 在庫ルール（マイナス在庫許容） */}
      {isAdmin && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
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

      {/* アカウントの発行・削除はポータルで管理する（アプリ内には退会導線を持たない） */}
    </div>
  );
}
