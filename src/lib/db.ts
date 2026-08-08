import { randomUUID } from "crypto";
import { getSql } from "./neon";
import { ensureSchema } from "./schema";
import { formatLocCode } from "./location";
import type {
  Product,
  ProductWithStock,
  Site,
  Workplace,
  WorkplaceWithSite,
  AreaPin,
  LocArea,
  Location,
  LocationWithStock,
  StockWithMeta,
  TransactionWithMeta,
  TxType,
  Stocktake,
  StocktakeWithProgress,
  StocktakeLineWithMeta,
  IssueOrder,
  IssueOrderStatus,
  IssueOrderWithProgress,
  IssueOrderLineWithMeta,
  Partner,
  PartnerKind,
  DashboardCounts,
  Receipt,
  ReceiptWithProgress,
  ReceiptLineWithMeta,
  ReceiptStatus,
  PendingPutaway,
  ItemMaster,
  ItemMasterWithProduct,
  ItemMasterImport,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ===== row → camelCase マッパー =====

function tsStr(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
function numOrNull(v: any): number | null {
  return v == null ? null : Number(v);
}

function mapProduct(r: any): Product {
  return {
    id: r.id,
    companyId: r.company_id,
    drawingNo: r.drawing_no ?? "",
    productCode: r.product_code ?? null,
    stockKey: r.stock_key ?? null,
    name: r.name,
    spec: r.spec ?? null,
    unit: r.unit ?? "個",
    lotSize: numOrNull(r.lot_size),
    safetyStock: numOrNull(r.safety_stock),
    category: r.category ?? null,
    maker: r.maker ?? null,
    makerCode: r.maker_code ?? null,
    supplier: r.supplier ?? null,
    notes: r.notes ?? null,
    active: r.active ?? true,
    createdAt: tsStr(r.created_at),
    updatedAt: tsStr(r.updated_at),
  };
}

function mapProductWithStock(r: any): ProductWithStock {
  const p = mapProduct(r);
  const totalQty = Number(r.total_qty ?? 0);
  return {
    ...p,
    totalQty,
    locationCount: Number(r.location_count ?? 0),
    belowSafety: p.safetyStock != null && totalQty < p.safetyStock,
  };
}

function mapLocation(r: any): Location {
  return {
    id: r.id,
    companyId: r.company_id,
    code: r.code,
    siteId: r.site_id ?? null,
    workplaceId: r.workplace_id ?? null,
    area: r.area ?? "",
    rack: r.rack ?? "",
    level: r.level ?? "",
    bay: r.bay ?? "",
    name: r.name ?? null,
    active: r.active ?? true,
    createdAt: tsStr(r.created_at),
  };
}

// ===== 拠点（工場 sites / 職場 workplaces） =====

function mapSite(r: any): Site {
  return {
    id: r.id,
    companyId: r.company_id,
    name: r.name,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: tsStr(r.created_at),
  };
}

function mapWorkplace(r: any): Workplace {
  return {
    id: r.id,
    companyId: r.company_id,
    siteId: r.site_id,
    name: r.name,
    sortOrder: Number(r.sort_order ?? 0),
    mapImageUrl: r.map_image_url ?? null,
    createdAt: tsStr(r.created_at),
  };
}

/** 職場の見取り図（エリアマップ）画像を設定/差し替え/削除。旧URLを返す（Blob削除用）。 */
export async function setWorkplaceMapImage(
  companyId: string,
  workplaceId: string,
  url: string | null,
): Promise<string | null> {
  await ensureSchema();
  const sql = getSql();
  const cur = await sql`SELECT map_image_url FROM workplaces WHERE company_id = ${companyId} AND id = ${workplaceId} LIMIT 1`;
  const old = (cur[0]?.map_image_url as string | null) ?? null;
  await sql`UPDATE workplaces SET map_image_url = ${url} WHERE company_id = ${companyId} AND id = ${workplaceId}`;
  return old;
}

/** 職場の見取り図上のエリアピン一覧。 */
export async function listAreaPins(companyId: string, workplaceId: string): Promise<AreaPin[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT area, map_x, map_y FROM area_pins
    WHERE company_id = ${companyId} AND workplace_id = ${workplaceId}
    ORDER BY area`;
  return rows.map((r: any) => ({ area: r.area, x: Number(r.map_x), y: Number(r.map_y) }));
}

/** エリアピンを配置/移動（職場×エリアで upsert）。 */
export async function setAreaPin(
  companyId: string,
  workplaceId: string,
  area: string,
  x: number,
  y: number,
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO area_pins (id, company_id, workplace_id, area, map_x, map_y)
    VALUES (${randomUUID()}, ${companyId}, ${workplaceId}, ${area}, ${x}, ${y})
    ON CONFLICT (workplace_id, area) DO UPDATE SET map_x = ${x}, map_y = ${y}`;
}

/** エリアピンを削除。 */
export async function deleteAreaPin(companyId: string, workplaceId: string, area: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM area_pins WHERE company_id = ${companyId} AND workplace_id = ${workplaceId} AND area = ${area}`;
}

/** 職場のロケーションに存在する（=在庫を置く）エリア一覧＋ロケ数。 */
export async function listWorkplaceAreas(
  companyId: string,
  workplaceId: string,
): Promise<{ area: string; locationCount: number }[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT COALESCE(NULLIF(area, ''), '(未設定)') AS area, COUNT(*)::int AS n
    FROM locations
    WHERE company_id = ${companyId} AND workplace_id = ${workplaceId} AND active = true
    GROUP BY COALESCE(NULLIF(area, ''), '(未設定)')
    ORDER BY area`;
  return rows.map((r: any) => ({ area: r.area, locationCount: r.n }));
}

/** 工場一覧（並び順）。opts.siteId 指定時はその1工場だけ（工場スコープ用）。 */
export async function listSites(
  companyId: string,
  opts: { siteId?: string | null } = {},
): Promise<Site[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM sites
    WHERE company_id = ${companyId}
      AND (${opts.siteId ?? null}::uuid IS NULL OR id = ${opts.siteId ?? null})
    ORDER BY sort_order, name`;
  return rows.map(mapSite);
}

/**
 * 工場名（ポータルの部署名）から工場IDを引く。前後の空白は無視して完全一致。
 * 一致する工場が無ければ null（＝そのユーザーに見せられるデータが無い＝空表示）。
 */
export async function findSiteIdByName(companyId: string, name: string): Promise<string | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id FROM sites
    WHERE company_id = ${companyId} AND btrim(name) = btrim(${name})
    ORDER BY sort_order, name LIMIT 1`;
  return (rows[0]?.id as string) ?? null;
}

/** 置き場（ロケーション）が属する工場ID（未設定・存在しなければ null）。書き込みのスコープ検証に使う。 */
export async function getLocationSiteId(companyId: string, locationId: string): Promise<string | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT site_id FROM locations WHERE company_id = ${companyId} AND id = ${locationId} LIMIT 1`;
  return (rows[0]?.site_id as string | null) ?? null;
}

/** 職場一覧（工場名つき。工場→職場の並び順） */
export async function listWorkplaces(
  companyId: string,
  opts: { siteId?: string | null } = {},
): Promise<WorkplaceWithSite[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT w.*, s.name AS site_name
    FROM workplaces w
    JOIN sites s ON s.id = w.site_id
    WHERE w.company_id = ${companyId}
      AND (${opts.siteId ?? null}::uuid IS NULL OR w.site_id = ${opts.siteId ?? null})
    ORDER BY s.sort_order, s.name, w.sort_order, w.name`;
  return rows.map((r: any) => ({ ...mapWorkplace(r), siteName: r.site_name }));
}

/** 職場を1件取得（工場名つき） */
export async function getWorkplace(companyId: string, id: string): Promise<WorkplaceWithSite | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT w.*, s.name AS site_name
    FROM workplaces w JOIN sites s ON s.id = w.site_id
    WHERE w.company_id = ${companyId} AND w.id = ${id} LIMIT 1`;
  if (!rows[0]) return null;
  return { ...mapWorkplace(rows[0]), siteName: rows[0].site_name };
}

/** 工場を作成 */
export async function createSite(companyId: string, name: string): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const id = randomUUID();
  const rows = await sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM sites WHERE company_id = ${companyId}`;
  await sql`
    INSERT INTO sites (id, company_id, name, sort_order)
    VALUES (${id}, ${companyId}, ${name}, ${Number(rows[0]?.n ?? 1)})`;
  return id;
}

/** 工場名を更新 */
export async function updateSite(companyId: string, id: string, name: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE sites SET name = ${name}, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 工場を削除（配下の職場・置き場・在庫も CASCADE） */
export async function deleteSite(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM sites WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 職場を作成。既定の置き場（1つ）も自動採番して用意する。 */
export async function createWorkplace(companyId: string, siteId: string, name: string): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const id = randomUUID();
  const ord = await sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM workplaces WHERE site_id = ${siteId}`;
  await sql`
    INSERT INTO workplaces (id, company_id, site_id, name, sort_order)
    VALUES (${id}, ${companyId}, ${siteId}, ${name}, ${Number(ord[0]?.n ?? 1)})`;
  await ensureDefaultLocation(companyId, siteId, id);
  return id;
}

/** 職場名を更新 */
export async function updateWorkplace(companyId: string, id: string, name: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE workplaces SET name = ${name}
    WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 職場を削除（配下の置き場・在庫も CASCADE） */
export async function deleteWorkplace(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM workplaces WHERE company_id = ${companyId} AND id = ${id}`;
}

/**
 * 職場の「既定の置き場」を返す（無ければ作成）。副資材は職場単位で在庫を持つため、
 * 操作者にロケ番号を意識させず、職場に1つの置き場を自動用意してそこへ入出庫する。
 */
export async function ensureDefaultLocation(
  companyId: string,
  siteId: string,
  workplaceId: string,
): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const found = await sql`
    SELECT id FROM locations
    WHERE company_id = ${companyId} AND workplace_id = ${workplaceId} AND active = true
    ORDER BY created_at LIMIT 1`;
  if (found[0]) return found[0].id;
  const id = randomUUID();
  // コードは職場IDの先頭8桁で一意化（QR/検索キー。副資材は人がコードを打たない想定）。
  const code = `WP-${workplaceId.slice(0, 8)}`;
  await sql`
    INSERT INTO locations (id, company_id, site_id, workplace_id, code, name)
    VALUES (${id}, ${companyId}, ${siteId}, ${workplaceId}, ${code}, ${"既定"})
    ON CONFLICT (company_id, code) DO NOTHING`;
  const back = await sql`SELECT id FROM locations WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`;
  return back[0]?.id ?? id;
}

