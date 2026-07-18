import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { getSql } from "./neon";
import { ensureSchema } from "./schema";

/** デモ用ログインの固定パスワード（誰でも体験できる前提なので公開で問題ない）。 */
export const DEMO_PASSWORD = "demo-2026";

/** 固定パスワードのハッシュはコールドスタート時に1回だけ計算（リクエスト毎の bcrypt を回避）。 */
const DEMO_PASSWORD_HASH = bcrypt.hashSync(DEMO_PASSWORD, 10);

/** 同時に保持するデモ会社の上限。 */
const MAX_DEMO_COMPANIES = 30;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 使い捨てデモのセッションを用意する。
 * - 3時間以上前の古いデモ会社を清掃
 * - is_demo=true のデモ会社＋デモユーザー＋サンプル商品・ロケ・在庫・受払・棚卸一式を新規作成
 * 実アカウント・本番データには一切影響しない。
 */
export async function createDemoSession(): Promise<{ email: string; password: string }> {
  await ensureSchema();
  const sql = getSql();

  await sql`
    DELETE FROM companies
    WHERE is_demo = true AND created_at < NOW() - INTERVAL '3 hours'`;

  const companyRows = await sql`
    INSERT INTO companies (name, is_demo) VALUES (${"（デモ）PF製作所"}, true) RETURNING id`;
  const companyId = companyRows[0].id as string;

  await sql`
    DELETE FROM companies
    WHERE is_demo = true AND id NOT IN (
      SELECT id FROM companies
      WHERE is_demo = true
      ORDER BY created_at DESC LIMIT ${MAX_DEMO_COMPANIES}
    )`;

  // role は必ず 'member'（デモユーザーに管理者権限を与えない）
  const email = `demo-${companyId}@demo.local`;
  await sql`
    INSERT INTO users (company_id, email, name, password_hash, role)
    VALUES (${companyId}, ${email}, ${"デモ太郎"}, ${DEMO_PASSWORD_HASH}, ${"member"})`;

  await seedSampleData(sql, companyId);

  return { email, password: DEMO_PASSWORD };
}

/**
 * サンプルの工場・職場・副資材・在庫・受払を投入。
 * 職場ごとに独立した在庫・安全在庫割れ・本日を含む受払の時系列を再現する。
 */
