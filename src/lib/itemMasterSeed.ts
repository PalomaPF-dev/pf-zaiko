import { getSql } from "./neon";
import { ensureSchema } from "./schema";
import meta from "@/data/item-master-meta.json";

// ===== 品目マスタの事前登録（同梱データ → item_master） =====
//
// 資材W/F からエクスポートした品目マスタを src/data/item-master.json に同梱してあり、
// 会社ごとに1回だけ item_master へ流し込む。取込済みかどうかは item_master_imports.version
// （＝データの基準日）で判定し、同梱データを差し替えたときだけ再取込が走る。
// データの作り方は scripts/build-item-master.py を参照。

/** 同梱データの版（資材W/F のスナップショット基準日 YYYYMMDD）。 */
export const ITEM_MASTER_VERSION: string = meta.version;

/** 同梱データの品目数。 */
export const ITEM_MASTER_COUNT: number = meta.count;

interface SeedFile {
  columns: string[];
  items: string[][];
}

/**
 * 品目データ本体（約1MB）を読む。
 * 取込のときだけ必要なので動的 import にし、他のルートの初期ロードに載せない。
 */
async function loadSeed(): Promise<SeedFile> {
  const mod = await import("@/data/item-master.json");
  return (mod.default ?? mod) as unknown as SeedFile;
}

function text(row: string[], col: Record<string, number>, key: string): string | null {
  const v = row[col[key]];
  return v === undefined || v === "" ? null : v;
}
function numeric(row: string[], col: Record<string, number>, key: string): number | null {
  const v = text(row, col, key);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 1回の INSERT で送る品目数。
 * 取込は画面の初回表示中に走るため、往復回数を抑えて数秒で終わるようにしている
 * （1000件 ≒ 320KB/リクエスト・全体で6往復）。途中で中断しても version を最後に立てるので、
 * 次のアクセスで頭からやり直せる（UPSERT なので二重登録にならない）。
 */
const BATCH_SIZE = 1000;

/**
 * 同梱データを item_master へ UPSERT する。
 * 行は jsonb_to_recordset で展開する（1リクエスト＝パラメータ1個で済み、件数に依存しない）。
 */
async function importSeed(companyId: string): Promise<number> {
  const sql = getSql();
  const seed = await loadSeed();
  // JSON は列名を持たない配列の配列（サイズ削減）。列順は seed.columns が持つ。
  const col = Object.fromEntries(seed.columns.map((c, i) => [c, i])) as Record<string, number>;
  const rows = seed.items;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
      code: text(r, col, "code"),
      name: text(r, col, "name") ?? "（品名未設定）",
      supplier_code: text(r, col, "supplierCode"),
      supplier_name: text(r, col, "supplierName"),
      alt_suppliers: text(r, col, "altSuppliers"),
      unit_code: text(r, col, "unitCode"),
      pack_qty: numeric(r, col, "packQty"),
      pack_unit_code: text(r, col, "packUnitCode"),
      lot_qty: numeric(r, col, "lotQty"),
      round_qty: numeric(r, col, "roundQty"),
      container: text(r, col, "container"),
      account_code: text(r, col, "accountCode"),
      unit_price: numeric(r, col, "unitPrice"),
      valid_from: text(r, col, "validFrom"),
      valid_to: text(r, col, "validTo"),
      active: text(r, col, "active") === "1",
    }));
    await sql`
      INSERT INTO item_master (
        company_id, code, name, supplier_code, supplier_name, alt_suppliers, unit_code,
        pack_qty, pack_unit_code, lot_qty, round_qty, container, account_code, unit_price,
        valid_from, valid_to, active, updated_at)
      SELECT ${companyId}::uuid, x.*, NOW()
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x(
        code TEXT, name TEXT, supplier_code TEXT, supplier_name TEXT, alt_suppliers TEXT, unit_code TEXT,
        pack_qty NUMERIC, pack_unit_code TEXT, lot_qty NUMERIC, round_qty NUMERIC, container TEXT,
        account_code TEXT, unit_price NUMERIC, valid_from TEXT, valid_to TEXT, active BOOLEAN)
      ON CONFLICT (company_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        supplier_code = EXCLUDED.supplier_code,
        supplier_name = EXCLUDED.supplier_name,
        alt_suppliers = EXCLUDED.alt_suppliers,
        unit_code = EXCLUDED.unit_code,
        pack_qty = EXCLUDED.pack_qty,
        pack_unit_code = EXCLUDED.pack_unit_code,
        lot_qty = EXCLUDED.lot_qty,
        round_qty = EXCLUDED.round_qty,
        container = EXCLUDED.container,
        account_code = EXCLUDED.account_code,
        unit_price = EXCLUDED.unit_price,
        valid_from = EXCLUDED.valid_from,
        valid_to = EXCLUDED.valid_to,
        active = EXCLUDED.active,
        updated_at = NOW()`;
  }
  await sql`
    INSERT INTO item_master_imports (company_id, version, item_count, imported_at)
    VALUES (${companyId}, ${ITEM_MASTER_VERSION}, ${rows.length}, NOW())
    ON CONFLICT (company_id) DO UPDATE SET
      version = EXCLUDED.version, item_count = EXCLUDED.item_count, imported_at = NOW()`;
  return rows.length;
}

/** 同一プロセス内で取込が二重に走らないようにする（会社ごとの共有プロミス）。 */
const inFlight = new Map<string, Promise<number>>();

/**
 * 品目マスタが未取込（または同梱データの版が新しい）なら取り込む。冪等。
 * 品目マスタを読む画面・API の入口で呼び、初回アクセス時に自動で揃うようにする。
 * 取込に失敗しても呼び出し元の画面は落とさない（次のアクセスで再試行される）。
 */
export async function ensureItemMasterSeeded(companyId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT version FROM item_master_imports WHERE company_id = ${companyId} LIMIT 1`;
    if (rows[0]?.version === ITEM_MASTER_VERSION) return;
    const running = inFlight.get(companyId);
    if (running) {
      await running;
      return;
    }
    const task = importSeed(companyId).finally(() => inFlight.delete(companyId));
    inFlight.set(companyId, task);
    await task;
  } catch (e) {
    console.error("[itemMaster] 取込に失敗しました（次回アクセスで再試行）:", e);
  }
}

/** 管理者が明示的に取り込み直すとき用（版が同じでも必ず流し込む）。 */
export async function reimportItemMaster(companyId: string): Promise<number> {
  await ensureSchema();
  return importSeed(companyId);
}