// ===== 品目マスタ =====

export interface ProductInput {
  drawingNo: string;
  productCode: string | null;
  stockKey: string | null;
  name: string;
  spec: string | null;
  unit: string;
  lotSize: number | null;
  safetyStock: number | null;
  category: string | null;
  maker: string | null;
  makerCode: string | null;
  supplier: string | null;
  notes: string | null;
  active: boolean;
}

/** 品目一覧（現在庫合計・在庫ロケ数つき）。検索語（図番/品名/規格/分類/メーカー）で絞り込み。 */
export async function listProducts(
  companyId: string,
  opts: { search?: string | null; activeOnly?: boolean; belowSafetyOnly?: boolean } = {}
): Promise<ProductWithStock[]> {
  await ensureSchema();
  const sql = getSql();
  const like = opts.search ? `%${opts.search}%` : null;
  const rows = await sql`
    SELECT p.*,
      COALESCE(s.total_qty, 0) AS total_qty,
      COALESCE(s.location_count, 0) AS location_count
    FROM products p
    LEFT JOIN (
      SELECT product_id, SUM(qty) AS total_qty, COUNT(*) FILTER (WHERE qty <> 0) AS location_count
      FROM stock WHERE company_id = ${companyId} GROUP BY product_id
    ) s ON s.product_id = p.id
    WHERE p.company_id = ${companyId}
      AND (${opts.activeOnly ? true : null}::boolean IS NULL OR p.active = true)
      AND (${like}::text IS NULL
           OR p.drawing_no ILIKE ${like} OR p.product_code ILIKE ${like} OR p.stock_key ILIKE ${like}
           OR p.maker_code ILIKE ${like}
           OR p.name ILIKE ${like} OR p.spec ILIKE ${like}
           OR p.category ILIKE ${like} OR p.maker ILIKE ${like} OR p.supplier ILIKE ${like})
    ORDER BY p.active DESC, p.name ASC`;
  const mapped = rows.map(mapProductWithStock);
  return opts.belowSafetyOnly ? mapped.filter((p) => p.belowSafety) : mapped;
}

export async function getProduct(companyId: string, id: string): Promise<Product | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM products WHERE company_id = ${companyId} AND id = ${id} LIMIT 1`;
  return rows[0] ? mapProduct(rows[0]) : null;
}

/** 図番で品目を引く（QR/スキャン/手入力の解決用）。 */
export async function getProductByDrawingNo(companyId: string, drawingNo: string): Promise<Product | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM products WHERE company_id = ${companyId} AND drawing_no = ${drawingNo} LIMIT 1`;
  return rows[0] ? mapProduct(rows[0]) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 任意コード（図番/品目CD/在庫管理キー）で品目を解決。 */
export async function getProductByAnyCode(companyId: string, code: string): Promise<Product | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM products
    WHERE company_id = ${companyId}
      AND (maker_code = ${code} OR drawing_no = ${code} OR product_code = ${code} OR stock_key = ${code})
    ORDER BY (maker_code = ${code}) DESC, (stock_key = ${code}) DESC, (product_code = ${code}) DESC
    LIMIT 1`;
  return rows[0] ? mapProduct(rows[0]) : null;
}

/** UUID なら id、そうでなければ図番/品目CD/在庫管理キーで解決（一覧リンクと QR の両対応）。 */
export async function resolveProduct(companyId: string, idOrCode: string): Promise<Product | null> {
  return UUID_RE.test(idOrCode)
    ? getProduct(companyId, idOrCode)
    : getProductByAnyCode(companyId, idOrCode);
}

/** 在庫管理キー（ZK＋8桁連番）を採番。会社内の既存 ZK 最大値＋1。 */
export async function nextStockKey(companyId: string): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(stock_key, '[^0-9]', '', 'g'), '')::bigint), 0) + 1 AS n
    FROM products
    WHERE company_id = ${companyId} AND stock_key LIKE 'ZK%'`;
  return "ZK" + String(rows[0].n).padStart(8, "0");
}

export async function createProduct(companyId: string, input: ProductInput): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO products (company_id, drawing_no, product_code, stock_key, name, spec, unit, lot_size, safety_stock, category, maker, maker_code, supplier, notes, active)
    VALUES (${companyId}, ${input.drawingNo || null}, ${input.productCode}, ${input.stockKey}, ${input.name}, ${input.spec}, ${input.unit},
            ${input.lotSize}, ${input.safetyStock}, ${input.category}, ${input.maker}, ${input.makerCode || null}, ${input.supplier}, ${input.notes}, ${input.active})
    RETURNING id`;
  return rows[0].id as string;
}

export async function updateProduct(companyId: string, id: string, input: ProductInput): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE products SET
      drawing_no = ${input.drawingNo || null}, product_code = ${input.productCode},
      name = ${input.name}, spec = ${input.spec},
      unit = ${input.unit}, lot_size = ${input.lotSize}, safety_stock = ${input.safetyStock}, category = ${input.category},
      maker = ${input.maker}, maker_code = ${input.makerCode || null}, supplier = ${input.supplier}, notes = ${input.notes}, active = ${input.active}, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}`;
}

export async function deleteProduct(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM products WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 分類の候補（フィルタ用の distinct）。 */
export async function listCategories(companyId: string): Promise<string[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT category FROM products
    WHERE company_id = ${companyId} AND category IS NOT NULL AND category <> ''
    ORDER BY category`;
  return rows.map((r: any) => r.category as string);
}

// ===== 資材W/F 品目カタログ（参照専用。在庫は持たない） =====

function mapItemMaster(r: any): ItemMaster {
  return {
    code: r.code,
    name: r.name,
    supplierCode: r.supplier_code,
    supplierName: r.supplier_name,
    altSuppliers: r.alt_suppliers,
    unitCode: r.unit_code,
    packQty: numOrNull(r.pack_qty),
    packUnitCode: r.pack_unit_code,
    lotQty: numOrNull(r.lot_qty),
    roundQty: numOrNull(r.round_qty),
    container: r.container,
    accountCode: r.account_code,
    unitPrice: numOrNull(r.unit_price),
    validFrom: r.valid_from,
    validTo: r.valid_to,
    active: Boolean(r.active),
  };
}

function mapItemMasterWithProduct(r: any): ItemMasterWithProduct {
  return { ...mapItemMaster(r), productId: r.product_id ?? null };
}

export interface ItemMasterFilter {
  search?: string | null;
  activeOnly?: boolean;
  /** 品目マスタに未登録の品目だけに絞る */
  unregisteredOnly?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * 品目カタログ一覧（品目コード／品名／仕入先で検索）。品目マスタに登録済みかも合わせて返す。
 * ページ送り用の総件数はウィンドウ関数で同時に取る（同じ条件式を2回書かないため）。
 */
export async function listItemMaster(
  companyId: string,
  filter: ItemMasterFilter = {}
): Promise<{ items: ItemMasterWithProduct[]; total: number }> {
  await ensureSchema();
  const sql = getSql();
  // 「06-26105-00」のようなハイフン付きで検索されても拾えるよう、数字だけを抜いた形でもコードを見る
  const raw = filter.search?.trim() || null;
  const digits = raw ? raw.replace(/[^0-9]/g, "") : "";
  const like = raw ? `%${raw}%` : null;
  const codeLike = digits ? `%${digits}%` : null;
  const limit = filter.limit ?? 100;
  const rows = await sql`
    SELECT i.*, p.id AS product_id, (COUNT(*) OVER ())::int AS total_count
    FROM item_master i
    LEFT JOIN products p ON p.company_id = i.company_id AND p.drawing_no = i.code
    WHERE i.company_id = ${companyId}
      AND (${filter.activeOnly ? true : null}::boolean IS NULL OR i.active = true)
      AND (${filter.unregisteredOnly ? true : null}::boolean IS NULL OR p.id IS NULL)
      AND (${like}::text IS NULL
           OR i.name ILIKE ${like} OR i.supplier_name ILIKE ${like} OR i.alt_suppliers ILIKE ${like}
           OR (${codeLike}::text IS NOT NULL AND i.code LIKE ${codeLike}))
    ORDER BY i.code
    LIMIT ${limit} OFFSET ${filter.offset ?? 0}`;
  return {
    items: rows.map(mapItemMasterWithProduct),
    total: rows[0] ? Number(rows[0].total_count) : 0,
  };
}

/** 品目コード（9桁）で1件引く。品目マスタに登録済みならその ID も返す。 */
export async function getItemMasterByCode(
  companyId: string,
  code: string
): Promise<ItemMasterWithProduct | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT i.*, p.id AS product_id
    FROM item_master i
    LEFT JOIN products p ON p.company_id = i.company_id AND p.drawing_no = i.code
    WHERE i.company_id = ${companyId} AND i.code = ${code}
    LIMIT 1`;
  return rows[0] ? mapItemMasterWithProduct(rows[0]) : null;
}

/** 品目コードの配列でカタログを引く（一括登録の対象確認用）。存在しないコードは結果に出ない。 */
export async function getItemMastersByCodes(companyId: string, codes: string[]): Promise<ItemMaster[]> {
  await ensureSchema();
  if (codes.length === 0) return [];
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM item_master
    WHERE company_id = ${companyId} AND code = ANY(${codes})
    ORDER BY code`;
  return rows.map(mapItemMaster);
}

/** 一括登録の1件（単位はカタログの単位コードから解決済み。未解決なら null＝既定の「個」） */
export interface ItemToRegister {
  code: string;
  unit: string | null;
}

/**
 * 資材W/F 品目カタログの指定コードを、品目マスタ（products）へ一括登録する。
 *
 * - 既に登録済み（products.drawing_no が同じコード）の品目は黙って飛ばす（何度押しても増えない）。
 * - 在庫管理キー（ZK＋8桁連番）は既存の最大値から通しで採番する。1文で完結させるので、
 *   件数分の往復も、採番の取り合いも起きない。
 * - ロットサイズは products 側が INTEGER なので、整数のロット数だけ引き継ぐ。
 *
 * @returns 実際に登録した件数
 */
export async function bulkCreateProductsFromItems(
  companyId: string,
  entries: ItemToRegister[]
): Promise<number> {
  await ensureSchema();
  if (entries.length === 0) return 0;
  const sql = getSql();
  const rows = await sql`
    WITH input AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(entries)}::jsonb) AS x(code TEXT, unit TEXT)
    ), base AS (
      SELECT COALESCE(MAX(NULLIF(regexp_replace(stock_key, '[^0-9]', '', 'g'), '')::bigint), 0) AS n
      FROM products WHERE company_id = ${companyId} AND stock_key LIKE 'ZK%'
    ), src AS (
      SELECT i.code, i.name, i.supplier_name, i.lot_qty,
             COALESCE(NULLIF(input.unit, ''), '個') AS unit,
             row_number() OVER (ORDER BY i.code) AS rn
      FROM input
      JOIN item_master i ON i.company_id = ${companyId} AND i.code = input.code
      WHERE NOT EXISTS (
        SELECT 1 FROM products p WHERE p.company_id = ${companyId} AND p.drawing_no = i.code)
    )
    INSERT INTO products (company_id, drawing_no, name, unit, lot_size, supplier, stock_key, active)
    SELECT ${companyId}, src.code, src.name, src.unit,
           CASE WHEN src.lot_qty = trunc(src.lot_qty) AND src.lot_qty BETWEEN 1 AND 2147483647
                THEN src.lot_qty::int END,
           src.supplier_name,
           'ZK' || lpad((base.n + src.rn)::text, 8, '0'),
           true
    FROM src CROSS JOIN base
    ON CONFLICT DO NOTHING
    RETURNING id`;
  return rows.length;
}

/** 品目カタログの取込状況（未取込なら null）。 */
export async function getItemMasterImport(companyId: string): Promise<ItemMasterImport | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT version, item_count, imported_at FROM item_master_imports WHERE company_id = ${companyId} LIMIT 1`;
  const r = rows[0];
  return r
    ? { version: r.version, itemCount: Number(r.item_count), importedAt: tsStr(r.imported_at) }
    : null;
}

