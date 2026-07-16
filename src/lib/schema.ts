import { getSql } from "./neon";
import { ensureAuthSchema } from "./authDb";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * DDL を実行するが、「既に存在する」系のエラーは無視する。
 * Postgres の CREATE INDEX/TABLE IF NOT EXISTS は同時実行に対して安全ではなく、
 * 複数リクエストが初回に同時に走ると pg_class のユニーク制約違反(23505/42P07/42710)で
 * 失敗しうる。冪等な初期化として、これらは握り潰す。
 */
async function safeDdl(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (e: any) {
    const code = e?.code ?? e?.sourceError?.code;
    // 42P07: duplicate_table, 42710: duplicate_object, 23505: unique_violation(pg_catalog)
    if (code === "42P07" || code === "42710" || code === "23505") return;
    throw e;
  }
}

let schemaReady: Promise<void> | null = null;

/**
 * 在庫管理のドメインテーブルを冪等に作成。
 * - products         … 商品（図番＝会社内一意。QRラベルの親）
 * - loc_areas        … ロケーション階層マスタ（エリア）
 * - loc_counters     … ロケ採番カウンタ（エリア×棚×段の間口採番）
 * - locations        … 実在ロケーション（エリア-棚-段-間口）
 * - stock            … 在庫台帳（商品×ロケ×数量＝現在庫の正）
 * - transactions     … 受払履歴（追記専用の証跡ログ）
 * - stocktakes       … 棚卸（指示）
 * - stocktake_lines  … 棚卸明細（商品×ロケ）
 *
 * 認証テーブル（companies/users）も同時に用意する。
 * 同一プロセス内の同時呼び出しは1回の実行に集約（共有プロミス）。失敗時は次回再試行できるよう解除。
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = buildSchema().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

async function buildSchema(): Promise<void> {
  const sql = getSql();

  await ensureAuthSchema();

  // デモ会社の識別フラグ（使い捨てデモ用・自動清掃の対象）
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false`);

  // 利用権（entitlement）判定用カラム。冪等追加。
  // ※社内運用（ON_PREMISE）では常に有効扱いだが、entitlement.ts が参照するため列は維持する。
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_pro BOOLEAN NOT NULL DEFAULT false`);
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ`);

  // アラート通知の宛先（カンマ区切り。未設定ならユーザー全員に送る）
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS notify_emails TEXT`);
  // 在庫不足時に出庫を許すか（既定 false=拒否）。先行出庫を許す現場のみ ON。
  await safeDdl(() => sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS allow_negative_stock BOOLEAN NOT NULL DEFAULT false`);

  // --- 商品（図番＝会社内一意のマスタ） ---
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS products (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      drawing_no   TEXT NOT NULL,
      name         TEXT NOT NULL,
      spec         TEXT,
      unit         TEXT NOT NULL DEFAULT '個',
      safety_stock INTEGER,
      category     TEXT,
      maker        TEXT,
      notes        TEXT,
      active       BOOLEAN NOT NULL DEFAULT true,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, drawing_no)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS products_company_idx ON products(company_id)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS products_company_name_idx ON products(company_id, name)`);
  // 商品CD（社内の商品コード）・在庫管理キー（ZK+番号。QRの中身）・購入先。図番と併存。
  await safeDdl(() => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS product_code TEXT`);
  await safeDdl(() => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_key TEXT`);
  await safeDdl(() => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier TEXT`);
  // ロットサイズ（荷姿1ロットあたりの数量。ラベル・ピッキングの荷姿計算に使用）
  await safeDdl(() => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS lot_size INTEGER`);
  // 副資材向け: メーカー品番（型番）。副資材の主識別＝品名＋規格＋メーカー＋メーカー品番。
  await safeDdl(() => sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS maker_code TEXT`);
  // 副資材は図番を持たないため NOT NULL を解除（既存の図番運用とも両立。UNIQUE は NULL 複数可）。
  await safeDdl(() => sql`ALTER TABLE products ALTER COLUMN drawing_no DROP NOT NULL`);
  await safeDdl(() => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS products_company_makercode_unique
    ON products(company_id, maker_code) WHERE maker_code IS NOT NULL`);
  await safeDdl(() => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS products_company_code_unique
    ON products(company_id, product_code) WHERE product_code IS NOT NULL`);
  await safeDdl(() => sql`
    CREATE UNIQUE INDEX IF NOT EXISTS products_company_stockkey_unique
    ON products(company_id, stock_key) WHERE stock_key IS NOT NULL`);

  // ===== 拠点（工場 sites / 職場 workplaces）: 副資材は職場ごとに在庫を独立管理 =====
  // 工場（サイト）
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS sites (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, name)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS sites_company_idx ON sites(company_id, sort_order)`);

  // 職場（ワークプレイス）。工場削除で CASCADE。副資材在庫の独立単位。
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS workplaces (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (site_id, name)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS workplaces_company_idx ON workplaces(company_id)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS workplaces_site_idx ON workplaces(site_id, sort_order)`);
  // 職場ごとの見取り図（エリアマップ）画像 URL（Blob）。
  await safeDdl(() => sql`ALTER TABLE workplaces ADD COLUMN IF NOT EXISTS map_image_url TEXT`);

  // 見取り図上のエリア位置ピン（職場×エリア。座標は画像に対する % 0-100）。
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS area_pins (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      workplace_id UUID NOT NULL REFERENCES workplaces(id) ON DELETE CASCADE,
      area         TEXT NOT NULL,
      map_x        NUMERIC(6,3) NOT NULL,
      map_y        NUMERIC(6,3) NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (workplace_id, area)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS area_pins_wp_idx ON area_pins(company_id, workplace_id)`);

  // --- ロケーション階層マスタ（エリア） ---
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS loc_areas (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code       TEXT NOT NULL,
      name       TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, code)
    )`);

  // --- ロケ採番カウンタ（エリア×棚×段 ごとに間口の次番号を保持） ---
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS loc_counters (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      area       TEXT NOT NULL,
      rack       TEXT NOT NULL,
      level      TEXT NOT NULL,
      next_bay   INTEGER NOT NULL DEFAULT 1,
      UNIQUE (company_id, area, rack, level)
    )`);

  // --- 実在ロケーション（採番済みの物理位置） ---
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS locations (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code       TEXT NOT NULL,
      area       TEXT NOT NULL,
      rack       TEXT NOT NULL,
      level      TEXT NOT NULL,
      bay        TEXT NOT NULL,
      name       TEXT,
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, code)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS locations_company_idx ON locations(company_id)`);
  // 副資材: 各置き場（ロケーション）は職場に属する → 在庫が職場ごとに独立する。
  await safeDdl(() => sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL`);
  await safeDdl(() => sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS workplace_id UUID REFERENCES workplaces(id) ON DELETE CASCADE`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS locations_workplace_idx ON locations(company_id, workplace_id)`);
  // 副資材の置き場は「職場＋置き場名」で十分。棚-段-間口の階層は任意化（NOT NULL 解除）。
  await safeDdl(() => sql`ALTER TABLE locations ALTER COLUMN area DROP NOT NULL`);
  await safeDdl(() => sql`ALTER TABLE locations ALTER COLUMN rack DROP NOT NULL`);
  await safeDdl(() => sql`ALTER TABLE locations ALTER COLUMN level DROP NOT NULL`);
  await safeDdl(() => sql`ALTER TABLE locations ALTER COLUMN bay DROP NOT NULL`);

  // --- 在庫台帳（商品×ロケ×数量 = 現在庫の正） ---
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS stock (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      qty         INTEGER NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, product_id, location_id)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS stock_product_idx ON stock(company_id, product_id)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS stock_location_idx ON stock(company_id, location_id)`);

  // --- 受払履歴（追記専用の証跡ログ） ---
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      product_id   UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      location_id  UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
      tx_type      TEXT NOT NULL,
      qty_delta    INTEGER NOT NULL,
      qty_after    INTEGER NOT NULL,
      ref_no       TEXT,
      operator     TEXT NOT NULL,
      stocktake_id UUID,
      note         TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS tx_company_created_idx ON transactions(company_id, created_at DESC)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS tx_product_idx ON transactions(company_id, product_id, created_at DESC)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS tx_location_idx ON transactions(company_id, location_id, created_at DESC)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS tx_type_idx ON transactions(company_id, tx_type, created_at DESC)`);
  // 入荷現品票用の納入場所、出庫指示との紐付け（追跡・現品票/ピッキング用）
  await safeDdl(() => sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deliver_to TEXT`);
  await safeDdl(() => sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS issue_order_id UUID`);
  // 取引先名（入荷=仕入先 / 移動=移動先。現品票・履歴に表示）
  await safeDdl(() => sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS partner_name TEXT`);

  // --- 取引先マスタ（仕入先=supplier / 出荷先=customer / 移動先=internal） ---
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS partners (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL,
      code       TEXT,
      name       TEXT NOT NULL,
      contact    TEXT,
      notes      TEXT,
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS partners_company_kind_idx ON partners(company_id, kind, name)`);

  // --- 棚卸（指示） ---
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS stocktakes (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      scope_area  TEXT,
      status      TEXT NOT NULL DEFAULT 'counting',
      created_by  TEXT NOT NULL,
      applied_at  TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS stocktakes_company_status_idx ON stocktakes(company_id, status, created_at DESC)`);

  // --- 棚卸明細（商品×ロケ 1行） ---
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS stocktake_lines (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      stocktake_id UUID NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
      product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      location_id  UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      book_qty     INTEGER NOT NULL,
      counted_qty  INTEGER,
      diff         INTEGER,
      counted_by   TEXT,
      counted_at   TIMESTAMPTZ,
      UNIQUE (stocktake_id, product_id, location_id)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS stocktake_lines_take_idx ON stocktake_lines(stocktake_id)`);

  // --- 出庫指示（出荷オーダーのヘッダ） ---
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS issue_orders (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      order_no    TEXT NOT NULL,
      customer    TEXT,
      deliver_to  TEXT,
      ship_group  TEXT,
      ship_date   DATE,
      pick_date   DATE,
      status      TEXT NOT NULL DEFAULT 'open',
      created_by  TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, order_no)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS issue_orders_company_status_idx ON issue_orders(company_id, status, created_at DESC)`);

  // --- 出庫指示 明細（商品×引当ロケ×数量） ---
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS issue_order_lines (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      order_id       UUID NOT NULL REFERENCES issue_orders(id) ON DELETE CASCADE,
      seq            INTEGER NOT NULL DEFAULT 1,
      product_id     UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      location_id    UUID REFERENCES locations(id) ON DELETE SET NULL,
      lot_no         TEXT,
      qty_planned    INTEGER NOT NULL DEFAULT 0,
      qty_instructed INTEGER NOT NULL DEFAULT 0,
      qty_issued     INTEGER NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS issue_order_lines_order_idx ON issue_order_lines(order_id, seq)`);

  // 出庫指示の採番カウンタ（会社ごと）
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS issue_order_counters (
      company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      next_no    INTEGER NOT NULL DEFAULT 1
    )`);

  // --- 受入伝票（入荷＝受入。ロケーションを持たない「入荷済み・未入庫」の記録） ---
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS receipts (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      receipt_no  TEXT NOT NULL,
      deliver_to  TEXT,
      status      TEXT NOT NULL DEFAULT 'open',
      created_by  TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, receipt_no)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS receipts_company_status_idx ON receipts(company_id, status, created_at DESC)`);

  // --- 受入明細（商品×受入数。ロケ未定＝未入庫。②入庫で qty_putaway を消し込む） ---
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS receipt_lines (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      receipt_id    UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      seq           INTEGER NOT NULL DEFAULT 1,
      product_id    UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      supplier      TEXT,
      per_box       INTEGER,
      box_count     INTEGER,
      qty           INTEGER NOT NULL DEFAULT 0,
      qty_putaway   INTEGER NOT NULL DEFAULT 0,
      ref_no        TEXT,
      label_printed BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS receipt_lines_receipt_idx ON receipt_lines(receipt_id, seq)`);
  // 未入庫（qty > qty_putaway）を商品ごとに集計する②入庫用の索引
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS receipt_lines_pending_idx ON receipt_lines(company_id, product_id) WHERE qty > qty_putaway`);

  // 受入伝票の採番カウンタ（会社ごと）
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS receipt_counters (
      company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      next_no    INTEGER NOT NULL DEFAULT 1
    )`);
}
