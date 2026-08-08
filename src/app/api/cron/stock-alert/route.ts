import {
  listActiveCompanies,
  listBelowSafetyByFactory,
  listApproverEmails,
  cleanupOldDemos,
} from "@/lib/db";
import { sendStockAlert, type StockAlertLine } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 安全在庫割れの日次アラート（Vercel Cron から毎日呼ばれる）。
 *
 * 宛先はポータルで**承認者として指名されている人**（職場の管理者）。工場ごとに分けて送り、
 * 各工場の承認者にはその工場に在庫がある品目だけを知らせる。在庫がどこにも無い品目は
 * 全工場の承認者へまとめて送る。承認者が居ない工場には送らない。
 *
 * CRON_SECRET が設定されている場合は Authorization: Bearer で認証（Vercel Cron が自動付与）。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  let sent = 0;
  let checked = 0;
  try {
    await cleanupOldDemos();
    const companies = await listActiveCompanies();
    for (const company of companies) {
      checked++;
      const groups = await listBelowSafetyByFactory(company.id);
      if (groups.length === 0) continue;
      for (const group of groups) {
        // 工場が特定できない品目（在庫ゼロ等）は全工場の承認者へ
        const recipients = await listApproverEmails(company.id, group.factory);
        if (recipients.length === 0) continue;
        const lines: StockAlertLine[] = group.items.map((p) => ({
          drawingNo: p.drawingNo,
          name: p.name,
          totalQty: p.totalQty,
          safetyStock: p.safetyStock,
          unit: p.unit,
        }));
        const ok = await sendStockAlert(recipients, {
          companyName: group.factory ? `${company.name}（${group.factory}）` : company.name,
          lines,
        });
        if (ok) sent++;
      }
    }
  } catch (e) {
    console.error("[cron stock-alert]", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, checked, sent }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
