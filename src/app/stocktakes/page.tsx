import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { listStocktakes } from "@/lib/db";
import { currentScope } from "@/lib/scope";
import { formatDateTime } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { StocktakeStatusBadge } from "@/components/Badges";
import DbErrorState from "@/components/DbErrorState";
import ViewOnlySiteNotice from "@/components/ViewOnlySiteNotice";
import { currentWorkplaceOperation } from "@/lib/workplace";

export const dynamic = "force-dynamic";

export default async function StocktakesPage() {
  const session = await requireEntitledSession();

  const { siteId } = await currentScope();
  const { operable } = await currentWorkplaceOperation(session.companyId);

  let takes;
  try {
    takes = await listStocktakes(session.companyId, { siteId });
  } catch (e) {
    console.error("[stocktakes]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="棚卸" />
        <DbErrorState />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="棚卸"
        description="指示 → 記入リスト → 実棚入力 → 差異確認 → 在庫反映 の流れで棚卸します。"
        action={
          operable ? (
            <Link
              href="/stocktakes/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
            >
              <Plus className="h-4 w-4" />
              棚卸を開始
            </Link>
          ) : null
        }
      />

      <ViewOnlySiteNotice companyId={session.companyId} />

      {takes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <ClipboardCheck className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">棚卸はまだありません。</p>
          {operable && (
            <Link href="/stocktakes/new" className="mt-3 inline-block text-sm font-medium text-fuchsia-600 hover:underline">
              棚卸を開始する
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {takes.map((t) => (
            <Link
              key={t.id}
              href={`/stocktakes/${t.id}`}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-slate-800">{t.title}</span>
                  <StocktakeStatusBadge status={t.status} />
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {t.scopeArea ? `${t.scopeArea} ・ ` : ""}
                  {t.createdBy} ・ {formatDateTime(t.createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <div className="text-xs text-slate-400">進捗</div>
                  <div className="font-bold tabular-nums text-slate-700">
                    {t.countedCount}/{t.lineCount}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">差異</div>
                  <div className={`font-bold tabular-nums ${t.diffCount > 0 ? "text-amber-600" : "text-slate-400"}`}>{t.diffCount}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
