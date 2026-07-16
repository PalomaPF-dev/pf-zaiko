// ===== QRコード ペイロード ユーティリティ =====
//
// 商品QR = `${origin}/products/${図番}` 、ロケQR = `${origin}/locations/${ロケコード}`。
// URL の末尾に「業務コード（図番／ロケコード）」を持たせることで、
//  ・カメラアプリで読んでもブラウザで開ける（ディープリンク）
//  ・ラベル印字・オフラインでも人間が目視照合できる
//  ・URLパース失敗時はコード直値にフォールバックできる（堅牢）
// を両立する。QRが潰れる小型テープ向けに「コード直値」で出す qrbody=code 運用も許容する。

import QRCode from "qrcode";
import { isLocCode } from "./location";

export type QrBody = "url" | "code";

/** 商品QRのペイロード文字列（code=在庫管理キー/商品CD/図番のいずれか）。 */
export function productQrPayload(origin: string, code: string, body: QrBody = "url"): string {
  if (body === "code") return code;
  return `${origin}/products/${encodeURIComponent(code)}`;
}

/** ロケQRのペイロード文字列。 */
export function locationQrPayload(origin: string, locCode: string, body: QrBody = "url"): string {
  if (body === "code") return locCode;
  return `${origin}/locations/${encodeURIComponent(locCode)}`;
}

/** 複数ペイロードをまとめて data URL 化（ラベル面付けでの一括生成用）。 */
export async function buildQrDataUrls(
  payloads: string[],
  opts: { width?: number; margin?: number } = {}
): Promise<Record<string, string>> {
  const width = opts.width ?? 240;
  const margin = opts.margin ?? 0;
  const uniq = Array.from(new Set(payloads));
  const entries = await Promise.all(
    uniq.map(async (p) => [p, await QRCode.toDataURL(p, { width, margin })] as const)
  );
  return Object.fromEntries(entries);
}

/** スキャン結果の解決結果。 */
export interface ScanResult {
  kind: "product" | "location";
  code: string;
}

/**
 * スキャン文字列を商品/ロケに解決する。
 * 1) 自アプリURLならパス末尾を業務コードとして抽出
 * 2) URLでなければ、ロケ書式に一致すればロケ、それ以外は商品（図番）として扱う
 */
export function resolveScan(text: string): ScanResult {
  const t = text.trim();
  try {
    const u = new URL(t);
    const mp = u.pathname.match(/\/products\/([^/?#]+)/);
    if (mp) return { kind: "product", code: decodeURIComponent(mp[1]) };
    const ml = u.pathname.match(/\/locations\/([^/?#]+)/);
    if (ml) return { kind: "location", code: decodeURIComponent(ml[1]) };
  } catch {
    /* URLでない = コード直値 */
  }
  if (isLocCode(t)) return { kind: "location", code: t.toUpperCase() };
  return { kind: "product", code: t };
}
