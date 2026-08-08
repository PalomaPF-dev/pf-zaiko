// ===== 品目コード（資材W/F）のユーティリティ =====
//
// 資材W/F の品目コードは「図番1(2桁) + 図番2(5桁) + 図番3(2桁)」の9桁。
// 帳票では 06-26105-00 のようにハイフン区切りで書かれるため、入力・表示の
// 両方を面倒みる。サーバー/クライアントの両方から使うので副作用なしで保つ。

/** 品目コードの桁数（図番1:2 + 図番2:5 + 図番3:2） */
export const ITEM_CODE_LENGTH = 9;

/**
 * 入力された品目コードを検索キー（数字9桁）へ正規化する。
 * 「06-26105-00」「06 26105 00」「6261050 0」などの揺れを吸収し、
 * 9桁に満たない数字だけの入力は先頭を0で埋める（W/F の表示が先頭0落ちしていることがあるため）。
 * 9桁の数字にできない入力は null（＝品目コードではない）。
 */
export function normalizeItemCode(input: string): string | null {
  const digits = input.replace(/[^0-9]/g, "");
  if (digits.length === 0 || digits.length > ITEM_CODE_LENGTH) return null;
  return digits.padStart(ITEM_CODE_LENGTH, "0");
}

/** 表示用のハイフン区切り（062610500 → 06-26105-00）。9桁でなければそのまま返す。 */
export function formatItemCode(code: string): string {
  if (!/^[0-9]{9}$/.test(code)) return code;
  return `${code.slice(0, 2)}-${code.slice(2, 7)}-${code.slice(7)}`;
}

/**
 * 資材W/F の単位コード → 表示名の対応表。
 *
 * W/F 側の単位コード表（01〜47）はこの品目カタログのエクスポートに含まれていないため、
 * 既定では空にしてある（推測で単位名を当てると現品票やピッキングリストに誤った単位が
 * 印字されてしまう）。W/F の単位コード表を入手したら、ここへ
 *   "01": "個", "03": "kg", …
 * のように追記すれば、品目カタログ画面と品目登録の初期値に反映される。
 * 未登録のコードは「単位コード 03」のように、コードのまま表示する。
 */
export const ITEM_UNIT_LABELS: Record<string, string> = {};

/** 単位コードの表示文字列。対応表にあれば単位名、無ければコードをそのまま返す。 */
export function itemUnitLabel(code: string | null): string {
  if (!code) return "";
  return ITEM_UNIT_LABELS[code] ?? code;
}

/** 品目マスタ（products）の「単位」欄の初期値。単位名が判明しているときだけ埋める（コードは入れない）。 */
export function itemUnitForProduct(code: string | null): string | null {
  if (!code) return null;
  return ITEM_UNIT_LABELS[code] ?? null;
}
