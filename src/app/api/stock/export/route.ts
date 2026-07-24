import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { listStock, getWorkplace } from "@/lib/db";
import { currentScope, isSiteInScope } from "@/lib/scope";
import { toCsv } from "@/lib/csv";
import { todayJST } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 在庫台帳の CSV エクスポート（現在の職場の副資材在庫）。 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) return new Response("unauthorized", { status: 401 });
  const companyId = session.user.companyId;

  // 工場スコープ: クエリの職場が自工場外なら siteId 条件で必ず 0 件になる
  const { siteId } = await currentScope();
  const url = new URL(req.url);
  const workplaceId = url.searchParams.get("workplace") || null;
  const workplace = workplaceId ? await getWorkplace(companyId, workplaceId) : null;
  const rows = await listStock(companyId, {
    workplaceId,
    siteId,
    search: url.searchParams.get("q") || null,
    nonZeroOnly: true,
    limit: 5000,
  });

  // 見出しの職場名もスコープ内のときだけ出す（他工場の職場名を漏らさない）
  const label = workplace && (await isSiteInScope(workplace.siteId)) ? `${workplace.siteName}／${workplace.name}` : "";
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