// ===== ロケーション =====

export async function listAreas(companyId: string): Promise<LocArea[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM loc_areas WHERE company_id = ${companyId} ORDER BY sort_order ASC, code ASC`;
  return rows.map((r: any) => ({ id: r.id, code: r.code, name: r.name ?? null, sortOrder: Number(r.sort_order ?? 0) }));
}

export async function createArea(companyId: string, code: string, name: string | null): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO loc_areas (company_id, code, name) VALUES (${companyId}, ${code.toUpperCase()}, ${name})
    ON CONFLICT (company_id, code) DO UPDATE SET name = ${name}`;
}

export async function deleteArea(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM loc_areas WHERE company_id = ${companyId} AND id = ${id}`;
}

/** ロケーション一覧（在庫サマリつき）。エリア絞り込み・検索対応。 */
export async function listLocations(
  companyId: string,
  opts: { area?: string | null; search?: string | null; workplaceId?: string | null } = {}
): Promise<LocationWithStock[]> {
  await ensureSchema();
  const sql = getSql();
  const like = opts.search ? `%${opts.search}%` : null;
  const rows = await sql`
    SELECT l.*,
      COALESCE(s.product_count, 0) AS product_count,
      COALESCE(s.total_qty, 0) AS total_qty
    FROM locations l
    LEFT JOIN (
      SELECT location_id, COUNT(*) FILTER (WHERE qty <> 0) AS product_count, SUM(qty) AS total_qty
      FROM stock WHERE company_id = ${companyId} GROUP BY location_id
    ) s ON s.location_id = l.id
    WHERE l.company_id = ${companyId}
      AND (${opts.workplaceId ?? null}::uuid IS NULL OR l.workplace_id = ${opts.workplaceId ?? null})
      AND (${opts.area ?? null}::text IS NULL OR l.area = ${opts.area ?? null})
      AND (${like}::text IS NULL OR l.code ILIKE ${like} OR l.name ILIKE ${like})
    ORDER BY l.code ASC`;
  return rows.map((r: any) => ({
    ...mapLocation(r),
    productCount: Number(r.product_count ?? 0),
    totalQty: Number(r.total_qty ?? 0),
  }));
}

export async function getLocation(companyId: string, id: string): Promise<Location | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM locations WHERE company_id = ${companyId} AND id = ${id} LIMIT 1`;
  return rows[0] ? mapLocation(rows[0]) : null;
}

/** ロケ番号で1件取得。siteId 指定時はその工場の置き場に限る（工場スコープ）。 */
export async function getLocationByCode(
  companyId: string,
  code: string,
  siteId: string | null = null,
): Promise<Location | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM locations
    WHERE company_id = ${companyId} AND code = ${code.toUpperCase()}
      AND (${siteId}::uuid IS NULL OR site_id = ${siteId})
    LIMIT 1`;
  return rows[0] ? mapLocation(rows[0]) : null;
}

/** 間口の次番号をアトミックに採番（エリア×棚×段ごとのカウンタを +1）。 */
export async function nextBay(companyId: string, area: string, rack: string, level: string): Promise<number> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO loc_counters (company_id, area, rack, level, next_bay)
    VALUES (${companyId}, ${area}, ${rack}, ${level}, 2)
    ON CONFLICT (company_id, area, rack, level)
    DO UPDATE SET next_bay = loc_counters.next_bay + 1
    RETURNING next_bay - 1 AS bay`;
  return Number(rows[0].bay);
}

export interface LocationInput {
  area: string;
  rack: string;
  level: string;
  bay: string;
  name: string | null;
  siteId?: string | null; // 所属工場
  workplaceId?: string | null; // 所属職場（在庫はこの職場に属する）
}

/** ロケーションを1件作成し ID を返す（code は4値から生成）。既存なら 23505。 */
export async function createLocation(companyId: string, input: LocationInput): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const code = formatLocCode(input);
  const p = { area: input.area.toUpperCase(), rack: String(Number(input.rack)).padStart(2, "0"), level: String(Number(input.level)), bay: String(Number(input.bay)) };
  const rows = await sql`
    INSERT INTO locations (company_id, code, area, rack, level, bay, name, site_id, workplace_id)
    VALUES (${companyId}, ${code}, ${p.area}, ${p.rack}, ${p.level}, ${p.bay}, ${input.name}, ${input.siteId ?? null}, ${input.workplaceId ?? null})
    RETURNING id`;
  return rows[0].id as string;
}

/** ロケ一括生成（棚範囲×段範囲×間口範囲）。既存はスキップ。作成数を返す。 */
export async function bulkCreateLocations(
  companyId: string,
  spec: { area: string; rackFrom: number; rackTo: number; levelFrom: number; levelTo: number; bayFrom: number; bayTo: number; siteId?: string | null; workplaceId?: string | null }
): Promise<number> {
  await ensureSchema();
  const sql = getSql();
  const area = spec.area.toUpperCase();
  const siteId = spec.siteId ?? null;
  const workplaceId = spec.workplaceId ?? null;
  const stmts: any[] = [];
  for (let rk = spec.rackFrom; rk <= spec.rackTo; rk++) {
    for (let lv = spec.levelFrom; lv <= spec.levelTo; lv++) {
      for (let by = spec.bayFrom; by <= spec.bayTo; by++) {
        const rack = String(rk).padStart(2, "0");
        const code = formatLocCode({ area, rack, level: lv, bay: by });
        stmts.push(sql`
          INSERT INTO locations (company_id, code, area, rack, level, bay, site_id, workplace_id)
          VALUES (${companyId}, ${code}, ${area}, ${rack}, ${String(lv)}, ${String(by)}, ${siteId}, ${workplaceId})
          ON CONFLICT (company_id, code) DO NOTHING`);
      }
    }
  }
  if (stmts.length === 0) return 0;
  await sql.transaction(stmts);
  return stmts.length;
}

export async function deleteLocation(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM locations WHERE company_id = ${companyId} AND id = ${id}`;
}

/** ロケの area 候補（実在ロケから distinct。フィルタ用）。 */
export async function listUsedAreas(companyId: string): Promise<string[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT DISTINCT area FROM locations WHERE company_id = ${companyId} ORDER BY area`;
  return rows.map((r: any) => r.area as string);
}

// ===== 在庫台帳 =====

function mapStockWithMeta(r: any): StockWithMeta {
  return {
    id: r.id,
    productId: r.product_id,
    locationId: r.location_id,
    qty: Number(r.qty ?? 0),
    updatedAt: tsStr(r.updated_at),
    drawingNo: r.drawing_no ?? "",
    makerCode: r.maker_code ?? null,
    spec: r.spec ?? null,
    productName: r.product_name,
    unit: r.unit ?? "個",
    safetyStock: numOrNull(r.safety_stock),
    locationCode: r.location_code,
  };
}

export interface StockFilter {
  productId?: string | null;
  locationId?: string | null;
  workplaceId?: string | null; // 副資材: この職場（の置き場）の在庫だけに絞る
  siteId?: string | null; // 工場スコープ: この工場の置き場の在庫だけに絞る
  area?: string | null;
  search?: string | null;
  belowSafetyOnly?: boolean;
  nonZeroOnly?: boolean;
  limit?: number;
}

