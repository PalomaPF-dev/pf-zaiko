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
 * - item_master      … 品目マスタ（資材W/F から取り込む参照カタログ。品目コードで商品を呼び出す）
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

  // --- 品目マスタ（資材W/F から取り込む参照用カタログ） ---
  // 商品（products）とは別物。W/F に登録済みの品目を「品目コードで呼び出す」ための引き当て表で、
  // 在庫は持たない。ここから商品を起こすと products に1件作られ、以降の入出庫はそちらで動く。
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS item_master (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code           TEXT NOT NULL,
      name           TEXT NOT NULL,
      supplier_code  TEXT,
      supplier_name  TEXT,
      alt_suppliers  TEXT,
      unit_code      TEXT,
      pack_qty       NUMERIC,
      pack_unit_code TEXT,
      lot_qty        NUMERIC,
      round_qty      NUMERIC,
      container      TEXT,
      account_code   TEXT,
      unit_price     NUMERIC,
      valid_from     TEXT,
      valid_to       TEXT,
      active         BOOLEAN NOT NULL DEFAULT true,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, code)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS item_master_company_name_idx ON item_master(company_id, name)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS item_master_company_supplier_idx ON item_master(company_id, supplier_name)`);

  // 品目マスタの取込履歴（会社ごとに1行）。version = 取込元スナップショットの基準日。
  // 同梱データの版と一致していれば取込済みとみなし、再取込をスキップする。
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS item_master_imports (
      company_id  UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      version     TEXT NOT NULL,
      item_count  INTEGER NOT NULL DEFAULT 0,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

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
  // 実施した工場（作成時の「現在の職場」から記録）。工場スコープの絞り込みに使う。
  // NULL＝工場不明（この機能より前に作られた棚卸）。工場所属ユーザーには見せない（安全側）。
  await safeDdl(() => sql`ALTER TABLE stocktakes ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS stocktakes_site_idx ON stocktakes(company_id, site_id)`);

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
  // 出庫元の工場（作成時の「現在の職場」から記録）。工場スコープの絞り込みに使う（NULL＝工場不明）。
  await safeDdl(() => sql`ALTER TABLE issue_orders ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS issue_orders_site_idx ON issue_orders(company_id, site_id)`);

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
  // 受け入れた工場（作成時の「現在の職場」から記録）。工場スコープの絞り込みに使う（NULL＝工場不明）。
  // 未入庫（棚入れ待ち）の集計もこの列で絞るため、他工場の入荷が棚入れ候補に出てこない。
  await safeDdl(() => sql`ALTER TABLE receipts ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS receipts_site_idx ON receipts(company_id, site_id)`);

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

  // --- 作業者（アプリ内名簿。2026-07 アカウント方針変更） ---
  // ログインアカウントはポータルで払い出す共有アカウントのみ。個々の作業者は
  // アカウントを持たず、この名簿から記録入力時に自分の名前を選択する。
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS workers (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, name)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS workers_company_idx ON workers(company_id, created_at)`);

  // 工場スコープ導入で追加した site_id を、既存データに一度だけ補完する
  await backfillDocumentSites();
}

/**
 * バックフィル用。失敗しても起動を止めない（次回の ensureSchema で再試行される）。
 * DDL ではないので safeDdl とは別立てだが、「落とさない」流儀は同じ。
 */
async function safeBackfill(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (e) {
    console.error(`[schema] backfill ${label} failed (skipped):`, e);
  }
}

/**
 * 工場スコープ導入時の一度きりのバックフィル（冪等）。
 *
 * receipts / issue_orders / stocktakes に site_id を新設したが、既存行は NULL のため
 * 工場所属ユーザーからは既存の入荷・出庫・棚卸がすべて見えなくなってしまう。
 * 各伝票の明細が指す置き場（locations）から 職場(workplaces) → 工場(sites) を辿って補完する。
 *
 * - 明細が複数の工場にまたがる伝票は「明細数が最も多い工場」に寄せる（同数なら工場ID順で先頭＝再実行しても同じ結果）。
 * - 明細が無い／置き場から工場を辿れない伝票は NULL のまま（解決不能。管理者のみ閲覧可）。
 * - pf_migrations（authDb 側で作成）で一度きりにしつつ、UPDATE 自体も `site_id IS NULL` 条件付きで
 *   何度実行しても壊れない形にしている。
 */
