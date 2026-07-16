import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getStocktake, listStocktakeLines } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { todayJST } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 棚卸明細（記入・差異）の CSV エクスポート。 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) return new Response("unauthorized", { status: 401 });
  const { id } = await params;

  const take = await getStocktake(session.user.companyId, id);
  if (!take) return new Response("not found", { status: 404 });
  const lines = await listStocktakeLines(session.user.companyId, id);

  const headers = ["ロケーション", "図番", "品名", "帳簿数", "実棚数", "差異", "単位", "記入者"];
  const rows = lines.map((l) => [
    l.locationCode,
    l.drawingNo,
    l.productName,
    l.bookQty,
    l.countedQty ?? "",
    l.diff ?? "",
    l.unit,
    l.countedBy ?? "",
  ]);

  const csv = toCsv(headers, rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stocktake-${todayJST()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