/** 在庫台帳（品目×ロケの現在庫、品目・ロケ情報つき）。 */
export async function listStock(companyId: string, filter: StockFilter = {}): Promise<StockWithMeta[]> {
  await ensureSchema();
  const sql = getSql();
  const like = filter.search ? `%${filter.search}%` : null;
  const limit = Math.min(filter.limit ?? 500, 2000);
  const rows = await sql`
    SELECT st.*, p.drawing_no, p.maker_code, p.spec, p.name AS product_name, p.unit, p.safety_stock,
           l.code AS location_code, l.area
    FROM stock st
    JOIN products p ON p.id = st.product_id
    JOIN locations l ON l.id = st.location_id
    WHERE st.company_id = ${companyId}
      AND (${filter.productId ?? null}::uuid IS NULL OR st.product_id = ${filter.productId ?? null})
      AND (${filter.locationId ?? null}::uuid IS NULL OR st.location_id = ${filter.locationId ?? null})
      AND (${filter.workplaceId ?? null}::uuid IS NULL OR l.workplace_id = ${filter.workplaceId ?? null})
      AND (${filter.siteId ?? null}::uuid IS NULL OR l.site_id = ${filter.siteId ?? null})
      AND (${filter.area ?? null}::text IS NULL OR l.area = ${filter.area ?? null})
      AND (${filter.nonZeroOnly ? true : null}::boolean IS NULL OR st.qty <> 0)
      AND (${like}::text IS NULL OR p.name ILIKE ${like} OR p.maker_code ILIKE ${like} OR p.drawing_no ILIKE ${like} OR l.code ILIKE ${like})
    ORDER BY p.name ASC, l.code ASC
    LIMIT ${limit}`;
  const mapped = rows.map(mapStockWithMeta);
  if (!filter.belowSafetyOnly) return mapped;
  // 品目合計と安全在庫の比較は listProducts 側で行うため、ここでは行単位のフィルタは不要
  return mapped;
}

/** 特定品目のロケ別在庫（品目詳細用）。siteId 指定時はその工場の置き場だけ。 */
export async function listStockForProduct(
  companyId: string,
  productId: string,
  siteId: string | null = null,
): Promise<StockWithMeta[]> {
  return listStock(companyId, { productId, siteId, nonZeroOnly: false });
}

/** 特定ロケの在庫一覧（ロケ照会用）。 */
export async function listStockForLocation(companyId: string, locationId: string): Promise<StockWithMeta[]> {
  return listStock(companyId, { locationId, nonZeroOnly: true });
}

/** 品目×ロケの現在庫セル（無ければ null）。 */
export async function getStockCell(
  companyId: string,
  productId: string,
  locationId: string
): Promise<{ id: string; qty: number } | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, qty FROM stock
    WHERE company_id = ${companyId} AND product_id = ${productId} AND location_id = ${locationId} LIMIT 1`;
  return rows[0] ? { id: rows[0].id as string, qty: Number(rows[0].qty) } : null;
}

// ===== 受払（入出庫）: stock を正として原子更新 + transactions 追記 =====

/** 区分から符号付き delta を決める。adjust/stocktake は入力値の符号をそのまま使う。 */
export function signedDelta(txType: TxType, qty: number): number {
  if (txType === "issue" || txType === "move_out") return -Math.abs(qty);
  if (txType === "receipt" || txType === "putaway" || txType === "move_in") return Math.abs(qty);
  return qty; // adjust / stocktake は符号付き
}

export interface MovementInput {
  productId: string;
  locationId: string;
  txType: TxType;
  qty: number; // receipt/issue は正の数量、adjust は符号付き補正値
  refNo: string | null;
  operator: string;
  note: string | null;
  deliverTo?: string | null; // 納入場所（入荷現品票用）
  issueOrderId?: string | null; // 出庫指示との紐付け
  partnerName?: string | null; // 仕入先/移動先
}

/**
 * 1件の入出庫を原子的に反映する。
 * stock を UPSERT（現在庫の正）＋ transactions を追記（証跡）を sql.transaction で1バッチ実行。
 * 在庫がマイナスになる場合、allowNegative=false なら例外。
 */
export async function applyMovement(
  companyId: string,
  input: MovementInput,
  allowNegative: boolean
): Promise<{ qtyAfter: number; txId: string }> {
  await ensureSchema();
  const sql = getSql();
  const delta = signedDelta(input.txType, input.qty);
  if (delta === 0) throw new Error("数量が 0 です");
  const cur = await getStockCell(companyId, input.productId, input.locationId);
  const before = cur?.qty ?? 0;
  const after = before + delta;
  if (after < 0 && !allowNegative) {
    throw new Error(`在庫が不足しています（現在 ${before}、変動 ${delta}）`);
  }
  const stockId = cur?.id ?? randomUUID();
  const txId = randomUUID();
  await sql.transaction([
    sql`
      INSERT INTO stock (id, company_id, product_id, location_id, qty, updated_at)
      VALUES (${stockId}, ${companyId}, ${input.productId}, ${input.locationId}, ${after}, NOW())
      ON CONFLICT (company_id, product_id, location_id)
      DO UPDATE SET qty = ${after}, updated_at = NOW()`,
    sql`
      INSERT INTO transactions
        (id, company_id, product_id, location_id, tx_type, qty_delta, qty_after, ref_no, operator, deliver_to, issue_order_id, partner_name, note)
      VALUES (${txId}, ${companyId}, ${input.productId}, ${input.locationId}, ${input.txType},
              ${delta}, ${after}, ${input.refNo}, ${input.operator}, ${input.deliverTo ?? null}, ${input.issueOrderId ?? null}, ${input.partnerName ?? null}, ${input.note})`,
  ]);
  return { qtyAfter: after, txId };
}

export interface MoveInput {
  productId: string;
  fromLocationId: string;
  toLocationId: string;
  qty: number;
  refNo: string | null;
  operator: string;
  note: string | null;
  partnerName?: string | null; // 移動先（社内）
}

/** ロケ間移動（move_out/move_in を4文で原子実行）。move_in の txId を返す。 */
export async function moveStock(companyId: string, input: MoveInput, allowNegative: boolean): Promise<{ txId: string }> {
  await ensureSchema();
  if (input.fromLocationId === input.toLocationId) throw new Error("移動元と移動先が同じです");
  const q = Math.abs(input.qty);
  if (q === 0) throw new Error("数量が 0 です");
  const sql = getSql();
  const curFrom = await getStockCell(companyId, input.productId, input.fromLocationId);
  const curTo = await getStockCell(companyId, input.productId, input.toLocationId);
  const beforeFrom = curFrom?.qty ?? 0;
  const afterFrom = beforeFrom - q;
  if (afterFrom < 0 && !allowNegative) {
    throw new Error(`移動元の在庫が不足しています（現在 ${beforeFrom}）`);
  }
  const afterTo = (curTo?.qty ?? 0) + q;
  const fromStockId = curFrom?.id ?? randomUUID();
  const toStockId = curTo?.id ?? randomUUID();
  const txOutId = randomUUID();
  const txInId = randomUUID();
  await sql.transaction([
    sql`
      INSERT INTO stock (id, company_id, product_id, location_id, qty, updated_at)
      VALUES (${fromStockId}, ${companyId}, ${input.productId}, ${input.fromLocationId}, ${afterFrom}, NOW())
      ON CONFLICT (company_id, product_id, location_id) DO UPDATE SET qty = ${afterFrom}, updated_at = NOW()`,
    sql`
      INSERT INTO stock (id, company_id, product_id, location_id, qty, updated_at)
      VALUES (${toStockId}, ${companyId}, ${input.productId}, ${input.toLocationId}, ${afterTo}, NOW())
      ON CONFLICT (company_id, product_id, location_id) DO UPDATE SET qty = ${afterTo}, updated_at = NOW()`,
    sql`
      INSERT INTO transactions
        (id, company_id, product_id, location_id, tx_type, qty_delta, qty_after, ref_no, operator, partner_name, note)
      VALUES (${txOutId}, ${companyId}, ${input.productId}, ${input.fromLocationId}, 'move_out',
              ${-q}, ${afterFrom}, ${input.refNo}, ${input.operator}, ${input.partnerName ?? null}, ${input.note})`,
    sql`
      INSERT INTO transactions
        (id, company_id, product_id, location_id, tx_type, qty_delta, qty_after, ref_no, operator, partner_name, note)
      VALUES (${txInId}, ${companyId}, ${input.productId}, ${input.toLocationId}, 'move_in',
              ${q}, ${afterTo}, ${input.refNo}, ${input.operator}, ${input.partnerName ?? null}, ${input.note})`,
  ]);
  return { txId: txInId };
}

// ===== 受払照会（transactions） =====

function mapTxWithMeta(r: any): TransactionWithMeta {
  return {
    id: r.id,
    productId: r.product_id,
    locationId: r.location_id,
    txType: (r.tx_type ?? "adjust") as TxType,
    qtyDelta: Number(r.qty_delta ?? 0),
    qtyAfter: Number(r.qty_after ?? 0),
    refNo: r.ref_no ?? null,
    operator: r.operator ?? "",
    stocktakeId: r.stocktake_id ?? null,
    deliverTo: r.deliver_to ?? null,
    issueOrderId: r.issue_order_id ?? null,
    partnerName: r.partner_name ?? null,
    note: r.note ?? null,
    createdAt: tsStr(r.created_at),
    drawingNo: r.drawing_no ?? "",
    makerCode: r.maker_code ?? null,
    productName: r.product_name,
    unit: r.unit ?? "個",
    locationCode: r.location_code,
  };
}

export interface TxFilter {
  productId?: string | null;
  locationId?: string | null;
  workplaceId?: string | null; // 副資材: この職場（の置き場）の受払だけに絞る
  siteId?: string | null; // 工場スコープ: この工場の置き場の受払だけに絞る
  txType?: TxType | null;
  dateFrom?: string | null; // YYYY-MM-DD（JST）
  dateTo?: string | null;
  limit?: number;
}

/** 受払照会（時系列・新しい順、品目/ロケ/区分/期間フィルタ）。 */
export async function listTransactions(companyId: string, filter: TxFilter = {}): Promise<TransactionWithMeta[]> {
  await ensureSchema();
  const sql = getSql();
  const limit = Math.min(filter.limit ?? 200, 2000);
  const fromTs = filter.dateFrom ? `${filter.dateFrom}T00:00:00+09:00` : null;
  const toTs = filter.dateTo ? `${filter.dateTo}T23:59:59.999+09:00` : null;
  const rows = await sql`
    SELECT t.*, p.drawing_no, p.maker_code, p.name AS product_name, p.unit, l.code AS location_code
    FROM transactions t
    JOIN products p ON p.id = t.product_id
    JOIN locations l ON l.id = t.location_id
    WHERE t.company_id = ${companyId}
      AND (${filter.productId ?? null}::uuid IS NULL OR t.product_id = ${filter.productId ?? null})
      AND (${filter.locationId ?? null}::uuid IS NULL OR t.location_id = ${filter.locationId ?? null})
      AND (${filter.workplaceId ?? null}::uuid IS NULL OR l.workplace_id = ${filter.workplaceId ?? null})
      AND (${filter.siteId ?? null}::uuid IS NULL OR l.site_id = ${filter.siteId ?? null})
      AND (${filter.txType ?? null}::text IS NULL OR t.tx_type = ${filter.txType ?? null})
      AND (${fromTs}::timestamptz IS NULL OR t.created_at >= ${fromTs})
      AND (${toTs}::timestamptz IS NULL OR t.created_at <= ${toTs})
    ORDER BY t.created_at DESC
    LIMIT ${limit}`;
  return rows.map(mapTxWithMeta);
}

/** 受払1件を品目・ロケ情報つきで取得（入荷現品票の再発行用）。siteId 指定時はその工場の受払だけ。 */
export async function getTransaction(
  companyId: string,
  id: string,
  siteId: string | null = null,
): Promise<TransactionWithMeta | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT t.*, p.drawing_no, p.maker_code, p.name AS product_name, p.unit, l.code AS location_code
    FROM transactions t
    JOIN products p ON p.id = t.product_id
    JOIN locations l ON l.id = t.location_id
    WHERE t.company_id = ${companyId} AND t.id = ${id}
      AND (${siteId}::uuid IS NULL OR l.site_id = ${siteId})
    LIMIT 1`;
  return rows[0] ? mapTxWithMeta(rows[0]) : null;
}