async function seedSampleData(sql: any, companyId: string): Promise<void> {
  // --- 仕入先マスタ（副資材の購入先） ---
  const partner = (kind: string, code: string | null, name: string, contact: string | null) =>
    sql`INSERT INTO partners (company_id, kind, code, name, contact) VALUES (${companyId}, ${kind}, ${code}, ${name}, ${contact})`;
  await partner("supplier", "S001", "モノタロウ", "資材調達");
  await partner("supplier", "S002", "トラスコ中山", null);
  await partner("supplier", "S003", "北光ケミカル", null);

  await partner("customer", "C001", "第2工場 組立課", null);

  // --- 工場・職場 ---
  const site = async (name: string, order: number): Promise<string> =>
    (await sql`INSERT INTO sites (company_id, name, sort_order) VALUES (${companyId}, ${name}, ${order}) RETURNING id`)[0].id as string;
  const workplace = async (siteId: string, name: string, order: number): Promise<string> =>
    (await sql`INSERT INTO workplaces (company_id, site_id, name, sort_order) VALUES (${companyId}, ${siteId}, ${name}, ${order}) RETURNING id`)[0].id as string;

  const honsha = await site("本社工場", 0);
  const dai2 = await site("第2工場", 1);
  const wAssemble = await workplace(honsha, "組立ライン1", 0);
  const wPaint = await workplace(honsha, "塗装ブース", 1);
  const wInspect = await workplace(honsha, "検査室", 2);
  const wDai2 = await workplace(dai2, "組立課", 0);

  // --- ロケーション（職場ごとの棚。エリア-棚-段-間口 + workplace_id） ---
  const loc = async (siteId: string, wpId: string, area: string, rack: string, level: string, bay: string): Promise<string> => {
    const r = rack.padStart(2, "0");
    const code = `${area}-${r}-${level}-${bay}`;
    return (await sql`
      INSERT INTO locations (company_id, site_id, workplace_id, code, area, rack, level, bay)
      VALUES (${companyId}, ${siteId}, ${wpId}, ${code}, ${area}, ${r}, ${level}, ${bay}) RETURNING id`)[0].id as string;
  };
  const locA = await loc(honsha, wAssemble, "A", "1", "1", "1");
  const locA2 = await loc(honsha, wAssemble, "A", "1", "2", "1");
  const locP = await loc(honsha, wPaint, "B", "1", "1", "1");
  const locI = await loc(honsha, wInspect, "C", "1", "1", "1");
  const locD = await loc(dai2, wDai2, "D", "1", "1", "1");

  // --- 副資材の商品マスタ（メーカー品番をキーに、図番なし。在庫管理キーは自動採番 ZK＋連番） ---
  let zkSeq = 0;
  const product = async (
    name: string, spec: string | null, unit: string, safety: number | null,
    category: string, maker: string, makerCode: string, supplier: string
  ): Promise<string> => {
    const stockKey = "ZK" + String(++zkSeq).padStart(8, "0");
    return (
      await sql`
        INSERT INTO products (company_id, name, spec, unit, safety_stock, category, maker, maker_code, supplier, stock_key)
        VALUES (${companyId}, ${name}, ${spec}, ${unit}, ${safety}, ${category}, ${maker}, ${makerCode}, ${supplier}, ${stockKey})
        RETURNING id`
    )[0].id as string;
  };

  const glove = await product("ニトリル手袋 Mサイズ", "粉なし 100枚入", "箱", 5, "消耗品", "ショーワグローブ", "NBR-M-100", "モノタロウ");
  const wes = await product("ウエス（白メリヤス）", "10kg 圧縮", "kg", 10, "消耗品", "宮本製作所", "WES-W-10", "トラスコ中山");
  const mask = await product("防塵マスク DS2", "使い捨て 50枚", "箱", 3, "保護具", "重松製作所", "MSK-DS2-50", "モノタロウ");
  const oil = await product("水溶性切削油 W-20", "18L 原液", "缶", 2, "油脂", "ユシロ化学", "CUT-W20-18L", "北光ケミカル");
  const disc = await product("研磨ディスク 100mm #60", "10枚入", "枚", 20, "工具消耗品", "日本レヂボン", "DISC-100-60", "トラスコ中山");
  const tape = await product("マスキングテープ 24mm", "18m 5巻", "巻", 15, "消耗品", "3M", "MSK-TP-24", "モノタロウ");
  const gun = await product("すべり止め軍手", "10双組", "双", 30, "消耗品", "おたふく手袋", "GUN-NBR-12", "モノタロウ");

  // --- 作業者名簿（記録入力時に選択する名前。アカウントとは独立） ---
  await sql`
    INSERT INTO workers (company_id, name) VALUES
      (${companyId}, ${"デモ太郎"}),
      (${companyId}, ${"デモ花子"})
    ON CONFLICT (company_id, name) DO NOTHING`;

  // --- 在庫＋受払（職場の既定置き場へ直接投入。時刻を散らし、一部は本日分） ---
  const move = async (
    productId: string, locationId: string, txType: string, delta: number, after: number,
    operator: string, hoursAgo: number, refNo: string | null
  ) => {
    await sql`
      INSERT INTO stock (id, company_id, product_id, location_id, qty, updated_at)
      VALUES (${randomUUID()}, ${companyId}, ${productId}, ${locationId}, ${after}, NOW())
      ON CONFLICT (company_id, product_id, location_id) DO UPDATE SET qty = ${after}, updated_at = NOW()`;
    await sql`
      INSERT INTO transactions
        (id, company_id, product_id, location_id, tx_type, qty_delta, qty_after, ref_no, operator, note, created_at)
      VALUES (${randomUUID()}, ${companyId}, ${productId}, ${locationId}, ${txType}, ${delta}, ${after},
              ${refNo}, ${operator}, ${null}, NOW() - ${hoursAgo + " hours"}::interval)`;
  };

  // 組立ライン1
  await move(glove, locA, "receipt", 12, 12, "デモ太郎", 50, "モノタロウ 6/10");
  await move(glove, locA, "issue", -4, 8, "デモ花子", 3, null); // 本日
  await move(wes, locA, "receipt", 20, 20, "デモ太郎", 70, null);
  await move(wes, locA, "issue", -16, 4, "デモ花子", 2, null); // 本日・安全在庫割れ（10）
  await move(gun, locA2, "receipt", 50, 50, "デモ太郎", 96, null);
  await move(gun, locA2, "issue", -5, 45, "デモ太郎", 1, null); // 本日
  // 塗装ブース
  await move(tape, locP, "receipt", 20, 20, "デモ太郎", 120, null);
  await move(tape, locP, "issue", -12, 8, "デモ花子", 6, null); // 安全在庫割れ（15）
  await move(glove, locP, "receipt", 6, 6, "デモ太郎", 60, null);
  await move(glove, locP, "issue", -3, 3, "デモ花子", 4, null); // 安全在庫割れ（5）
  // 検査室
  await move(glove, locI, "receipt", 12, 12, "デモ太郎", 40, null);
  await move(mask, locI, "receipt", 5, 5, "デモ太郎", 45, null);
  await move(mask, locI, "issue", -3, 2, "デモ花子", 20, null); // 安全在庫割れ（3）
  // 第2工場 組立課
  await move(gun, locD, "receipt", 20, 20, "デモ太郎", 80, null);
  await move(disc, locD, "receipt", 60, 60, "デモ太郎", 100, "トラスコ 6/8");
  await move(oil, locD, "receipt", 3, 3, "デモ太郎", 130, null);
  await move(oil, locD, "issue", -2, 1, "デモ花子", 26, null); // 安全在庫割れ（2）

  // --- 受入伝票（入荷済み・未入庫。②入庫（棚入れ）の体験用） ---
  const receiptId = (
    await sql`
      INSERT INTO receipts (company_id, receipt_no, deliver_to, status, created_by, created_at)
      VALUES (${companyId}, ${"NH0000012"}, ${"組立ライン1 受入場"}, ${"open"}, ${"デモ太郎"}, NOW() - INTERVAL '2 hours')
      RETURNING id`
  )[0].id as string;
  await sql`INSERT INTO receipt_counters (company_id, next_no) VALUES (${companyId}, 13)`;
  const rline = (seq: number, productId: string, supplier: string, perBox: number, boxCount: number, refNo: string | null, labelPrinted: boolean) =>
    sql`
      INSERT INTO receipt_lines (company_id, receipt_id, seq, product_id, supplier, per_box, box_count, qty, ref_no, label_printed)
      VALUES (${companyId}, ${receiptId}, ${seq}, ${productId}, ${supplier}, ${perBox}, ${boxCount}, ${perBox * boxCount}, ${refNo}, ${labelPrinted})`;
  await rline(1, glove, "モノタロウ", 10, 5, "6/12", true); // ラベル発行済（スキャン棚入れの体験用）
  await rline(2, disc, "トラスコ中山", 10, 3, null, false);

  // --- 出庫指示（未出庫。出庫→ロケ順ピッキング→3点照合の体験用） ---
  const orderId = (
    await sql`
      INSERT INTO issue_orders (company_id, order_no, customer, deliver_to, ship_group, ship_date, pick_date, status, created_by)
      VALUES (${companyId}, ${"SY0000021"}, ${"第2工場 組立課"}, ${"第2工場"}, ${"定期補充"}, CURRENT_DATE + 1, CURRENT_DATE, ${"open"}, ${"デモ太郎"})
      RETURNING id`
  )[0].id as string;
  await sql`INSERT INTO issue_order_counters (company_id, next_no) VALUES (${companyId}, 22)`;
  const oline = (seq: number, productId: string, locationId: string, qty: number, lot: string | null) =>
    sql`
      INSERT INTO issue_order_lines (company_id, order_id, seq, product_id, location_id, lot_no, qty_planned, qty_instructed)
      VALUES (${companyId}, ${orderId}, ${seq}, ${productId}, ${locationId}, ${lot}, ${qty}, ${qty})`;
  await oline(1, glove, locA, 3, null);
  await oline(2, gun, locA2, 10, null);
}
