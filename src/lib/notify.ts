import { Resend } from "resend";

const APP_URL = process.env.APP_URL || "https://zaiko.paloma-pf.com";

// ===== 安全在庫割れ アラートメール =====

export interface StockAlertLine {
  drawingNo: string;
  name: string;
  totalQty: number;
  safetyStock: number;
  unit: string;
}

export interface StockAlertPayload {
  companyName: string;
  lines: StockAlertLine[];
}

/**
 * 安全在庫を下回った商品の一覧を管理者へ通知する。
 * RESEND_API_KEY 未設定 or 宛先ゼロなら送信をスキップ（false）。
 */
export async function sendStockAlert(to: string[], payload: StockAlertPayload): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || to.length === 0 || payload.lines.length === 0) {
    console.warn("[notify] stock alert skipped:", key ? "no recipients/lines" : "no RESEND_API_KEY");
    return false;
  }
  const resend = new Resend(key);
  const from = process.env.ALERT_MAIL_FROM || "PF在庫管理 <onboarding@resend.dev>";
  // MAIL_REPLY_TO（設定時のみ）を既定の Reply-To として付与
  const replyTo = process.env.MAIL_REPLY_TO?.trim() || undefined;
  const stockUrl = `${APP_URL}/stock?below=1`;

  const lines = payload.lines
    .map((l) => `・${l.drawingNo} ${l.name}：現在庫 ${l.totalQty}${l.unit}（安全在庫 ${l.safetyStock}${l.unit}）`)
    .join("\n");

  const subject = `【在庫アラート・${payload.lines.length}件】安全在庫割れ - PF在庫管理`;
  const text =
    `${payload.companyName} ご担当者様\n\n` +
    `安全在庫を下回った商品があります。発注・補充をご検討ください。\n\n` +
    `▼ 在庫台帳（安全在庫割れ）\n${stockUrl}\n\n` +
    `--- 対象商品 ---\n${lines}\n\n— PF在庫管理（自動送信）`;

  try {
    await resend.emails.send({ from, to, subject, text, ...(replyTo ? { replyTo } : {}) });
    return true;
  } catch (e) {
    console.error("[notify] stock alert failed:", e);
    return false;
  }
}