// ===== 棚卸 =====

function mapStocktake(r: any): Stocktake {
  return {
    id: r.id,
    title: r.title,
    scopeArea: r.scope_area ?? null,
    status: r.status ?? "counting",
    createdBy: r.created_by ?? "",
    appliedAt: r.applied_at ? tsStr(r.applied_at) : null,
    createdAt: tsStr(r.created_at),
  };
}

/** 棚卸一覧。opts.siteId 指定時はその工場で実施した棚卸だけ（工場スコープ）。 */
export async function listStocktakes(
  companyId: string,
  opts: { siteId?: string | null } = {},
): Promise<StocktakeWithProgress[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT s.*,
      (SELECT COUNT(*) FROM stocktake_lines sl WHERE sl.stocktake_id = s.id) AS line_count,
      (SELECT COUNT(*) FROM stocktake_lines sl WHERE sl.stocktake_id = s.id AND sl.counted_qty IS NOT NULL) AS counted_count,
      (SELECT COUNT(*) FROM stocktake_lines sl WHERE sl.stocktake_id = s.id AND sl.diff IS NOT NULL AND sl.diff <> 0) AS diff_count
    FROM stocktakes s
    WHERE s.company_id = ${companyId}
      AND (${opts.siteId ?? null}::uuid IS NULL OR s.site_id = ${opts.siteId ?? null})
    ORDER BY s.created_at DESC`;
  return rows.map((r: any) => ({
    ...mapStocktake(r),
    lineCount: Number(r.line_count ?? 0),
    countedCount: Number(r.counted_count ?? 0),
    diffCount: Number(r.diff_count ?? 0),
  }));
}

/** 棚卸1件。siteId 指定時は他工場の棚卸を開けない（null が返る＝404 相当）。 */
export async function getStocktake(
  companyId: string,
  id: string,
  siteId: string | null = null,
): Promise<Stocktake | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM stocktakes
    WHERE company_id = ${companyId} AND id = ${id}
      AND (${siteId}::uuid IS NULL OR site_id = ${siteId})
    LIMIT 1`;
  return rows[0] ? mapStocktake(rows[0]) : null;
}

export async function listStocktakeLines(companyId: string, stocktakeId: string): Promise<StocktakeLineWithMeta[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT sl.*, p.drawing_no, p.name AS product_name, p.unit, l.code AS location_code
    FROM stocktake_lines sl
    JOIN products p ON p.id = sl.product_id
    JOIN locations l ON l.id = sl.location_id
    WHERE sl.company_id = ${companyId} AND sl.stocktake_id = ${stocktakeId}
    ORDER BY l.code ASC, p.drawing_no ASC`;
  return rows.map((r: any) => ({
    id: r.id,
    stocktakeId: r.stocktake_id,
    productId: r.product_id,
    locationId: r.location_id,
    bookQty: Number(r.book_qty ?? 0),
    countedQty: numOrNull(r.counted_qty),
    diff: numOrNull(r.diff),
    countedBy: r.counted_by ?? null,
    countedAt: r.counted_at ? tsStr(r.counted_at) : null,
    drawingNo: r.drawing_no ?? "",
    productName: r.product_name,
    unit: r.unit ?? "個",
    locationCode: r.location_code,
  }));
}

/**
 * 棚卸指示を作成し、対象 stock を明細にスナップショット（book_qty）する。
 * scopeArea 指定時はそのエリアの在庫のみ対象。返り値は作成した棚卸ID。
 */
export async function createStocktake(
  companyId: string,
  input: { title: string; workplaceId: string; siteId: string | null; scopeLabel: string | null; createdBy: string }
): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const stId = randomUUID();
  // scope_area 列に対象職場の表示名を保存（一覧・詳細の表示用）。site_id は工場スコープの絞り込み用。
  await sql`
    INSERT INTO stocktakes (id, company_id, title, scope_area, status, created_by, site_id)
    VALUES (${stId}, ${companyId}, ${input.title}, ${input.scopeLabel}, 'counting', ${input.createdBy}, ${input.siteId})`;
  // 現在の職場（の置き場）の在庫を帳簿数として明細へコピー
  await sql`
    INSERT INTO stocktake_lines (company_id, stocktake_id, product_id, location_id, book_qty)
    SELECT st.company_id, ${stId}, st.product_id, st.location_id, st.qty
    FROM stock st
    JOIN locations l ON l.id = st.location_id
    WHERE st.company_id = ${companyId} AND st.qty <> 0
      AND l.workplace_id = ${input.workplaceId}`;
  return stId;
}

/** 実棚数を入力（diff を自動計算）。 */
export async function setStocktakeCount(
  companyId: string,
  lineId: string,
  countedQty: number,
  countedBy: string
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE stocktake_lines
    SET counted_qty = ${countedQty}, diff = ${countedQty} - book_qty, counted_by = ${countedBy}, counted_at = NOW()
    WHERE company_id = ${companyId} AND id = ${lineId}`;
}

export async function updateStocktakeStatus(
  companyId: string,
  id: string,
  status: "counting" | "review" | "cancelled"
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE stocktakes SET status = ${status} WHERE company_id = ${companyId} AND id = ${id}`;
}

/**
 * 棚卸を在庫へ反映する。差異のある行ごとに stock を counted に更新し、
 * transactions（tx_type='stocktake', delta=diff）を追記。ステータスを applied に。
 * 既に applied なら false（二重反映防止）。
 */
export async function applyStocktake(companyId: string, stocktakeId: string, operator: string): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  // ステータスを applied へ原子的に遷移（counting/review のみ対象）。取れなければ既に反映済み。
  const claim = await sql`
    UPDATE stocktakes SET status = 'applied', applied_at = NOW()
    WHERE company_id = ${companyId} AND id = ${stocktakeId} AND status IN ('counting', 'review')
    RETURNING id`;
  if (claim.length === 0) return false;

  const lines = await sql`
    SELECT id, product_id, location_id, book_qty, counted_qty, diff
    FROM stocktake_lines
    WHERE company_id = ${companyId} AND stocktake_id = ${stocktakeId}
      AND counted_qty IS NOT NULL AND diff IS NOT NULL AND diff <> 0`;

  const stmts: any[] = [];
  for (const l of lines as any[]) {
    const counted = Number(l.counted_qty);
    const diff = Number(l.diff);
    stmts.push(sql`
      INSERT INTO stock (id, company_id, product_id, location_id, qty, updated_at)
      VALUES (${randomUUID()}, ${companyId}, ${l.product_id}, ${l.location_id}, ${counted}, NOW())
      ON CONFLICT (company_id, product_id, location_id) DO UPDATE SET qty = ${counted}, updated_at = NOW()`);
    stmts.push(sql`
      INSERT INTO transactions
        (id, company_id, product_id, location_id, tx_type, qty_delta, qty_after, operator, stocktake_id, note)
      VALUES (${randomUUID()}, ${companyId}, ${l.product_id}, ${l.location_id}, 'stocktake',
              ${diff}, ${counted}, ${operator}, ${stocktakeId}, '棚卸差異の反映')`);
  }
  if (stmts.length > 0) await sql.transaction(stmts);
  return true;
}

// ===== ダッシュボード =====

export async function dashboardCounts(companyId: string): Promise<DashboardCounts> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT
      (SELECT COUNT(*) FROM products WHERE company_id = ${companyId} AND active = true) AS product_count,
      (SELECT COUNT(*) FROM locations WHERE company_id = ${companyId} AND active = true) AS location_count,
      (SELECT COALESCE(SUM(qty), 0) FROM stock WHERE company_id = ${companyId}) AS total_qty,
      (SELECT COUNT(*) FROM transactions
        WHERE company_id = ${companyId}
          AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo') AS today_tx,
      (SELECT COUNT(*) FROM stocktakes WHERE company_id = ${companyId} AND status IN ('counting', 'review')) AS open_stocktakes,
      (SELECT COUNT(*) FROM issue_orders WHERE company_id = ${companyId} AND status IN ('open', 'picking')) AS open_orders,
      (SELECT COUNT(DISTINCT product_id) FROM receipt_lines WHERE company_id = ${companyId} AND qty > qty_putaway) AS pending_putaway`;
  const r: any = rows[0];
  const below = await listBelowSafety(companyId);
  return {
    productCount: Number(r.product_count ?? 0),
    locationCount: Number(r.location_count ?? 0),
    totalQty: Number(r.total_qty ?? 0),
    belowSafetyCount: below.length,
    todayTxCount: Number(r.today_tx ?? 0),
    openStocktakeCount: Number(r.open_stocktakes ?? 0),
    openIssueOrderCount: Number(r.open_orders ?? 0),
    pendingPutawayCount: Number(r.pending_putaway ?? 0),
  };
}

