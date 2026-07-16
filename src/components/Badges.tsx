import { TX_TYPE_LABEL, STOCKTAKE_STATUS_LABEL, type TxType, type StocktakeStatus } from "@/lib/types";

const TX_STYLE: Record<TxType, string> = {
  receipt: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20",
  putaway: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20",
  issue: "bg-red-50 text-red-700 ring-red-600/20",
  adjust: "bg-amber-50 text-amber-700 ring-amber-600/20",
  stocktake: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  move_in: "bg-sky-50 text-sky-700 ring-sky-600/20",
  move_out: "bg-sky-50 text-sky-700 ring-sky-600/20",
};

export function TxTypeBadge({ type }: { type: TxType }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${TX_STYLE[type]}`}
    >
      {TX_TYPE_LABEL[type]}
    </span>
  );
}

const STOCKTAKE_STYLE: Record<StocktakeStatus, string> = {
  counting: "bg-sky-50 text-sky-700 ring-sky-600/20",
  review: "bg-amber-50 text-amber-700 ring-amber-600/20",
  applied: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-500/20",
};

export function StocktakeStatusBadge({ status }: { status: StocktakeStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${STOCKTAKE_STYLE[status]}`}
    >
      {STOCKTAKE_STATUS_LABEL[status]}
    </span>
  );
}

/** 安全在庫割れバッジ。 */
export function BelowSafetyBadge() {
  return (
    <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-600/20">
      安全在庫割れ
    </span>
  );
}
