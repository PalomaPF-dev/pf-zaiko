import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { listStock, getWorkplace } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { todayJST } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 在庫台帳の CSV エクスポート（現在の職場の副資材在庫）。 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) return new Response("unauthorized", { status: 401 });
  const companyId = session.user.companyId;

  const url = new URL(req.url);
  const workplaceId = url.searchParams.get("workplace") || null;
  const workplace = workplaceId ? await getWorkplace(companyId, workplaceId) : null;
  const rows = await listStock(companyId, {
    workplaceId,
    search: url.searchParams.get("q") || null,
    nonZeroOnly: true,
    limit: 5000,
  });

  const label = workplace ? `${workplace.siteName}／${workplace.name}` : "";
  const headers = ["工場・職場", "品名", "メーカー品番", "規格", "数量", "単位", "安全在庫"];
  const data = rows.map((r) => [label, r.productName, r.makerCode ?? r.drawingNo, r.spec ?? "", r.qty, r.unit, r.safetyStock]);

  const csv = toCsv(headers, data);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stock-${todayJST()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
