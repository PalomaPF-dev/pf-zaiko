import Link from "next/link";
import { ArrowDownToLine, Truck } from "lucide-react";

/**
 * 在庫一覧の各行から「入出庫の手続き」へ誘導する。
 * その場で在庫を増減すると受払の伝履歴（受入伝票・出庫指示）が残らないため、
 * 入庫は入荷（受入）→入庫（棚入れ）、出庫は出庫指示のフローへ進んでもらう。
 */
export default function StockRowActions() {
  return (
    <div className="flex justify-end gap-1">
      <Link
        href="/inbound"
        title="入荷（受入）→ 入庫（棚入れ）の手続きへ"
        className="inline-flex items-center gap-0.5 rounded-md border border-fuchsia-200 bg-fuchsia-50 px-2 py-1 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
      >
        <ArrowDownToLine className="h-3 w-3" />
        入庫
      </Link>
      <Link
        href="/issue-orders"
        title="出庫指示の手続きへ"
        className="inline-flex items-center gap-0.5 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
      >
        <Truck className="h-3 w-3" />
        出庫
      </Link>
    </div>
  );
}