/** 安全在庫割れの品目（合計在庫 < safety_stock）。 */
export async function listBelowSafety(companyId: string): Promise<ProductWithStock[]> {
  const products = await listProducts(companyId, { activeOnly: true });
  return products.filter((p) => p.belowSafety);
}

/** ダッシュボード用：直近の受払。 */
export async function listRecentTransactions(companyId: string, limit = 8): Promise<TransactionWithMeta[]> {
  return listTransactions(companyId, { limit });
}

/** アラート対象の会社（本番の実会社のみ。デモは除外）。 */
export async function listActiveCompanies(): Promise<{ id: string; name: string }[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT id, name FROM companies WHERE is_demo = false ORDER BY created_at ASC`;
  return rows.map((r: any) => ({ id: r.id as string, name: r.name as string }));
}

/** 古いデモ会社を清掃（1日以上前のデモを削除）。cron から呼ぶ。 */
export async function cleanupOldDemos(): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM companies WHERE is_demo = true AND created_at < NOW() - INTERVAL '1 day'`;
}

// ===== 出庫指示（出荷オーダー） =====

function mapIssueOrder(r: any): IssueOrder {
  return {
    id: r.id,
    orderNo: r.order_no,
    customer: r.customer ?? null,
    deliverTo: r.deliver_to ?? null,
    shipGroup: r.ship_group ?? null,
    shipDate: r.ship_date ? tsStr(r.ship_date).slice(0, 10) : null,
    pickDate: r.pick_date ? tsStr(r.pick_date).slice(0, 10) : null,
    status: (r.status ?? "open") as IssueOrderStatus,
    createdBy: r.created_by ?? "",
    createdAt: tsStr(r.created_at),
  };
}

/** 出庫指示No を採番（SY + 7桁ゼロ埋め）。 */
export async function nextOrderNo(companyId: string): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO issue_order_counters (company_id, next_no) VALUES (${companyId}, 2)
    ON CONFLICT (company_id) DO UPDATE SET next_no = issue_order_counters.next_no + 1
    RETURNING next_no - 1 AS n`;
  return "SY" + String(Number(rows[0].n)).padStart(7, "0");
}

export interface IssueOrderInput {
  orderNo: string;
  customer: string | null;
  deliverTo: string | null;
  shipGroup: string | null;
  shipDate: string | null;
  pickDate: string | null;
  createdBy: string;
  siteId?: string | null; // 出庫元の工場（工場スコープの絞り込み用）
}

export async function createIssueOrder(companyId: string, input: IssueOrderInput): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO issue_orders (company_id, order_no, customer, deliver_to, ship_group, ship_date, pick_date, created_by, site_id)
    VALUES (${companyId}, ${input.orderNo}, ${input.customer}, ${input.deliverTo}, ${input.shipGroup},
            ${input.shipDate}, ${input.pickDate}, ${input.createdBy}, ${input.siteId ?? null})
    RETURNING id`;
  return rows[0].id as string;
}

/** その品目の在庫が最も多いロケを引当（無在庫なら null）。職場指定時はその職場のロケに限定。 */
export async function allocateLocationForProduct(
  companyId: string,
  productId: string,
  workplaceId?: string | null
): Promise<{ locationId: string; qty: number } | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT st.location_id, st.qty FROM stock st
    JOIN locations l ON l.id = st.location_id
    WHERE st.company_id = ${companyId} AND st.product_id = ${productId} AND st.qty > 0
      AND (${workplaceId ?? null}::uuid IS NULL OR l.workplace_id = ${workplaceId ?? null})
    ORDER BY st.qty DESC LIMIT 1`;
  return rows[0] ? { locationId: rows[0].location_id as string, qty: Number(rows[0].qty) } : null;
}

/** 明細を追加（引当ロケ未指定なら在庫最大ロケを自動引当）。 */
export async function addIssueOrderLine(
  companyId: string,
  orderId: string,
  input: { productId: string; locationId: string | null; lotNo: string | null; qtyPlanned: number; workplaceId?: string | null }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const seqRows = await sql`
    SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM issue_order_lines WHERE order_id = ${orderId}`;
  const seq = Number(seqRows[0].n);
  let locationId = input.locationId;
  if (!locationId) {
    const alloc = await allocateLocationForProduct(companyId, input.productId, input.workplaceId ?? null);
    locationId = alloc?.locationId ?? null;
  }
  await sql`
    INSERT INTO issue_order_lines (company_id, order_id, seq, product_id, location_id, lot_no, qty_planned, qty_instructed)
    VALUES (${companyId}, ${orderId}, ${seq}, ${input.productId}, ${locationId}, ${input.lotNo},
            ${input.qtyPlanned}, ${input.qtyPlanned})`;
}

export async function deleteIssueOrderLine(companyId: string, lineId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM issue_order_lines WHERE company_id = ${companyId} AND id = ${lineId}`;
}

/** 出庫指示一覧。opts.siteId 指定時はその工場の出庫だけ（工場スコープ）。 */
export async function listIssueOrders(
  companyId: string,
  opts: { siteId?: string | null } = {},
): Promise<IssueOrderWithProgress[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT o.*,
      (SELECT COUNT(*) FROM issue_order_lines l WHERE l.order_id = o.id) AS line_count,
      (SELECT COUNT(*) FROM issue_order_lines l WHERE l.order_id = o.id AND l.qty_issued >= l.qty_instructed AND l.qty_instructed > 0) AS issued_count
    FROM issue_orders o
    WHERE o.company_id = ${companyId}
      AND (${opts.siteId ?? null}::uuid IS NULL OR o.site_id = ${opts.siteId ?? null})
    ORDER BY o.created_at DESC`;
  return rows.map((r: any) => ({
    ...mapIssueOrder(r),
    lineCount: Number(r.line_count ?? 0),
    issuedCount: Number(r.issued_count ?? 0),
  }));
}

/** 出庫指示1件。siteId 指定時は他工場の出庫を開けない。 */
export async function getIssueOrder(
  companyId: string,
  id: string,
  siteId: string | null = null,
): Promise<IssueOrder | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM issue_orders
    WHERE company_id = ${companyId} AND id = ${id}
      AND (${siteId}::uuid IS NULL OR site_id = ${siteId})
    LIMIT 1`;
  return rows[0] ? mapIssueOrder(rows[0]) : null;
}

export async function listIssueOrderLines(companyId: string, orderId: string): Promise<IssueOrderLineWithMeta[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT l.*, p.drawing_no, p.product_code, p.stock_key, p.name AS product_name, p.unit, p.lot_size,
           loc.code AS location_code,
           (SELECT COALESCE(SUM(s.qty), 0) FROM stock s WHERE s.company_id = ${companyId} AND s.product_id = l.product_id) AS stock_on_hand
    FROM issue_order_lines l
    JOIN products p ON p.id = l.product_id
    LEFT JOIN locations loc ON loc.id = l.location_id
    WHERE l.company_id = ${companyId} AND l.order_id = ${orderId}
    ORDER BY loc.code ASC NULLS LAST, l.seq ASC`;
  return rows.map((r: any) => ({
    id: r.id,
    orderId: r.order_id,
    seq: Number(r.seq ?? 1),
    productId: r.product_id,
    locationId: r.location_id ?? null,
    lotNo: r.lot_no ?? null,
    qtyPlanned: Number(r.qty_planned ?? 0),
    qtyInstructed: Number(r.qty_instructed ?? 0),
    qtyIssued: Number(r.qty_issued ?? 0),
    drawingNo: r.drawing_no ?? "",
    productCode: r.product_code ?? null,
    stockKey: r.stock_key ?? null,
    productName: r.product_name,
    unit: r.unit ?? "個",
    lotSize: numOrNull(r.lot_size),
    locationCode: r.location_code ?? null,
    stockOnHand: Number(r.stock_on_hand ?? 0),
  }));
}

export async function updateIssueOrderStatus(
  companyId: string,
  id: string,
  status: IssueOrderStatus
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE issue_orders SET status = ${status} WHERE company_id = ${companyId} AND id = ${id}`;
}

/**
 * 明細1件を出庫実行する。引当ロケから指示数を出庫（applyMovement, issueOrderId 紐付け）。
 * 完了後、全明細が出庫済みならオーダーを done、そうでなければ picking にする。
 */