async function backfillDocumentSites(): Promise<void> {
  const sql = getSql();
  const MIGRATION_KEY = "backfill_doc_site_id_v1";

  await safeBackfill(MIGRATION_KEY, async () => {
    const applied = await sql`SELECT 1 FROM pf_migrations WHERE key = ${MIGRATION_KEY} LIMIT 1`;
    if (applied.length > 0) return;

    // 0) 置き場の工場を職場から補完。locations.site_id が NULL でも workplace_id が
    //    埋まっている行があり得るため、先に揃えておく（読み取り側は locations.site_id で絞るため）。
    await sql`
      UPDATE locations l SET site_id = w.site_id
      FROM workplaces w
      WHERE l.workplace_id = w.id AND l.site_id IS NULL AND w.site_id IS NOT NULL`;

    // 1) 棚卸: stocktake_lines.location_id → locations → (workplaces) → sites
    await sql`
      WITH ranked AS (
        SELECT sl.stocktake_id AS doc_id,
               COALESCE(l.site_id, w.site_id) AS site_id,
               COUNT(*) AS n
        FROM stocktake_lines sl
        JOIN locations l ON l.id = sl.location_id
        LEFT JOIN workplaces w ON w.id = l.workplace_id
        WHERE COALESCE(l.site_id, w.site_id) IS NOT NULL
        GROUP BY 1, 2
      ), pick AS (
        SELECT DISTINCT ON (doc_id) doc_id, site_id
        FROM ranked ORDER BY doc_id, n DESC, site_id
      )
      UPDATE stocktakes s SET site_id = pick.site_id
      FROM pick WHERE s.id = pick.doc_id AND s.site_id IS NULL`;

    // 2) 出庫指示: issue_order_lines.location_id → locations → (workplaces) → sites
    //    引当前の明細は location_id が NULL なので、JOIN で自然に除外される。
    await sql`
      WITH ranked AS (
        SELECT il.order_id AS doc_id,
               COALESCE(l.site_id, w.site_id) AS site_id,
               COUNT(*) AS n
        FROM issue_order_lines il
        JOIN locations l ON l.id = il.location_id
        LEFT JOIN workplaces w ON w.id = l.workplace_id
        WHERE COALESCE(l.site_id, w.site_id) IS NOT NULL
        GROUP BY 1, 2
      ), pick AS (
        SELECT DISTINCT ON (doc_id) doc_id, site_id
        FROM ranked ORDER BY doc_id, n DESC, site_id
      )
      UPDATE issue_orders o SET site_id = pick.site_id
      FROM pick WHERE o.id = pick.doc_id AND o.site_id IS NULL`;

    // 3) 入荷（受入）: receipt_lines は「入荷時点ではロケ未定」の設計で location_id を持たない。
    //    唯一ロケに繋がるのは②入庫（棚入れ）の受払で、そこに受入伝票No が ref_no として残っている
    //    （putawayProduct が ref_no = receipts.receipt_no を記録。receipt_no は会社内で一意）。
    //    → 一度も棚入れしていない受入伝票は解決できず NULL のまま。
    await sql`
      WITH ranked AS (
        SELECT r.id AS doc_id,
               COALESCE(l.site_id, w.site_id) AS site_id,
               COUNT(*) AS n
        FROM receipts r
        JOIN transactions t
          ON t.company_id = r.company_id AND t.tx_type = 'putaway' AND t.ref_no = r.receipt_no
        JOIN locations l ON l.id = t.location_id
        LEFT JOIN workplaces w ON w.id = l.workplace_id
        WHERE COALESCE(l.site_id, w.site_id) IS NOT NULL
        GROUP BY 1, 2
      ), pick AS (
        SELECT DISTINCT ON (doc_id) doc_id, site_id
        FROM ranked ORDER BY doc_id, n DESC, site_id
      )
      UPDATE receipts r SET site_id = pick.site_id
      FROM pick WHERE r.id = pick.doc_id AND r.site_id IS NULL`;

    // 4) 工場が1つしかない会社は、残った未解決の伝票もその工場で確定できる（曖昧さが無い）。
    //    これで「一度も棚入れしていない入荷」など、明細から辿れない伝票も救われる。
    await sql`
      UPDATE receipts d SET site_id = s.id FROM sites s
      WHERE d.site_id IS NULL AND s.company_id = d.company_id
        AND (SELECT COUNT(*) FROM sites s2 WHERE s2.company_id = d.company_id) = 1`;
    await sql`
      UPDATE issue_orders d SET site_id = s.id FROM sites s
      WHERE d.site_id IS NULL AND s.company_id = d.company_id
        AND (SELECT COUNT(*) FROM sites s2 WHERE s2.company_id = d.company_id) = 1`;
    await sql`
      UPDATE stocktakes d SET site_id = s.id FROM sites s
      WHERE d.site_id IS NULL AND s.company_id = d.company_id
        AND (SELECT COUNT(*) FROM sites s2 WHERE s2.company_id = d.company_id) = 1`;

    await sql`INSERT INTO pf_migrations (key) VALUES (${MIGRATION_KEY}) ON CONFLICT DO NOTHING`;
  });
}
