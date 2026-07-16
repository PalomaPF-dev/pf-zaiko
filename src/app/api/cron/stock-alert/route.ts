import { listActiveCompanies, listBelowSafety, resolveNotifyRecipients, cleanupOldDemos } from "@/lib/db";
import { sendStockAlert, type StockAlertLine } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 安全在庫割れの日次アラート（Vercel Cron から毎日呼ばれる）。
 * 各会社の安全在庫割れ商品を集計し、通知先へメール送信する。
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
      const below = await listBelowSafety(company.id);
      if (below.length === 0) continue;
      const recipients = await resolveNotifyRecipients(company.id);
      if (recipients.length === 0) continue;
      const lines: StockAlertLine[] = below.map((p) => ({
        drawingNo: p.drawingNo,
        name: p.name,
        totalQty: p.totalQty,
        safetyStock: p.safetyStock ?? 0,
        unit: p.unit,
      }));
      const ok = await sendStockAlert(recipients, { companyName: company.name, lines });
      if (ok) sent++;
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