export async function issueOrderLine(
  companyId: string,
  orderId: string,
  lineId: string,
  operator: string,
  allowNegative: boolean
): Promise<{ qtyAfter: number }> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT l.*, o.order_no FROM issue_order_lines l
    JOIN issue_orders o ON o.id = l.order_id
    WHERE l.company_id = ${companyId} AND l.id = ${lineId} AND l.order_id = ${orderId} LIMIT 1`;
  const line = rows[0] as any;
  if (!line) throw new Error("明細が見つかりません");
  if (!line.location_id) throw new Error("引当ロケがありません。ロケを指定してください");
  const remaining = Number(line.qty_instructed) - Number(line.qty_issued);
  if (remaining <= 0) throw new Error("この明細はすでに出庫済みです");

  const { qtyAfter } = await applyMovement(
    companyId,
    {
      productId: line.product_id,
      locationId: line.location_id,
      txType: "issue",
      qty: remaining,
      refNo: line.order_no,
      operator,
      note: "出庫指示による出庫",
      issueOrderId: orderId,
    },
    allowNegative
  );
  await sql`
    UPDATE issue_order_lines SET qty_issued = qty_instructed WHERE company_id = ${companyId} AND id = ${lineId}`;

  // オーダーのステータス更新
  const remain = await sql`
    SELECT COUNT(*) AS c FROM issue_order_lines
    WHERE order_id = ${orderId} AND qty_issued < qty_instructed`;
  const allDone = Number(remain[0].c) === 0;
  await sql`
    UPDATE issue_orders SET status = ${allDone ? "done" : "picking"}
    WHERE company_id = ${companyId} AND id = ${orderId} AND status <> 'cancelled'`;
  return { qtyAfter };
}

/**
 * 出庫伝票の未出庫明細を一括で確定（出庫）する。引当ロケのある明細のみ対象。
 * 個々に issueOrderLine を実行するため在庫更新は原子的。返り値で成功/スキップ件数を返す。
 */
export async function issueAllOrderLines(
  companyId: string,
  orderId: string,
  operator: string,
  allowNegative: boolean
): Promise<{ issued: number; skipped: number; failed: number }> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, location_id FROM issue_order_lines
    WHERE company_id = ${companyId} AND order_id = ${orderId} AND qty_issued < qty_instructed
    ORDER BY seq ASC`;
  let issued = 0;
  let skipped = 0;
  let failed = 0;
  for (const l of rows as any[]) {
    if (!l.location_id) {
      skipped++;
      continue;
    }
    try {
      await issueOrderLine(companyId, orderId, l.id as string, operator, allowNegative);
      issued++;
    } catch {
      failed++;
    }
  }
  return { issued, skipped, failed };
}

// ===== 取引先マスタ（仕入先/出荷先/移動先） =====

function mapPartner(r: any): Partner {
  return {
    id: r.id,
    kind: (r.kind ?? "supplier") as PartnerKind,
    code: r.code ?? null,
    name: r.name,
    contact: r.contact ?? null,
    notes: r.notes ?? null,
    active: r.active ?? true,
    createdAt: tsStr(r.created_at),
  };
}

/** 取引先一覧（kind 指定で絞り込み、有効のみは activeOnly）。 */
export async function listPartners(
  companyId: string,
  opts: { kind?: PartnerKind | null; activeOnly?: boolean } = {}
): Promise<Partner[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM partners
    WHERE company_id = ${companyId}
      AND (${opts.kind ?? null}::text IS NULL OR kind = ${opts.kind ?? null})
      AND (${opts.activeOnly ? true : null}::boolean IS NULL OR active = true)
    ORDER BY kind ASC, name ASC`;
  return rows.map(mapPartner);
}

export interface PartnerInput {
  kind: PartnerKind;
  code: string | null;
  name: string;
  contact: string | null;
  notes: string | null;
  active: boolean;
}

export async function createPartner(companyId: string, input: PartnerInput): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO partners (company_id, kind, code, name, contact, notes, active)
    VALUES (${companyId}, ${input.kind}, ${input.code}, ${input.name}, ${input.contact}, ${input.notes}, ${input.active})
    RETURNING id`;
  return rows[0].id as string;
}

export async function updatePartner(companyId: string, id: string, input: PartnerInput): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE partners SET kind = ${input.kind}, code = ${input.code}, name = ${input.name},
      contact = ${input.contact}, notes = ${input.notes}, active = ${input.active}
    WHERE company_id = ${companyId} AND id = ${id}`;
}

export async function deletePartner(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM partners WHERE company_id = ${companyId} AND id = ${id}`;
}

// ===== 会社設定・通知先 =====

export interface CompanySettings {
  notifyEmails: string;
  allowNegative: boolean;
}

export async function getCompanySettings(companyId: string): Promise<CompanySettings> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT notify_emails, allow_negative_stock FROM companies WHERE id = ${companyId} LIMIT 1`;
  return {
    notifyEmails: rows[0]?.notify_emails ?? "",
    allowNegative: Boolean(rows[0]?.allow_negative_stock),
  };
}

export async function getAllowNegative(companyId: string): Promise<boolean> {
  return (await getCompanySettings(companyId)).allowNegative;
}

export async function updateNotifyEmails(companyId: string, emails: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE companies SET notify_emails = ${emails || null} WHERE id = ${companyId}`;
}

export async function updateAllowNegative(companyId: string, allow: boolean): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE companies SET allow_negative_stock = ${allow} WHERE id = ${companyId}`;
}

/** アラート通知の実際の宛先リスト。notify_emails 未設定なら会社のユーザー全員。 */
export async function resolveNotifyRecipients(companyId: string): Promise<string[]> {
  await ensureSchema();
  const sql = getSql();
  const setting = (await getCompanySettings(companyId)).notifyEmails;
  const fromSetting = setting
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  if (fromSetting.length > 0) return fromSetting;
  const rows = await sql`SELECT email FROM users WHERE company_id = ${companyId}`;
  return rows.map((r: any) => r.email).filter(Boolean);
}

// ===== 入荷（受入）／入庫（棚入れ） =====

function mapReceipt(r: any): Receipt {
  return {
    id: r.id,
    receiptNo: r.receipt_no,
    deliverTo: r.deliver_to ?? null,
    status: (r.status ?? "open") as ReceiptStatus,
    createdBy: r.created_by ?? "",
    createdAt: tsStr(r.created_at),
  };
}

/** 受入伝票の採番（会社ごと。NH+7桁）。 */
export async function nextReceiptNo(companyId: string): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO receipt_counters (company_id, next_no) VALUES (${companyId}, 2)
    ON CONFLICT (company_id) DO UPDATE SET next_no = receipt_counters.next_no + 1
    RETURNING next_no - 1 AS n`;
  return "NH" + String(Number(rows[0].n)).padStart(7, "0");
}

/** 受入伝票を作成（納入場所を指定）。receipt_no は自動採番。 */
export async function createReceipt(
  companyId: string,
  input: { deliverTo: string | null; createdBy: string; siteId?: string | null }
): Promise<{ id: string; receiptNo: string }> {
  await ensureSchema();
  const sql = getSql();
  const receiptNo = await nextReceiptNo(companyId);
  const rows = await sql`
    INSERT INTO receipts (company_id, receipt_no, deliver_to, created_by, site_id)
    VALUES (${companyId}, ${receiptNo}, ${input.deliverTo}, ${input.createdBy}, ${input.siteId ?? null})
    RETURNING id`;
  return { id: rows[0].id as string, receiptNo };
}

/** 受入明細を追加（仕入先は品目マスタからスナップショット）。 */
export async function addReceiptLine(
  companyId: string,
  receiptId: string,
  input: { productId: string; perBox: number | null; boxCount: number | null; qty: number; refNo: string | null }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const seqRows = await sql`SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM receipt_lines WHERE receipt_id = ${receiptId}`;
  const seq = Number(seqRows[0].n);
  const pr = await sql`SELECT supplier FROM products WHERE company_id = ${companyId} AND id = ${input.productId} LIMIT 1`;
  const supplier = pr[0]?.supplier ?? null;
  await sql`
    INSERT INTO receipt_lines (company_id, receipt_id, seq, product_id, supplier, per_box, box_count, qty, ref_no)
    VALUES (${companyId}, ${receiptId}, ${seq}, ${input.productId}, ${supplier}, ${input.perBox}, ${input.boxCount}, ${input.qty}, ${input.refNo})`;
}

/** 入荷（受入）一覧。opts.siteId 指定時はその工場で受け入れた分だけ（工場スコープ）。 */
export async function listReceipts(
  companyId: string,
  opts: { siteId?: string | null } = {},
): Promise<ReceiptWithProgress[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT r.*,
      (SELECT COUNT(*) FROM receipt_lines l WHERE l.receipt_id = r.id) AS line_count,
      (SELECT COALESCE(SUM(l.qty - l.qty_putaway), 0) FROM receipt_lines l WHERE l.receipt_id = r.id) AS pending_qty,
      (SELECT COALESCE(SUM(l.qty), 0) FROM receipt_lines l WHERE l.receipt_id = r.id) AS total_qty
    FROM receipts r
    WHERE r.company_id = ${companyId}
      AND (${opts.siteId ?? null}::uuid IS NULL OR r.site_id = ${opts.siteId ?? null})
    ORDER BY r.created_at DESC`;
  return rows.map((r: any) => ({
    ...mapReceipt(r),
    lineCount: Number(r.line_count ?? 0),
    pendingQty: Number(r.pending_qty ?? 0),
    totalQty: Number(r.total_qty ?? 0),
  }));
}

/** 入荷（受入）1件。siteId 指定時は他工場の受入伝票を開けない。 */
export async function getReceipt(
  companyId: string,
  id: string,
  siteId: string | null = null,
): Promise<Receipt | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM receipts
    WHERE company_id = ${companyId} AND id = ${id}
      AND (${siteId}::uuid IS NULL OR site_id = ${siteId})
    LIMIT 1`;
  return rows[0] ? mapReceipt(rows[0]) : null;
}

function mapReceiptLine(r: any): ReceiptLineWithMeta {
  return {
    id: r.id,
    receiptId: r.receipt_id,
    seq: Number(r.seq ?? 1),
    productId: r.product_id,
    supplier: r.supplier ?? null,
    perBox: numOrNull(r.per_box),
    boxCount: numOrNull(r.box_count),
    qty: Number(r.qty ?? 0),
    qtyPutaway: Number(r.qty_putaway ?? 0),
    refNo: r.ref_no ?? null,
    labelPrinted: Boolean(r.label_printed),
    drawingNo: r.drawing_no ?? "",
    productCode: r.product_code ?? null,
    stockKey: r.stock_key ?? null,
    productName: r.product_name,
    unit: r.unit ?? "個",
    lotSize: numOrNull(r.lot_size),
  };
}

