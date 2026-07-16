// ===== ロケーション番号（エリア-棚-段-間口）ユーティリティ =====
//
// 書式: `{エリア}-{棚}-{段}-{間口}`  例) A-01-3-2
//   エリア area : 英大文字 1〜2字（A, B, AA）
//   棚     rack : 数字 2桁ゼロ埋め（01〜99）
//   段     level: 数字 1〜2桁（1〜99）
//   間口   bay  : 数字 1〜2桁（1〜99）
// 区切りは "-" 固定。QR/URL/CSV/DB すべて同一表記で統一する。

export interface LocParts {
  area: string;
  rack: string;
  level: string;
  bay: string;
}

const LOC_RE = /^([A-Z]{1,2})-(\d{2})-(\d{1,2})-(\d{1,2})$/;

/** ロケコード文字列 → 4値。書式不正なら null（scan/取込時の検証に使う）。 */
export function parseLocCode(code: string): LocParts | null {
  const m = code.trim().toUpperCase().match(LOC_RE);
  if (!m) return null;
  return { area: m[1], rack: m[2], level: m[3], bay: m[4] };
}

/** ロケコードとして妥当か（正規化後に一致するか）。 */
export function isLocCode(code: string): boolean {
  return LOC_RE.test(code.trim().toUpperCase());
}

/** 4値 → 正規化コード。棚は2桁ゼロ埋め、その他はゼロ埋めしない。 */
export function formatLocCode(p: {
  area: string;
  rack: string | number;
  level: string | number;
  bay: string | number;
}): string {
  const area = String(p.area).trim().toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(area)) throw new Error("エリアは A〜Z（1〜2字）で指定してください");
  const rackN = Number(p.rack);
  const levelN = Number(p.level);
  const bayN = Number(p.bay);
  if (![rackN, levelN, bayN].every((n) => Number.isInteger(n) && n >= 1 && n <= 99)) {
    throw new Error("棚・段・間口は 1〜99 の整数で指定してください");
  }
  const rack = String(rackN).padStart(2, "0");
  return `${area}-${rack}-${levelN}-${bayN}`;
}

/** 人間向けの説明ラベル（棚頭サイン・照会画面の見出し用）。 */
export function describeLoc(p: LocParts): string {
  return `${p.area}エリア ${Number(p.rack)}番棚 ${Number(p.level)}段 ${Number(p.bay)}間口`;
}
