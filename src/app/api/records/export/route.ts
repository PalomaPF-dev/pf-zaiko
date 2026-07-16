import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { listTransactions } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { formatDateTime, todayJST } from "@/lib/format";
import { TX_TYPE_LABEL, IO_TX_TYPES, type TxType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL_TX_TYPES: TxType[] = [...IO_TX_TYPES, "move_in", "move_out", "stocktake"];

/** 受払履歴の CSV エクスポート（画面と同じフィルタを URL クエリで受ける）。 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) {
    return new Response("unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const typeRaw = url.searchParams.get("type");
  const txType = (ALL_TX_TYPES as string[]).includes(typeRaw ?? "") ? (typeRaw as TxType) : null;

  const txs = await listTransactions(session.user.companyId, {
    workplaceId: url.searchParams.get("workplace") || null,
    productId: url.searchParams.get("product") || null,
    txType,
    dateFrom: url.searchParams.get("from") || null,
    dateTo: url.searchParams.get("to") || null,
    limit: 5000,
  });

  const headers = ["日時", "区分", "品名", "メーカー品番", "置き場", "増減", "残数", "単位", "伝票/ロット", "取引先", "納入場所", "実施者", "備考"];
  const rows = txs.map((t) => [
    formatDateTime(t.createdAt),
    TX_TYPE_LABEL[t.txType],
    t.productName,
    t.makerCode ?? t.drawingNo,
    t.locationCode,
    t.qtyDelta,
    t.qtyAfter,
    t.unit,
    t.refNo,
    t.partnerName,
    t.deliverTo,
    t.operator,
    t.note,
  ]);

  const csv = toCsv(headers, rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${todayJST()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