export async function listReceiptLines(companyId: string, receiptId: string): Promise<ReceiptLineWithMeta[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT l.*, p.drawing_no, p.product_code, p.stock_key, p.name AS product_name, p.unit, p.lot_size
    FROM receipt_lines l
    JOIN products p ON p.id = l.product_id
    WHERE l.company_id = ${companyId} AND l.receipt_id = ${receiptId}
    ORDER BY l.seq ASC`;
  return rows.map(mapReceiptLine);
}

/** ラベル発行対象の明細を id 指定で取得（面付け用）。 */
export async function getReceiptLinesByIds(companyId: string, ids: string[]): Promise<ReceiptLineWithMeta[]> {
  await ensureSchema();
  if (ids.length === 0) return [];
  const sql = getSql();
  const rows = await sql`
    SELECT l.*, p.drawing_no, p.product_code, p.stock_key, p.name AS product_name, p.unit, p.lot_size
    FROM receipt_lines l
    JOIN products p ON p.id = l.product_id
    WHERE l.company_id = ${companyId} AND l.id = ANY(${ids}::uuid[])
    ORDER BY l.seq ASC`;
  return rows.map(mapReceiptLine);
}

export async function deleteReceiptLine(companyId: string, lineId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM receipt_lines WHERE company_id = ${companyId} AND id = ${lineId} AND qty_putaway = 0`;
}

/** レ点した明細のラベル発行済みフラグを立てる。 */
export async function markReceiptLinesLabelPrinted(companyId: string, ids: string[]): Promise<void> {
  await ensureSchema();
  if (ids.length === 0) return;
  const sql = getSql();
  await sql`UPDATE receipt_lines SET label_printed = true WHERE company_id = ${companyId} AND id = ANY(${ids}::uuid[])`;
}

/**
 * 未入庫（棚入れ待ち）を品目ごとに集計（②入庫の候補一覧）。
 * opts.siteId 指定時は、その工場で受け入れた入荷分だけを候補にする（他工場の入荷を棚入れさせない）。
 */
export async function listPendingPutaway(
  companyId: string,
  opts: { siteId?: string | null } = {},
): Promise<PendingPutaway[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT l.product_id, p.drawing_no, p.product_code, p.stock_key, p.name AS product_name, p.unit, p.lot_size, p.supplier,
      SUM(l.qty - l.qty_putaway) AS pending_qty,
      (SELECT r2.deliver_to FROM receipt_lines l2 JOIN receipts r2 ON r2.id = l2.receipt_id
         WHERE l2.company_id = ${companyId} AND l2.product_id = l.product_id AND l2.qty > l2.qty_putaway
           AND (${opts.siteId ?? null}::uuid IS NULL OR r2.site_id = ${opts.siteId ?? null})
         ORDER BY l2.created_at DESC LIMIT 1) AS deliver_to
    FROM receipt_lines l
    JOIN products p ON p.id = l.product_id
    JOIN receipts r ON r.id = l.receipt_id
    WHERE l.company_id = ${companyId} AND l.qty > l.qty_putaway
      AND (${opts.siteId ?? null}::uuid IS NULL OR r.site_id = ${opts.siteId ?? null})
    GROUP BY l.product_id, p.drawing_no, p.product_code, p.stock_key, p.name, p.unit, p.lot_size, p.supplier
    HAVING SUM(l.qty - l.qty_putaway) > 0
    ORDER BY p.drawing_no ASC`;
  return rows.map((r: any) => ({
    productId: r.product_id,
    drawingNo: r.drawing_no ?? "",
    productCode: r.product_code ?? null,
    stockKey: r.stock_key ?? null,
    productName: r.product_name,
    unit: r.unit ?? "個",
    lotSize: numOrNull(r.lot_size),
    supplier: r.supplier ?? null,
    pendingQty: Number(r.pending_qty ?? 0),
    deliverTo: r.deliver_to ?? null,
  }));
}

/** その品目の未入庫数（棚入れ待ちの合計）。 */
export async function getPendingQtyForProduct(companyId: string, productId: string): Promise<number> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT COALESCE(SUM(qty - qty_putaway), 0) AS pending
    FROM receipt_lines WHERE company_id = ${companyId} AND product_id = ${productId} AND qty > qty_putaway`;
  return Number(rows[0]?.pending ?? 0);
}

/**
 * ②入庫（棚入れ）：受入済みの未入庫分をロケーションへ棚入れする。
 * stock 加算 ＋ transactions('putaway') ＋ 受入明細の qty_putaway を FIFO で消し込み（原子実行）。
 * 全量入庫した受入伝票は status='done' にする。部分入庫・複数ロケ分割に対応。
 */
export async function putawayProduct(
  companyId: string,
  input: { productId: string; locationId: string; qty: number; operator: string; siteId?: string | null }
): Promise<{ qtyAfter: number }> {
  await ensureSchema();
  const sql = getSql();
  const q = Math.abs(input.qty);
  if (q === 0) throw new Error("数量が 0 です");

  // 未入庫の受入明細を古い順（FIFO）に取得。
  // siteId 指定時は同じ工場で受け入れた入荷だけを消し込む（他工場の入荷を横取りしない）。
  const openLines = await sql`
    SELECT rl.id, rl.receipt_id, rl.qty, rl.qty_putaway, rl.ref_no, rl.supplier
    FROM receipt_lines rl
    JOIN receipts r ON r.id = rl.receipt_id
    WHERE rl.company_id = ${companyId} AND rl.product_id = ${input.productId} AND rl.qty > rl.qty_putaway
      AND (${input.siteId ?? null}::uuid IS NULL OR r.site_id = ${input.siteId ?? null})
    ORDER BY rl.created_at ASC, rl.seq ASC`;
  const pending = openLines.reduce((s: number, l: any) => s + (Number(l.qty) - Number(l.qty_putaway)), 0);
  if (pending < q) throw new Error(`未入庫数が不足しています（未入庫 ${pending}）`);

  // FIFO で各明細の消し込み量を計算
  let remaining = q;
  const lineUpdates: { id: string; newPutaway: number }[] = [];
  const affectedReceipts = new Set<string>();
  let supplier: string | null = null;
  for (const l of openLines as any[]) {
    if (remaining <= 0) break;
    const avail = Number(l.qty) - Number(l.qty_putaway);
    const take = Math.min(avail, remaining);
    lineUpdates.push({ id: l.id, newPutaway: Number(l.qty_putaway) + take });
    affectedReceipts.add(l.receipt_id);
    if (supplier == null) supplier = l.supplier ?? null;
    remaining -= take;
  }

  // 現在庫と受入伝票（現品票トレース用）を取得
  const cur = await getStockCell(companyId, input.productId, input.locationId);
  const before = cur?.qty ?? 0;
  const after = before + q;
  const stockId = cur?.id ?? randomUUID();
  const txId = randomUUID();
  const firstReceiptId = (openLines[0] as any).receipt_id;
  const rcpt = await sql`SELECT receipt_no, deliver_to FROM receipts WHERE id = ${firstReceiptId} LIMIT 1`;
  const receiptNo = rcpt[0]?.receipt_no ?? null;
  const deliverTo = rcpt[0]?.deliver_to ?? null;

  await sql.transaction([
    sql`
      INSERT INTO stock (id, company_id, product_id, location_id, qty, updated_at)
      VALUES (${stockId}, ${companyId}, ${input.productId}, ${input.locationId}, ${after}, NOW())
      ON CONFLICT (company_id, product_id, location_id) DO UPDATE SET qty = ${after}, updated_at = NOW()`,
    sql`
      INSERT INTO transactions
        (id, company_id, product_id, location_id, tx_type, qty_delta, qty_after, ref_no, operator, deliver_to, partner_name, note)
      VALUES (${txId}, ${companyId}, ${input.productId}, ${input.locationId}, 'putaway',
              ${q}, ${after}, ${receiptNo}, ${input.operator}, ${deliverTo}, ${supplier}, '入庫（棚入れ）')`,
    ...lineUpdates.map(
      (u) => sql`UPDATE receipt_lines SET qty_putaway = ${u.newPutaway} WHERE company_id = ${companyId} AND id = ${u.id}`
    ),
  ]);

  // 全量入庫した受入伝票を done に
  for (const rid of affectedReceipts) {
    await sql`
      UPDATE receipts SET status = 'done'
      WHERE company_id = ${companyId} AND id = ${rid} AND status = 'open'
        AND NOT EXISTS (SELECT 1 FROM receipt_lines l WHERE l.receipt_id = ${rid} AND l.qty > l.qty_putaway)`;
  }
  return { qtyAfter: after };
}

// ===== 作業者（users.role='worker' のアカウント） =====
// 旧 workers テーブル（名前だけの名簿）は廃止（データは残置）。
// 作業者アカウントはポータルのユーザー設定で発行・管理する。

export interface Worker {
  id: string;
  name: string;
  createdAt: string;
}

/**
 * 会社の作業者アカウント一覧（名前順）。
 * factory 指定時はその工場の作業者＋工場未設定（＝全工場で選べる）作業者だけを返す。
 */
export async function listWorkers(companyId: string, factory: string | null = null): Promise<Worker[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, name, created_at FROM users
    WHERE company_id = ${companyId} AND role <> 'admin'
      AND (${factory}::text IS NULL OR factory IS NULL OR factory = ${factory})
    ORDER BY name ASC`;
  return rows.map((r: any) => ({ id: r.id, name: r.name, createdAt: tsStr(r.created_at) }));
}

/** 作業者を追加。同名が既にあれば null を返す（重複登録しない）。 */
export async function createWorker(companyId: string, name: string): Promise<Worker | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO workers (company_id, name)
    VALUES (${companyId}, ${name})
    ON CONFLICT (company_id, name) DO NOTHING
    RETURNING id, name, created_at`;
  const r = rows[0] as any;
  if (!r) return null;
  return { id: r.id, name: r.name, createdAt: tsStr(r.created_at) };
}

/** 作業者を削除（過去の記録の氏名文字列はそのまま残る）。 */
export async function deleteWorker(companyId: string, id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM workers WHERE company_id = ${companyId} AND id = ${id}`;
}
