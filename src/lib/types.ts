// ===== PF在庫管理 ドメイン型 =====

/** 在庫単位（数量の単位） */
export const DEFAULT_UNIT = "個";

/** 工場（拠点）。副資材在庫は 工場 > 職場 の単位で独立管理する。 */
export interface Site {
  id: string;
  companyId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

/** 職場（工場配下）。副資材在庫の独立単位。 */
export interface Workplace {
  id: string;
  companyId: string;
  siteId: string;
  name: string;
  sortOrder: number;
  mapImageUrl: string | null; // 見取り図（エリアマップ）画像URL
  createdAt: string;
}

/** 見取り図上のエリア位置ピン（座標は画像に対する % 0-100）。 */
export interface AreaPin {
  area: string;
  x: number;
  y: number;
}

/** 職場＋工場名（一覧・職場セレクタ表示用） */
export interface WorkplaceWithSite extends Workplace {
  siteName: string;
}

/** 受払処理区分（transactions.tx_type）。符号は qty_delta 側で表現する。 */
export type TxType =
  | "receipt" // 入荷（+）
  | "putaway" // 入庫・棚入れ（+：受入をロケへ棚入れ）
  | "issue" // 出荷（-）
  | "adjust" // 調整（±：手動修正）
  | "stocktake" // 棚卸差異（±：棚卸反映）
  | "move_in" // 移動入（+：ロケ間移動の受け）
  | "move_out"; // 移動出（-：ロケ間移動の出し）

export const TX_TYPE_LABEL: Record<TxType, string> = {
  receipt: "入荷",
  putaway: "入庫",
  issue: "出荷",
  adjust: "調整",
  stocktake: "棚卸差異",
  move_in: "移動入",
  move_out: "移動出",
};

/** 入出庫フォームで直接選べる区分（移動と棚卸差異はそれぞれ専用フローで作る） */
export const IO_TX_TYPES: TxType[] = ["receipt", "issue", "adjust"];

/** 商品（マスタ。QRラベルの親） */
export interface Product {
  id: string;
  companyId: string;
  drawingNo: string; // 図番（会社内一意。図面との紐付けキー）
  productCode: string | null; // 商品CD（社内の商品コード）
  stockKey: string | null; // 在庫管理キー（ZK+番号。QR/ピッキングの追跡キー）
  name: string; // 品名
  spec: string | null; // 規格・型式
  unit: string; // 数量単位（個・本・袋・kg など）
  lotSize: number | null; // ロットサイズ（荷姿1ロットあたりの数量）
  safetyStock: number | null; // 安全在庫（下限）。NULL ならアラート対象外
  category: string | null; // 分類
  maker: string | null; // メーカー
  makerCode: string | null; // メーカー品番（型番。副資材の主識別）
  supplier: string | null; // 購入先
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** QR・ラベルに載せる商品コード（副資材=メーカー品番を最優先→在庫管理キー→商品CD→図番）。 */
export function productLabelCode(
  p: Pick<Product, "stockKey" | "productCode" | "drawingNo"> & { makerCode?: string | null },
): string {
  return p.makerCode || p.stockKey || p.productCode || p.drawingNo || "";
}

/** 商品＋現在庫合計（一覧・ラベル表示用） */
export interface ProductWithStock extends Product {
  totalQty: number; // 全ロケ合計の現在庫
  locationCount: number; // 在庫のあるロケ数
  belowSafety: boolean; // 安全在庫割れか
}

/**
 * 品目マスタの1件（資材W/F から取り込んだ参照カタログ）。
 * 在庫は持たない。品目コードで呼び出して商品（Product）を起こすための元データ。
 * 数量系は W/F の値をそのまま持つため小数がありうる（在庫数の integer とは別物）。
 */
export interface ItemMaster {
  code: string; // 品目コード（図番9桁）
  name: string; // 部品名
  supplierCode: string | null; // 外注コード（代表）
  supplierName: string | null; // 外注名（代表）
  altSuppliers: string | null; // 併用仕入先（代表以外。／区切り）
  unitCode: string | null; // 単位（W/Fの単位コード）
  packQty: number | null; // 入数
  packUnitCode: string | null; // 入数単位（W/Fの単位コード）
  lotQty: number | null; // ロット数
  roundQty: number | null; // まるめ（発注単位）
  container: string | null; // 容器
  accountCode: string | null; // 受入科目
  unitPrice: number | null; // 納入単価
  validFrom: string | null; // 有効開始日（YYYYMMDD）
  validTo: string | null; // 有効終了日（YYYYMMDD）
  active: boolean; // 取込時点で有効な品目か
}

/** 品目マスタ＋在庫アプリ側の登録状況（一覧・呼び出し用） */
export interface ItemMasterWithProduct extends ItemMaster {
  productId: string | null; // 商品として登録済みならその ID（未登録なら null）
}

/** 品目コード呼び出し（/api/items/lookup）のレスポンス。単位コードは表示名に解決済み。 */
export interface ItemMasterLookup extends ItemMasterWithProduct {
  unitLabel: string;
  packUnitLabel: string;
}

/** 品目マスタの取込状況（会社ごと） */
export interface ItemMasterImport {
  version: string; // 取込元スナップショットの基準日（YYYYMMDD）
  itemCount: number;
  importedAt: string;
}

/** ロケーション階層（採番マスタ） */
export interface LocArea {
  id: string;
  code: string; // 'A'
  name: string | null; // '第1倉庫'
  sortOrder: number;
}

/** ロケーション（置き場）。副資材では「職場＋置き場名」で扱い、棚-段-間口は任意。 */
export interface Location {
  id: string;
  companyId: string;
  code: string; // QR・検索キー（副資材=職場コード＋置き場、直材=A-01-3-2）
  siteId: string | null; // 所属工場
  workplaceId: string | null; // 所属職場（副資材在庫の独立単位）
  area: string; // 'A'（任意）
  rack: string; // '01'（任意）
  level: string; // '3'（任意）
  bay: string; // '2'（任意）
  name: string | null; // 置き場の呼称
  active: boolean;
  createdAt: string;
}

/** ロケーション＋在庫サマリ（一覧表示用） */
export interface LocationWithStock extends Location {
  productCount: number; // このロケに在庫がある商品数
  totalQty: number; // このロケの在庫合計
}

/** 在庫台帳の1行（商品×ロケ×数量） */
export interface StockRow {
  id: string;
  productId: string;
  locationId: string;
  qty: number;
  updatedAt: string;
}

/** 在庫台帳（商品・ロケ情報を JOIN 済み） */
export interface StockWithMeta extends StockRow {
  drawingNo: string;
  makerCode: string | null;
  spec: string | null;
  productName: string;
  unit: string;
  safetyStock: number | null;
  locationCode: string;
}

/** 受払トランザクション（追記専用の証跡ログ） */
export interface Transaction {
  id: string;
  productId: string;
  locationId: string;
  txType: TxType;
  qtyDelta: number; // 符号付き
  qtyAfter: number; // この処理後のロケ在庫（監査スナップショット）
  refNo: string | null; // 伝票番号・納品No・ロットNo
  operator: string; // 実施者名
  stocktakeId: string | null;
  deliverTo: string | null; // 納入場所（入荷現品票用）
  issueOrderId: string | null; // 出庫指示との紐付け
  partnerName: string | null; // 取引先名（入荷=仕入先 / 移動=移動先）
  note: string | null;
  createdAt: string;
}

/** 受払照会用（商品・ロケ情報を JOIN 済み） */
export interface TransactionWithMeta extends Transaction {
  drawingNo: string;
  makerCode: string | null;
  productName: string;
  unit: string;
  locationCode: string;
}

/** 棚卸のステータス */
export type StocktakeStatus = "counting" | "review" | "applied" | "cancelled";

export const STOCKTAKE_STATUS_LABEL: Record<StocktakeStatus, string> = {
  counting: "棚卸中",
  review: "差異確認",
  applied: "反映済",
  cancelled: "中止",
};

/** 棚卸（指示） */
export interface Stocktake {
  id: string;
  title: string;
  scopeArea: string | null; // 対象エリア絞り（NULL なら全社）
  status: StocktakeStatus;
  createdBy: string;
  appliedAt: string | null;
  createdAt: string;
}

/** 棚卸＋進捗サマリ（一覧表示用） */
export interface StocktakeWithProgress extends Stocktake {
  lineCount: number;
  countedCount: number;
  diffCount: number; // 差異のある行数（counted 済みのうち diff != 0）
}

/** 棚卸明細（商品×ロケ 1行） */
export interface StocktakeLine {
  id: string;
  stocktakeId: string;
  productId: string;
  locationId: string;
  bookQty: number; // 帳簿在庫（指示作成時のスナップショット）
  countedQty: number | null; // 実棚数（NULL=未カウント）
  diff: number | null; // counted - book
  countedBy: string | null;
  countedAt: string | null;
}

/** 棚卸明細＋商品・ロケ情報（入力・印刷用） */
export interface StocktakeLineWithMeta extends StocktakeLine {
  drawingNo: string;
  productName: string;
  unit: string;
  locationCode: string;
}

/** 取引先の種別（仕入先 / 出荷先=顧客 / 移動先=社内） */
export type PartnerKind = "supplier" | "customer" | "internal";

export const PARTNER_KIND_LABEL: Record<PartnerKind, string> = {
  supplier: "仕入先",
  customer: "出荷先",
  internal: "移動先",
};

/** 取引先マスタ（仕入先・出荷先・移動先） */
export interface Partner {
  id: string;
  kind: PartnerKind;
  code: string | null;
  name: string;
  contact: string | null; // 担当・連絡先
  notes: string | null;
  active: boolean;
  createdAt: string;
}

/** 出庫指示のステータス */
export type IssueOrderStatus = "open" | "picking" | "done" | "cancelled";

export const ISSUE_ORDER_STATUS_LABEL: Record<IssueOrderStatus, string> = {
  open: "未出庫",
  picking: "出庫中",
  done: "出庫完了",
  cancelled: "中止",
};

/** 出庫指示（出荷オーダーのヘッダ） */
export interface IssueOrder {
  id: string;
  orderNo: string; // 出庫指示No / 伝票No（例 SY0000843）
  customer: string | null; // 得意先
  deliverTo: string | null; // 納入先
  shipGroup: string | null; // 出荷グループ
  shipDate: string | null; // 出荷予定日
  pickDate: string | null; // 荷揃え日
  status: IssueOrderStatus;
  createdBy: string;
  createdAt: string;
}

/** 出庫指示＋進捗（一覧用） */
export interface IssueOrderWithProgress extends IssueOrder {
  lineCount: number;
  issuedCount: number; // 出庫完了した明細数
}

/** 出庫指示 明細（商品×引当ロケ×数量） */
export interface IssueOrderLine {
  id: string;
  orderId: string;
  seq: number; // 予定行No
  productId: string;
  locationId: string | null; // 引当ロケ
  lotNo: string | null;
  qtyPlanned: number; // 出荷予定数
  qtyInstructed: number; // 指示数
  qtyIssued: number; // 実出庫数
}

/** 出庫指示 明細＋商品・ロケ情報（ピッキングリスト用） */
export interface IssueOrderLineWithMeta extends IssueOrderLine {
  drawingNo: string;
  productCode: string | null;
  stockKey: string | null;
  productName: string;
  unit: string;
  lotSize: number | null; // 荷姿1ロットあたりの数量
  locationCode: string | null;
  stockOnHand: number; // 引当ロケの現在庫（在庫残数の元）
}

/** 受入伝票のステータス */
export type ReceiptStatus = "open" | "done" | "cancelled";

export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = {
  open: "受入中",
  done: "入庫済",
  cancelled: "中止",
};

/** 受入伝票（入荷＝受入のヘッダ。ロケーションは持たない） */
export interface Receipt {
  id: string;
  receiptNo: string; // 受入No（例 NH0000012）
  deliverTo: string | null; // 納入場所
  status: ReceiptStatus;
  createdBy: string;
  createdAt: string;
}

/** 受入伝票＋進捗（一覧用） */
export interface ReceiptWithProgress extends Receipt {
  lineCount: number;
  pendingQty: number; // 未入庫合計（qty - qty_putaway の合計）
  totalQty: number; // 受入合計
}

/** 受入明細（商品×受入数。未入庫 = qty - qtyPutaway） */
export interface ReceiptLine {
  id: string;
  receiptId: string;
  seq: number;
  productId: string;
  supplier: string | null; // 仕入先（受入時の商品マスタからのスナップショット）
  perBox: number | null; // 入り数（1箱あたり）
  boxCount: number | null; // 箱数
  qty: number; // 合計受入数
  qtyPutaway: number; // 棚入れ済み累計
  refNo: string | null; // 納品No
  labelPrinted: boolean;
}

/** 受入明細＋商品情報（明細表示・ラベル発行用） */
export interface ReceiptLineWithMeta extends ReceiptLine {
  drawingNo: string;
  productCode: string | null;
  stockKey: string | null;
  productName: string;
  unit: string;
  lotSize: number | null;
}

/** 未入庫（棚入れ待ち）を商品ごとに集計した1行（②入庫の候補） */
export interface PendingPutaway {
  productId: string;
  drawingNo: string;
  productCode: string | null;
  stockKey: string | null;
  productName: string;
  unit: string;
  lotSize: number | null;
  supplier: string | null;
  pendingQty: number; // 未入庫合計
  deliverTo: string | null; // 直近受入の納入場所（参考表示）
}

/** ダッシュボード集計 */
export interface DashboardCounts {
  productCount: number;
  locationCount: number;
  totalQty: number;
  belowSafetyCount: number;
  todayTxCount: number;
  openStocktakeCount: number;
  openIssueOrderCount: number;
  pendingPutawayCount: number; // 未入庫（棚入れ待ち）の商品件数
}
