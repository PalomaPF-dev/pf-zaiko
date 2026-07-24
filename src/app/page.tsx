import Link from "next/link";
import {
  Package,
  Boxes,
  AlertTriangle,
  ArrowLeftRight,
  ClipboardCheck,
  ArrowDownToLine,
  Truck,
  PackageCheck,
  Factory,
  CheckCircle2,
  Circle,
  Sparkles,
} from "lucide-react";
import { requireEntitledSession } from "@/lib/session";
import { listStock, listTransactions, listStocktakes, listSites, listPendingPutaway, listIssueOrders } from "@/lib/db";
import { resolveCurrentWorkplace } from "@/lib/workplace";
import { currentScope } from "@/lib/scope";
import { formatDateTime, todayJST } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { TxTypeBadge } from "@/components/Badges";
import DbErrorState from "@/components/DbErrorState";
import NoWorkplaceState from "@/components/NoWorkplaceState";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireEntitledSession();

  // 工場スコープ（一般・作業者は自工場のみ。管理者・工場未設定は全工場）
  const { scope, siteId } = await currentScope();

  let workplace, sites, stock, todaysTx, stocktakes, pending, orders;
  try {
    [workplace, sites] = await Promise.all([
      resolveCurrentWorkplace(session.companyId),
      listSites(session.companyId, { siteId }),
    ]);
    if (workplace) {
      [stock, todaysTx, stocktakes, pending, orders] = await Promise.all([
        listStock(session.companyId, { workplaceId: workplace.id, nonZeroOnly: false }),
        listTransactions(session.companyId, { workplaceId: workplace.id, dateFrom: todayJST(), limit: 500 }),
        listStocktakes(session.companyId, { siteId }),
        listPendingPutaway(session.companyId, { siteId }),
        listIssueOrders(session.companyId, { siteId }),
      ]);
    }
  } catch (e) {
    console.error("[dashboard]", e);
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="ダッシュボード" />
        <DbErrorState />
      </div>
    );
  }

  // 未セットアップ（工場・職場が無い）の案内。
  // 工場スコープが効いているユーザーには、セットアップ手順ではなく「表示できるデータが無い」旨を出す
  // （工場・職場の登録は管理者のみ）。
  if (!workplace && scope) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="ダッシュボード" description={`${session.companyName} の副資材在庫`} />
        <NoWorkplaceState />
      </div>
    );
  }
  if (!workplace) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="ダッシュボード" description={`${session.companyName} の副資材在庫`} />
        <section className="rounded-2xl border-2 border-fuchsia-200 bg-fuchsia-50/60 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-fuchsia-800">
            <Sparkles className="h-4 w-4" />
            はじめての設定
          </h2>
          <p className="mt-1 text-xs text-fuchsia-700/80">
            副資材の在庫は職場ごとに管理します。次の順で準備してください。
          </p>
          <ol className="mt-3 space-y-2">
            <SetupStep done={sites.length > 0} label="① 工場・職場を登録する" description="工場を作り、その中に職場を登録します（在庫は職場ごとに独立）" href="/sites" linkLabel="工場・職場へ" />
            <SetupStep done={false} label="② 副資材を登録する" description="品名とメーカー品番で商品マスタに登録します" href="/products/new" linkLabel="副資材を登録" />
            <SetupStep done={false} label="③ ロケーションを作成する" description="職場の中に棚位置（エリア-棚-段-間口）を登録します" href="/locations/new" linkLabel="ロケを作成" />
          </ol>
        </section>
      </div>
    );
  }

  const rows = stock ?? [];
  const nonZero = rows.filter((r) => r.qty !== 0);
  const belowRows = rows.filter((r) => r.safetyStock != null && r.qty < r.safetyStock);
  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const openStocktakes = (stocktakes ?? []).filter((s) => s.status === "counting" || s.status === "review").length;
  const pendingCount = (pending ?? []).length;
  const openOrders = (orders ?? []).filter((o) => o.status === "open" || o.status === "picking").length;
  const recent = (todaysTx ?? []).slice(0, 8);
  const label = `${workplace.siteName}／${workplace.name}`;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="ダッシュボード"
        description={`${session.companyName} の副資材在庫`}
        action={
          <Link
            href="/inbound"
            className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
          >
            <ArrowDownToLine className="h-4 w-4" />
            入荷（受入）
          </Link>
        }
      />

      {/* 現在の職場 */}
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-50 px-3 py-1.5 text-sm font-semibold text-fuchsia-800">
        <Factory className="h-4 w-4" />
        {label}
      </div>

      {/* クイック操作 */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Link href="/inbound" className="flex flex-col items-center gap-2 rounded-2xl border border-fuchsia-200 bg-white p-4 text-center hover:bg-fuchsia-50">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-600">
            <ArrowDownToLine className="h-5 w-5" />
          </span>
          <span className="text-sm font-bold text-slate-800">入荷（受入）</span>
        </Link>
        <Link href="/putaway" className="flex flex-col items-center gap-2 rounded-2xl border border-amber-200 bg-white p-4 text-center hover:bg-amber-50">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <PackageCheck className="h-5 w-5" />
          </span>
          <span className="text-sm font-bold text-slate-800">入庫（棚入れ）</span>
        </Link>
        <Link href="/issue-orders" className="flex flex-col items-center gap-2 rounded-2xl border border-sky-200 bg-white p-4 text-center hover:bg-sky-50">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <Truck className="h-5 w-5" />
          </span>
          <span className="text-sm font-bold text-slate-800">出庫</span>
        </Link>
      </div>

      {/* 集計カード */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="在庫品目数（この職場）" value={nonZero.length} icon={Package} href="/stock" tone="slate" />
        <StatCard label="在庫合計（この職場）" value={totalQty} icon={Boxes} href="/stock" tone="green" />
        <StatCard label="安全在庫割れ" value={belowRows.length} icon={AlertTriangle} href="/stock?below=1" tone="red" />
        <StatCard label="未入庫（棚入れ待ち）" value={pendingCount} icon={PackageCheck} href="/putaway" tone="amber" />
        <StatCard label="未出庫の指示" value={openOrders} icon={Truck} href="/issue-orders" tone="sky" />
        <StatCard label="本日の受払" value={(todaysTx ?? []).length} icon={ArrowLeftRight} href="/records" tone="sky" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* 安全在庫割れ */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              安全在庫割れ（{belowRows.length} 件）
            </h2>
            <Link href="/stock?below=1" className="text-xs font-medium text-fuchsia-600 hover:underline">
              在庫台帳へ
            </Link>
          </div>
          {belowRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">安全在庫を下回る副資材はありません。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {belowRows.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <Link href={`/products/${r.productId}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">
                        {r.productName}
                        <span className="ml-2 font-mono text-xs font-normal text-slate-400">{r.makerCode ?? r.drawingNo}</span>
                      </div>
                      <div className="truncate text-xs text-slate-400">
                        現在庫 {r.qty}
                        {r.unit} ／ 安全在庫 {r.safetyStock}
                        {r.unit}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-600/20">
                      不足 {r.safetyStock != null ? r.safetyStock - r.qty : 0}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 本日の受払 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <ArrowLeftRight className="h-4 w-4 text-sky-500" />
              本日の受払
              {openStocktakes > 0 && (
                <Link href="/stocktakes" className="ml-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                  <ClipboardCheck className="h-3 w-3" />
                  棚卸 {openStocktakes}
                </Link>
              )}
            </h2>
            <Link href="/records" className="text-xs font-medium text-fuchsia-600 hover:underline">
              すべて見る
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">本日の受払はまだありません。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <TxTypeBadge type={t.txType} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {t.productName}
                      <span className="ml-2 font-mono text-xs font-normal text-slate-400">{t.makerCode ?? t.drawingNo}</span>
                    </div>
                    <div className="truncate text-xs text-slate-400">{formatDateTime(t.createdAt)}</div>
                  </div>
                  <span className={`shrink-0 text-sm font-bold tabular-nums ${t.qtyDelta >= 0 ? "text-fuchsia-600" : "text-red-600"}`}>
                    {t.qtyDelta >= 0 ? "+" : ""}
                    {t.qtyDelta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SetupStep({
  done,
  label,
  description,
  href,
  linkLabel,
}: {
  done: boolean;
  label: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-fuchsia-100 bg-white px-3 py-2.5">
      {done ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
      ) : (
        <Circle className="h-5 w-5 shrink-0 text-slate-300" />
      )}
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>{label}</div>
        <div className="text-xs text-slate-400">{description}</div>
      </div>
      {!done && (
        <Link href={href} className="shrink-0 rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-fuchsia-700">
          {linkLabel}
        </Link>
      )}
    </li>
  );
}

const TONE: Record<string, string> = {
  slate: "text-slate-600 bg-slate-100",
  red: "text-red-600 bg-red-50",
  green: "text-fuchsia-600 bg-fuchsia-50",
  amber: "text-amber-600 bg-amber-50",
  sky: "text-sky-600 bg-sky-50",
};

function StatCard({
  label,
  value,
  icon: Icon,
  href,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  tone: keyof typeof TONE;
}) {
  return (
    <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm">
      <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl ${TONE[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-2xl font-bold text-slate-800">{value.toLocaleString()}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </Link>
  );
}
