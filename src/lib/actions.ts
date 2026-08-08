"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireEntitledSession, requireAdminSession, requireSession } from "./session";
import {
  CURRENT_WP_COOKIE,
  assertCurrentWorkplaceOperable,
  currentWorkplaceLocationId,
  resolveCurrentWorkplace,
} from "./workplace";
import {
  assertIssueOrderOperable,
  assertLocationOperable,
  assertReceiptOperable,
  assertStocktakeOperable,
  assertWorkplaceOperable,
  assertWorkplaceVisible,
  currentOpSiteScope,
  scopeSiteId,
} from "./scope";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  nextStockKey,
  getWorkplace,
  setWorkplaceMapImage,
  setAreaPin,
  deleteAreaPin,
  ensureDefaultLocation,
  getStockCell,
  createArea,
  deleteArea,
  createLocation,
  bulkCreateLocations,
  deleteLocation,
  nextBay,
  applyMovement,
  moveStock,
  createStocktake,
  setStocktakeCount,
  updateStocktakeStatus,
  applyStocktake,
  getAllowNegative,
  updateNotifyEmails,
  updateAllowNegative,
  nextOrderNo,
  createIssueOrder,
  addIssueOrderLine,
  deleteIssueOrderLine,
  updateIssueOrderStatus,
  issueOrderLine,
  issueAllOrderLines,
  createPartner,
  updatePartner,
  deletePartner,
  createReceipt,
  addReceiptLine,
  deleteReceiptLine,
  putawayProduct,
  bulkCreateProductsFromAllItems,
  bulkCreateProductsFromItems,
  bulkDeleteProducts,
  bulkSetProductCategory,
  getItemMastersByCodes,
  setItemMasterHidden,
  type ProductInput,
  type PartnerInput,
} from "./db";
import { reimportItemMaster } from "./itemMasterSeed";
import { ITEM_UNIT_LABELS, itemUnitForProduct, normalizeItemCode } from "./itemCode";
import { IO_TX_TYPES, PARTNER_KIND_LABEL, type TxType, type PartnerKind } from "./types";

// ===== FormData ヘルパー =====
function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function strOrNull(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}
function intOrNull(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function intOr(fd: FormData, key: string, fallback: number): number {
  const n = intOrNull(fd, key);
  return n == null ? fallback : n;
}

/**
 * 記録に載せる担当者名を決める。
 * 非管理者（一般。旧作業者を含む）は送信値を無視して必ず本人（ログイン中のアカウント名）で記録する。
 * 管理者・一般は作業者アカウント一覧からの代理入力を優先（未選択はログイン中のアカウント名）。
 */
function resolveOperator(
  fd: FormData,
  role: "admin" | "member" | "worker",
  userName: string
): string {
  if (role !== "admin") return userName || "（未設定）";
  return str(fd, "operator") || userName || "（未設定）";
}

export interface ActionResult {
  ok: boolean;
  message: string;
  receiptTxId?: string; // 入荷成功時、現品票印刷リンク用
  id?: string; // 作成/更新した対象のID（クライアント側の遷移用）
}

// ===== 品目マスタ =====

/**
 * 品目の一意制約違反(23505)を利用者向けの日本語メッセージへ変換。
 * 全画面のサーバーエラーにせず、フォーム上にインライン表示するために使う。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function productDuplicateMessage(e: any): string | null {
  const code = e?.code ?? e?.sourceError?.code;
  if (code !== "23505") return null;
  const constraint = String(e?.constraint ?? e?.sourceError?.constraint ?? "");
  if (constraint.includes("drawing_no")) {
    return "この図番は既に登録されています。別の図番にするか、既存の品目を編集してください。";
  }
  if (constraint.includes("stockkey")) {
    return "この在庫管理キーは既に登録されています。別のキーを入力してください。";
  }
  if (constraint.includes("code")) {
    return "この品目CDは既に登録されています。別の品目CDを入力してください。";
  }
  return "図番・品目CD・在庫管理キーのいずれかが既に登録されています。入力内容をご確認ください。";
}

function readProductInput(fd: FormData): ProductInput {
  const activeValues = fd.getAll("active").map(String);
  return {
    drawingNo: str(fd, "drawingNo"),
    productCode: strOrNull(fd, "productCode"),
    stockKey: strOrNull(fd, "stockKey"),
    name: str(fd, "name"),
    spec: strOrNull(fd, "spec"),
    unit: str(fd, "unit") || "個",
    lotSize: intOrNull(fd, "lotSize"),
    safetyStock: intOrNull(fd, "safetyStock"),
    category: strOrNull(fd, "category"),
    maker: strOrNull(fd, "maker"),
    makerCode: strOrNull(fd, "makerCode"),
    supplier: strOrNull(fd, "supplier"),
    notes: strOrNull(fd, "notes"),
    active: activeValues.length === 0 ? true : activeValues.includes("true"),
  };
}

/** 品目登録。重複などの失敗は全画面エラーにせず ActionResult で返す（フォームにインライン表示・入力値保持）。 */
export async function createProductAction(fd: FormData): Promise<ActionResult> {
  const { companyId } = await requireAdminSession();
  const input = readProductInput(fd);
  if (!input.name) return { ok: false, message: "品名を入力してください" };
  if (!input.makerCode && !input.drawingNo)
    return { ok: false, message: "メーカー品番または図番のいずれかを入力してください" };
  input.stockKey = await nextStockKey(companyId); // 在庫管理キーは登録時に自動採番（ZK＋連番）
  try {
    const id = await createProduct(companyId, input);
    revalidatePath("/products");
    return { ok: true, message: "登録しました", id };
  } catch (e: any) {
    const dup = productDuplicateMessage(e);
    if (dup) return { ok: false, message: dup };
    console.error("[createProduct] error:", e);
    return { ok: false, message: "登録に失敗しました。時間をおいて再度お試しください。" };
  }
}

export async function updateProductAction(id: string, fd: FormData): Promise<ActionResult> {
  const { companyId } = await requireAdminSession();
  const input = readProductInput(fd);
  if (!input.name) return { ok: false, message: "品名を入力してください" };
  if (!input.makerCode && !input.drawingNo)
    return { ok: false, message: "メーカー品番または図番のいずれかを入力してください" };
  try {
    await updateProduct(companyId, id, input);
    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    return { ok: true, message: "保存しました", id };
  } catch (e: any) {
    const dup = productDuplicateMessage(e);
    if (dup) return { ok: false, message: dup };
    console.error("[updateProduct] error:", e);
    return { ok: false, message: "保存に失敗しました。時間をおいて再度お試しください。" };
  }
}

export async function deleteProductAction(id: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  try {
    await deleteProduct(companyId, id);
  } catch (e: any) {
    // 23503: FK違反＝受払履歴・入荷/出庫明細が残っている（証跡保護のため削除不可）
    const code = e?.code ?? e?.sourceError?.code;
    if (code === "23503") redirect(`/products/${id}/edit?error=history`);
    throw e;
  }
  revalidatePath("/products");
  revalidatePath("/items");
  redirect("/products");
}

const UUID_INPUT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 品目マスタの一括削除（管理者のみ）。一括登録のやり直し用。
 * 受払履歴・入荷/出庫明細のある品目はスキップされる（結果はバナーで通知）。
 */
export async function bulkDeleteProductsAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const ids = Array.from(
    new Set(fd.getAll("ids").map(String).filter((v) => UUID_INPUT_RE.test(v)))
  );
  if (ids.length === 0) redirect("/products");
  const deleted = await bulkDeleteProducts(companyId, ids);
  revalidatePath("/products");
  revalidatePath("/items");
  redirect(`/products?deleted=${deleted}&selected=${ids.length}`);
}

/**
 * 選択した品目の分類をまとめて設定する（管理者のみ）。空欄で実行すると未分類に戻す。
 * カタログから一括登録した品目の分類分けを、一覧上で完結させるためのアクション。
 */
export async function bulkSetCategoryAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const ids = Array.from(
    new Set(fd.getAll("ids").map(String).filter((v) => UUID_INPUT_RE.test(v)))
  );
  if (ids.length === 0) redirect("/products");
  const category = strOrNull(fd, "category");
  const n = await bulkSetProductCategory(companyId, ids, category);
  revalidatePath("/products");
  redirect(`/products?categorized=${n}${category ? `&cat=${encodeURIComponent(category)}` : ""}`);
}

// ===== 資材W/F 品目カタログ =====

/** 同梱の品目カタログを取り込み直す（版が同じでも上書き）。管理者のみ。 */
export async function reimportItemMasterAction(): Promise<void> {
  const { companyId } = await requireAdminSession();
  await reimportItemMaster(companyId);
  revalidatePath("/items");
}

/** 一度に登録できる上限。カタログ1ページ分（100件）を選び切っても余裕がある値。 */
const BULK_REGISTER_LIMIT = 500;

/**
 * カタログで選択した品目を、品目マスタへ一括登録する（管理者のみ）。
 * カタログは役務・費用系（保守・処理・運賃など）も含むため全件は入れず、
 * 現物在庫を持つ品目だけを選んで登録してもらう前提。
 * 登録済みのコードは自動で除外されるので、二重に押しても増えない。
 */
export async function bulkRegisterItemsAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const codes = Array.from(
    new Set(
      fd
        .getAll("codes")
        .map((v) => normalizeItemCode(String(v)))
        .filter((c): c is string => c != null)
    )
  );
  if (codes.length === 0) redirect("/items");
  if (codes.length > BULK_REGISTER_LIMIT) {
    throw new Error(`一度に登録できるのは ${BULK_REGISTER_LIMIT} 品目までです`);
  }

  // 単位は W/F の単位コード表が判明しているものだけ引き継ぐ（不明なら既定の「個」）
  const items = await getItemMastersByCodes(companyId, codes);
  const created = await bulkCreateProductsFromItems(
    companyId,
    items.map((i) => ({ code: i.code, unit: itemUnitForProduct(i.unitCode) }))
  );

  revalidatePath("/items");
  revalidatePath("/products");
  redirect(`/items?registered=${created}&selected=${codes.length}`);
}

/**
 * カタログの未登録品目（削除済みを除く）を全件まとめて品目マスタへ登録する（管理者のみ）。
 * 不要品目をカタログから削除し終えたあとの初期展開用。件数上限は設けない
 * （1つの INSERT で完結し、登録済みは自動スキップされるため）。
 */
export async function bulkRegisterAllItemsAction(): Promise<void> {
  const { companyId } = await requireAdminSession();
  const created = await bulkCreateProductsFromAllItems(companyId, ITEM_UNIT_LABELS);
  revalidatePath("/items");
  revalidatePath("/products");
  redirect(`/items?registered=${created}`);
}

/** FormData の codes[] を正規化して重複排除。 */
function readItemCodes(fd: FormData): string[] {
  return Array.from(
    new Set(
      fd
        .getAll("codes")
        .map((v) => normalizeItemCode(String(v)))
        .filter((c): c is string => c != null)
    )
  );
}

/**
 * カタログで選択した品目を削除（非表示に）する（管理者のみ）。
 * 役務・費用系など在庫管理に不要な品目を一覧から外す用途。行は消さないため
 * W/F 新版の取込でも復活せず、「削除済み」フィルタからいつでも元に戻せる。
 */
export async function bulkDeleteItemsAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const codes = readItemCodes(fd);
  if (codes.length === 0) redirect("/items");
  const n = await setItemMasterHidden(companyId, codes, true);
  revalidatePath("/items");
  redirect(`/items?removed=${n}`);
}

/** 削除済み（非表示）の品目をカタログへ元に戻す（管理者のみ）。 */
export async function bulkRestoreItemsAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const codes = readItemCodes(fd);
  if (codes.length === 0) redirect("/items?only=deleted");
  const n = await setItemMasterHidden(companyId, codes, false);
  revalidatePath("/items");
  redirect(`/items?only=deleted&restored=${n}`);
}

// ===== ロケーション =====

export async function createAreaAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const code = str(fd, "code").toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(code)) throw new Error("エリアは A〜Z（1〜2字）で入力してください");
  await createArea(companyId, code, strOrNull(fd, "name"));
  revalidatePath("/locations");
  revalidatePath("/settings");
}

export async function deleteAreaAction(id: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  await deleteArea(companyId, id);
  revalidatePath("/locations");
  revalidatePath("/settings");
}

export async function createLocationAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const area = str(fd, "area").toUpperCase();
  const rack = str(fd, "rack");
  const level = str(fd, "level");
  const autoBay = str(fd, "autoBay") === "true";
  if (!area || !rack || !level) throw new Error("エリア・棚・段を入力してください");
  let bay = str(fd, "bay");
  if (autoBay || bay === "") {
    bay = String(await nextBay(companyId, area, String(Number(rack)).padStart(2, "0"), String(Number(level))));
  }
  // 新規ロケは現在の職場に属する（在庫がこの職場で見えるようにする）
  const wp = await resolveCurrentWorkplace(companyId);
  try {
    await createLocation(companyId, { area, rack, level, bay, name: strOrNull(fd, "name"), siteId: wp?.siteId ?? null, workplaceId: wp?.id ?? null });
  } catch (e: any) {
    if (e?.code === "23505" || e?.sourceError?.code === "23505") {
      throw new Error("このロケーションは既に登録されています");
    }
    throw e;
  }
  revalidatePath("/locations");
  redirect("/locations");
}

export async function bulkCreateLocationsAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const area = str(fd, "area").toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(area)) throw new Error("エリアは A〜Z（1〜2字）で入力してください");
  const wp = await resolveCurrentWorkplace(companyId);
  const spec = {
    area,
    rackFrom: intOr(fd, "rackFrom", 1),
    rackTo: intOr(fd, "rackTo", 1),
    levelFrom: intOr(fd, "levelFrom", 1),
    levelTo: intOr(fd, "levelTo", 1),
    bayFrom: intOr(fd, "bayFrom", 1),
    bayTo: intOr(fd, "bayTo", 1),
    siteId: wp?.siteId ?? null,
    workplaceId: wp?.id ?? null,
  };
  if (spec.rackTo < spec.rackFrom || spec.levelTo < spec.levelFrom || spec.bayTo < spec.bayFrom) {
    throw new Error("範囲の指定が正しくありません（開始 ≦ 終了）");
  }
  const total = (spec.rackTo - spec.rackFrom + 1) * (spec.levelTo - spec.levelFrom + 1) * (spec.bayTo - spec.bayFrom + 1);
  if (total > 500) throw new Error("一度に生成できるのは 500 ロケまでです");
  await bulkCreateLocations(companyId, spec);
  revalidatePath("/locations");
  redirect("/locations");
}

export async function deleteLocationAction(id: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  await deleteLocation(companyId, id);
  revalidatePath("/locations");
  redirect("/locations");
}

// ===== 入出庫 =====

/** 入庫/出庫/調整の1件記録。クライアント（IoForm）から呼ばれ、結果を返す。 */
export async function recordMovementAction(fd: FormData): Promise<ActionResult> {
  const { companyId, userName, role } = await requireEntitledSession();
  const productId = str(fd, "productId");
  const locationId = str(fd, "locationId");
  const txType = str(fd, "txType") as TxType;
  if (!productId || !locationId) return { ok: false, message: "品目とロケーションを指定してください" };
  if (!IO_TX_TYPES.includes(txType)) return { ok: false, message: "処理区分が不正です" };
  const qtyRaw = intOrNull(fd, "qty");
  if (qtyRaw == null || (txType !== "adjust" && qtyRaw <= 0)) {
    return { ok: false, message: "数量を正しく入力してください" };
  }
  try {
    // 所属工場の外の置き場へは書き込ませない（UIで出さないが、サーバー側でも必ず防ぐ）
    await assertLocationOperable(companyId, locationId);
    const allowNegative = await getAllowNegative(companyId);
    const { qtyAfter, txId } = await applyMovement(
      companyId,
      {
        productId,
        locationId,
        txType,
        qty: qtyRaw,
        refNo: strOrNull(fd, "refNo"),
        operator: resolveOperator(fd, role, userName),
        note: strOrNull(fd, "note"),
        deliverTo: strOrNull(fd, "deliverTo"),
        partnerName: strOrNull(fd, "partnerName"),
      },
      allowNegative
    );
    revalidatePath("/stock");
    revalidatePath("/records");
    revalidatePath("/");
    revalidatePath(`/products`);
    return {
      ok: true,
      message: `記録しました。現在庫 ${qtyAfter}`,
      // 入荷のときだけ現品票を印刷できるように tx を返す
      receiptTxId: txType === "receipt" ? txId : undefined,
    };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "記録に失敗しました" };
  }
}

/** ロケ間移動。 */
export async function moveStockAction(fd: FormData): Promise<ActionResult> {
  const { companyId, userName, role } = await requireEntitledSession();
  const productId = str(fd, "productId");
  const fromLocationId = str(fd, "fromLocationId");
  const toLocationId = str(fd, "toLocationId");
  const qty = intOrNull(fd, "qty");
  if (!productId || !fromLocationId || !toLocationId) {
    return { ok: false, message: "品目・移動元・移動先を指定してください" };
  }
  if (qty == null || qty <= 0) return { ok: false, message: "数量を正しく入力してください" };
  try {
    await assertLocationOperable(companyId, fromLocationId);
    await assertLocationOperable(companyId, toLocationId);
    const allowNegative = await getAllowNegative(companyId);
    const { txId } = await moveStock(
      companyId,
      {
        productId,
        fromLocationId,
        toLocationId,
        qty,
        refNo: strOrNull(fd, "refNo"),
        operator: resolveOperator(fd, role, userName),
        note: strOrNull(fd, "note"),
        partnerName: strOrNull(fd, "partnerName"),
      },
      allowNegative
    );
    revalidatePath("/stock");
    revalidatePath("/records");
    // 移動時も現品票（移動先タグ）を印刷できるよう move_in の tx を返す
    return { ok: true, message: "移動を記録しました", receiptTxId: txId };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "移動に失敗しました" };
  }
}

// ===== 棚卸 =====

export async function createStocktakeAction(fd: FormData): Promise<void> {
  const { companyId, userName } = await requireEntitledSession();
  const title = str(fd, "title");
  if (!title) throw new Error("棚卸の名称を入力してください");
  // 棚卸は在庫を書き換えるので、所属工場の職場でしか始められない
  await assertCurrentWorkplaceOperable(companyId);
  const wp = await resolveCurrentWorkplace(companyId);
  if (!wp) throw new Error("職場が未登録です。先に工場・職場を登録してください。");
  const id = await createStocktake(companyId, {
    title,
    workplaceId: wp.id,
    siteId: wp.siteId,
    scopeLabel: `${wp.siteName}／${wp.name}`,
    createdBy: userName || "（未設定）",
  });
  revalidatePath("/stocktakes");
  redirect(`/stocktakes/${id}`);
}

/** 実棚数をまとめて保存（明細フォームの count_<lineId> を一括反映）。空欄はスキップ。 */
export async function saveStocktakeCountsAction(stocktakeId: string, fd: FormData): Promise<void> {
  const { companyId, userName, role } = await requireEntitledSession();
  await assertStocktakeOperable(companyId, stocktakeId);
  const operator = resolveOperator(fd, role, userName);
  const tasks: Promise<void>[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("count_")) continue;
    const raw = String(value).trim();
    if (raw === "") continue;
    const counted = parseInt(raw, 10);
    if (!Number.isFinite(counted) || counted < 0) continue;
    const lineId = key.slice("count_".length);
    tasks.push(setStocktakeCount(companyId, lineId, counted, operator));
  }
  await Promise.all(tasks);
  revalidatePath(`/stocktakes/${stocktakeId}`);
}

export async function reviewStocktakeAction(id: string): Promise<void> {
  const { companyId } = await requireEntitledSession();
  await assertStocktakeOperable(companyId, id);
  await updateStocktakeStatus(companyId, id, "review");
  revalidatePath(`/stocktakes/${id}`);
  revalidatePath("/stocktakes");
}

export async function backToCountingAction(id: string): Promise<void> {
  const { companyId } = await requireEntitledSession();
  await assertStocktakeOperable(companyId, id);
  await updateStocktakeStatus(companyId, id, "counting");
  revalidatePath(`/stocktakes/${id}`);
}

export async function cancelStocktakeAction(id: string): Promise<void> {
  const { companyId } = await requireEntitledSession();
  await assertStocktakeOperable(companyId, id);
  await updateStocktakeStatus(companyId, id, "cancelled");
  revalidatePath(`/stocktakes/${id}`);
  revalidatePath("/stocktakes");
  redirect("/stocktakes");
}

export async function applyStocktakeAction(id: string): Promise<void> {
  const { companyId, userName } = await requireEntitledSession();
  await assertStocktakeOperable(companyId, id);
  const applied = await applyStocktake(companyId, id, userName || "（未設定）");
  if (!applied) throw new Error("この棚卸はすでに反映・中止済みです");
  revalidatePath(`/stocktakes/${id}`);
  revalidatePath("/stocktakes");
  revalidatePath("/stock");
  revalidatePath("/records");
  revalidatePath("/");
}

// ===== 出庫指示（出荷オーダー） =====

export async function createIssueOrderAction(fd: FormData): Promise<void> {
  const { companyId, userName } = await requireEntitledSession();
  await assertCurrentWorkplaceOperable(companyId);
  const orderNo = str(fd, "orderNo") || (await nextOrderNo(companyId));
  // 出庫元の工場を記録（工場スコープの絞り込みに使う）
  const wp = await resolveCurrentWorkplace(companyId);
  const id = await createIssueOrder(companyId, {
    orderNo,
    customer: strOrNull(fd, "customer"),
    deliverTo: strOrNull(fd, "deliverTo"),
    shipGroup: strOrNull(fd, "shipGroup"),
    shipDate: strOrNull(fd, "shipDate"),
    pickDate: strOrNull(fd, "pickDate"),
    createdBy: userName || "（未設定）",
    siteId: wp?.siteId ?? null,
  });
  revalidatePath("/issue-orders");
  redirect(`/issue-orders/${id}`);
}

export async function addIssueOrderLineAction(orderId: string, fd: FormData): Promise<void> {
  const { companyId } = await requireEntitledSession();
  await assertIssueOrderOperable(companyId, orderId);
  const productId = str(fd, "productId");
  const qty = intOrNull(fd, "qtyPlanned");
  if (!productId) throw new Error("品目を選択してください");
  if (qty == null || qty <= 0) throw new Error("出荷予定数を正しく入力してください");
  // 引当は現在の職場のロケに限定する
  const wp = await resolveCurrentWorkplace(companyId);
  const locationId = strOrNull(fd, "locationId");
  if (locationId) await assertLocationOperable(companyId, locationId);
  await addIssueOrderLine(companyId, orderId, {
    productId,
    locationId,
    lotNo: strOrNull(fd, "lotNo"),
    qtyPlanned: qty,
    workplaceId: wp?.id ?? null,
  });
  revalidatePath(`/issue-orders/${orderId}`);
}

export async function deleteIssueOrderLineAction(orderId: string, lineId: string): Promise<void> {
  const { companyId } = await requireEntitledSession();
  await assertIssueOrderOperable(companyId, orderId);
  await deleteIssueOrderLine(companyId, lineId);
  revalidatePath(`/issue-orders/${orderId}`);
}

/** 明細1件を出庫実行（引当ロケから指示数を出庫）。 */
export async function issueOrderLineAction(orderId: string, lineId: string): Promise<ActionResult> {
  const { companyId, userName } = await requireEntitledSession();
  try {
    await assertIssueOrderOperable(companyId, orderId);
    const allowNegative = await getAllowNegative(companyId);
    const { qtyAfter } = await issueOrderLine(companyId, orderId, lineId, userName || "（未設定）", allowNegative);
    revalidatePath(`/issue-orders/${orderId}`);
    revalidatePath("/stock");
    revalidatePath("/records");
    revalidatePath("/");
    return { ok: true, message: `出庫しました。残 ${qtyAfter}` };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "出庫に失敗しました" };
  }
}

/** 未出庫明細を一括で確定（出庫）する。 */
export async function issueAllOrderLinesAction(orderId: string): Promise<ActionResult> {
  const { companyId, userName } = await requireEntitledSession();
  try {
    await assertIssueOrderOperable(companyId, orderId);
    const allowNegative = await getAllowNegative(companyId);
    const { issued, skipped, failed } = await issueAllOrderLines(companyId, orderId, userName || "（未設定）", allowNegative);
    revalidatePath(`/issue-orders/${orderId}`);
    revalidatePath("/stock");
    revalidatePath("/records");
    revalidatePath("/");
    if (issued === 0 && (skipped > 0 || failed > 0)) {
      return { ok: false, message: `出庫できませんでした（未引当 ${skipped} 件 / 失敗 ${failed} 件）。ロケ引当・在庫をご確認ください。` };
    }
    const notes = [skipped > 0 ? `未引当スキップ ${skipped} 件` : "", failed > 0 ? `失敗 ${failed} 件` : ""].filter(Boolean).join("、");
    return { ok: true, message: `${issued} 件を出庫しました${notes ? `（${notes}）` : ""}` };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "一括出庫に失敗しました" };
  }
}

export async function cancelIssueOrderAction(id: string): Promise<void> {
  const { companyId } = await requireEntitledSession();
  await assertIssueOrderOperable(companyId, id);
  await updateIssueOrderStatus(companyId, id, "cancelled");
  revalidatePath("/issue-orders");
  revalidatePath(`/issue-orders/${id}`);
  redirect("/issue-orders");
}

// ===== 入荷（受入）／入庫（棚入れ） =====

/** ①入荷：受入伝票を作成（納入場所を指定）。 */
export async function createReceiptAction(fd: FormData): Promise<void> {
  const { companyId, userName } = await requireEntitledSession();
  await assertCurrentWorkplaceOperable(companyId);
  // 受け入れた工場を記録（工場スコープの絞り込み・棚入れ候補の限定に使う）
  const wp = await resolveCurrentWorkplace(companyId);
  const { id } = await createReceipt(companyId, {
    deliverTo: strOrNull(fd, "deliverTo"),
    createdBy: userName || "（未設定）",
    siteId: wp?.siteId ?? null,
  });
  revalidatePath("/inbound");
  redirect(`/inbound/${id}`);
}

/** ①入荷：受入明細を追加（箱数×入り数=合計 or 合計直接）。 */
export async function addReceiptLineAction(receiptId: string, fd: FormData): Promise<void> {
  const { companyId } = await requireEntitledSession();
  await assertReceiptOperable(companyId, receiptId);
  const productId = str(fd, "productId");
  if (!productId) throw new Error("品目を選択してください");
  const perBox = intOrNull(fd, "perBox");
  const boxCount = intOrNull(fd, "boxCount");
  const qty = intOrNull(fd, "qty");
  if (qty == null || qty <= 0) throw new Error("入荷数量を正しく入力してください");
  await addReceiptLine(companyId, receiptId, {
    productId,
    perBox: perBox && perBox > 0 ? perBox : null,
    boxCount: boxCount && boxCount > 0 ? boxCount : null,
    qty,
    refNo: strOrNull(fd, "refNo"),
  });
  revalidatePath(`/inbound/${receiptId}`);
}

export async function deleteReceiptLineAction(receiptId: string, lineId: string): Promise<void> {
  const { companyId } = await requireEntitledSession();
  await assertReceiptOperable(companyId, receiptId);
  await deleteReceiptLine(companyId, lineId);
  revalidatePath(`/inbound/${receiptId}`);
}

/** ②入庫（棚入れ）：未入庫分をロケへ棚入れ。 */
export async function putawayAction(fd: FormData): Promise<ActionResult> {
  const { companyId, userName, role } = await requireEntitledSession();
  const productId = str(fd, "productId");
  const locationId = str(fd, "locationId");
  const qty = intOrNull(fd, "qty");
  if (!productId) return { ok: false, message: "品目を指定してください（ラベルをスキャン）" };
  if (!locationId) return { ok: false, message: "棚入れ先ロケーションを指定してください" };
  if (qty == null || qty <= 0) return { ok: false, message: "数量を正しく入力してください" };
  try {
    // 棚入れ先も、消し込む入荷も所属工場の中に限定する
    await assertLocationOperable(companyId, locationId);
    const { qtyAfter } = await putawayProduct(companyId, {
      productId,
      locationId,
      qty,
      operator: resolveOperator(fd, role, userName),
      siteId: scopeSiteId(await currentOpSiteScope()),
    });
    revalidatePath("/putaway");
    revalidatePath("/stock");
    revalidatePath("/records");
    revalidatePath("/");
    return { ok: true, message: `入庫しました。ロケ在庫 ${qtyAfter}` };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "入庫に失敗しました" };
  }
}

// ===== 取引先マスタ =====

const PARTNER_KINDS: PartnerKind[] = ["supplier", "customer", "internal"];

function readPartnerInput(fd: FormData): PartnerInput {
  const kindRaw = str(fd, "kind");
  const kind = (PARTNER_KINDS.includes(kindRaw as PartnerKind) ? kindRaw : "supplier") as PartnerKind;
  const activeValues = fd.getAll("active").map(String);
  return {
    kind,
    code: strOrNull(fd, "code"),
    name: str(fd, "name"),
    contact: strOrNull(fd, "contact"),
    notes: strOrNull(fd, "notes"),
    active: activeValues.length === 0 ? true : activeValues.includes("true"),
  };
}

export async function createPartnerAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const input = readPartnerInput(fd);
  if (!input.name) throw new Error(`${PARTNER_KIND_LABEL[input.kind]}名を入力してください`);
  await createPartner(companyId, input);
  revalidatePath("/partners");
}

export async function updatePartnerAction(id: string, fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const input = readPartnerInput(fd);
  if (!input.name) throw new Error("名称を入力してください");
  await updatePartner(companyId, id, input);
  revalidatePath("/partners");
}

export async function deletePartnerAction(id: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  await deletePartner(companyId, id);
  revalidatePath("/partners");
}

// ===== 設定 =====

export async function updateNotifyEmailsAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  await updateNotifyEmails(companyId, str(fd, "emails"));
  revalidatePath("/settings");
}

export async function updateAllowNegativeAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  await updateAllowNegative(companyId, str(fd, "allowNegative") === "true");
  revalidatePath("/settings");
}

// ===== 拠点（工場 / 職場）マスタ =====
// 工場・職場はポータルの部署設定が唯一の正で、アプリからは追加・編集・削除しない
// （POST /api/portal-masters が portal_code で突合して同期する）。UI からも操作導線を
// 外しているが、Server Action は直接呼べるため、サーバー側でも明示的に拒否する。
const MASTER_READONLY_MESSAGE =
  "工場・職場はポータルの部署設定と連動しています。追加・変更はポータルの管理画面で行ってください。";

export async function createSiteAction(_fd: FormData): Promise<void> {
  await requireAdminSession();
  throw new Error(MASTER_READONLY_MESSAGE);
}

export async function updateSiteAction(_id: string, _fd: FormData): Promise<void> {
  await requireAdminSession();
  throw new Error(MASTER_READONLY_MESSAGE);
}

export async function deleteSiteAction(_id: string): Promise<void> {
  await requireAdminSession();
  throw new Error(MASTER_READONLY_MESSAGE);
}

export async function createWorkplaceAction(_fd: FormData): Promise<void> {
  await requireAdminSession();
  throw new Error(MASTER_READONLY_MESSAGE);
}

export async function updateWorkplaceAction(_id: string, _fd: FormData): Promise<void> {
  await requireAdminSession();
  throw new Error(MASTER_READONLY_MESSAGE);
}

export async function deleteWorkplaceAction(_id: string): Promise<void> {
  await requireAdminSession();
  throw new Error(MASTER_READONLY_MESSAGE);
}

/** ヘッダの職場セレクタ: 現在の職場を Cookie に保存し、全画面を再取得させる。 */
export async function setCurrentWorkplaceAction(workplaceId: string): Promise<void> {
  const { companyId } = await requireSession();
  // 閲覧スコープ外の職場へは切り替えさせない（Cookie を直接書き換えても resolveCurrentWorkplace が弾く）。
  // 管理者は他工場の職場も選べる（閲覧のため）。そこで入出庫できるかは各アクション側で判定する。
  await assertWorkplaceVisible(companyId, workplaceId);
  const c = await cookies();
  c.set(CURRENT_WP_COOKIE, workplaceId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

// ===== 職場の見取り図（エリアマップ） =====

/** 見取り図画像を設定/差し替え/削除。旧 Blob は破棄する。 */
export async function setWorkplaceMapImageAction(workplaceId: string, url: string | null): Promise<void> {
  const { companyId } = await requireAdminSession();
  const old = await setWorkplaceMapImage(companyId, workplaceId, url);
  if (old && old !== url && old.includes("blob.vercel-storage.com")) {
    try {
      const { del } = await import("@vercel/blob");
      await del(old);
    } catch (e) {
      console.error("[map] old blob delete failed", e);
    }
  }
  revalidatePath("/locations/map");
}

/** エリアピンを配置/移動（画像に対する % 座標）。 */
export async function setAreaPinAction(workplaceId: string, area: string, x: number, y: number): Promise<void> {
  const { companyId } = await requireAdminSession();
  const cx = Math.min(100, Math.max(0, x));
  const cy = Math.min(100, Math.max(0, y));
  await setAreaPin(companyId, workplaceId, area, cx, cy);
  revalidatePath("/locations/map");
}

/** エリアピンを削除。 */
export async function deleteAreaPinAction(workplaceId: string, area: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  await deleteAreaPin(companyId, workplaceId, area);
  revalidatePath("/locations/map");
}

/**
 * 副資材の簡易入出庫。現在の職場の既定置き場に対して、
 * 入庫(receipt=+) / 払い出し(issue=-) を1タップで記録する。
 * ロケや伝票を意識させず、品目＋数量だけで完結する。
 */
export async function supplyMovementAction(fd: FormData): Promise<ActionResult> {
  const { companyId, userName } = await requireEntitledSession();
  const productId = str(fd, "productId");
  const txType = str(fd, "txType") as TxType;
  if (!productId) return { ok: false, message: "品目を選んでください" };
  if (txType !== "issue" && txType !== "receipt") return { ok: false, message: "処理区分が不正です" };
  const qty = intOrNull(fd, "qty");
  if (qty == null || qty <= 0) return { ok: false, message: "数量を正しく入力してください" };

  const locationId = await currentWorkplaceLocationId(companyId);
  if (!locationId) return { ok: false, message: "職場が未登録です。先に工場・職場を登録してください。" };

  try {
    // 所属工場以外の職場が選ばれている状態では書き込ませない
    await assertCurrentWorkplaceOperable(companyId);
    const allowNegative = await getAllowNegative(companyId);
    const { qtyAfter } = await applyMovement(
      companyId,
      {
        productId,
        locationId,
        txType,
        qty,
        refNo: strOrNull(fd, "refNo"),
        operator: userName || "（未設定）",
        note: strOrNull(fd, "note"),
        partnerName: strOrNull(fd, "supplier"),
      },
      allowNegative,
    );
    revalidatePath("/stock");
    revalidatePath("/records");
    revalidatePath("/");
    return {
      ok: true,
      message: txType === "issue" ? `払い出しました。残り ${qtyAfter}` : `入庫しました。現在庫 ${qtyAfter}`,
    };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "記録に失敗しました" };
  }
}

/** 副資材の職場間移動: 現在の職場の既定置き場 → 移動先職場の既定置き場へ。 */
export async function supplyMoveAction(fd: FormData): Promise<ActionResult> {
  const { companyId, userName } = await requireEntitledSession();
  const productId = str(fd, "productId");
  const destWorkplaceId = str(fd, "destWorkplaceId");
  const qty = intOrNull(fd, "qty");
  if (!productId || !destWorkplaceId) return { ok: false, message: "品目と移動先の職場を選んでください" };
  if (qty == null || qty <= 0) return { ok: false, message: "数量を正しく入力してください" };

  const wp = await resolveCurrentWorkplace(companyId);
  if (!wp) return { ok: false, message: "職場が未登録です。先に工場・職場を登録してください。" };
  if (destWorkplaceId === wp.id) return { ok: false, message: "移動先が現在の職場と同じです" };
  const dest = await getWorkplace(companyId, destWorkplaceId);
  if (!dest) return { ok: false, message: "移動先の職場が見つかりません" };
  // 移動元・移動先とも所属工場の中に限る
  try {
    await assertCurrentWorkplaceOperable(companyId);
    await assertWorkplaceOperable(companyId, destWorkplaceId);
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "移動先が範囲外です" };
  }

  const fromLoc = await ensureDefaultLocation(companyId, wp.siteId, wp.id);
  const toLoc = await ensureDefaultLocation(companyId, dest.siteId, dest.id);
  try {
    const allowNegative = await getAllowNegative(companyId);
    await moveStock(
      companyId,
      { productId, fromLocationId: fromLoc, toLocationId: toLoc, qty, refNo: null, operator: userName || "（未設定）", note: `${wp.name}→${dest.name}`, partnerName: dest.name },
      allowNegative,
    );
    revalidatePath("/stock");
    revalidatePath("/records");
    revalidatePath("/");
    return { ok: true, message: `${dest.siteName}／${dest.name} へ ${qty} 移動しました` };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "移動に失敗しました" };
  }
}

/** 副資材の在庫調整: 現在の職場の実在庫を、数えた数（目標値）に合わせる。 */
export async function supplyAdjustAction(fd: FormData): Promise<ActionResult> {
  const { companyId, userName } = await requireEntitledSession();
  const productId = str(fd, "productId");
  const targetQty = intOrNull(fd, "targetQty");
  if (!productId) return { ok: false, message: "品目を選んでください" };
  if (targetQty == null || targetQty < 0) return { ok: false, message: "実在庫数を正しく入力してください" };

  const locationId = await currentWorkplaceLocationId(companyId);
  if (!locationId) return { ok: false, message: "職場が未登録です。先に工場・職場を登録してください。" };

  try {
    await assertCurrentWorkplaceOperable(companyId);
    const cur = await getStockCell(companyId, productId, locationId);
    const delta = targetQty - (cur?.qty ?? 0);
    if (delta === 0) return { ok: true, message: "在庫は既に一致しています（変更なし）" };
    const { qtyAfter } = await applyMovement(
      companyId,
      { productId, locationId, txType: "adjust", qty: delta, refNo: null, operator: userName || "（未設定）", note: "棚卸調整" },
      true, // 調整はマイナスも許容（実在庫合わせ）
    );
    revalidatePath("/stock");
    revalidatePath("/records");
    revalidatePath("/");
    return { ok: true, message: `在庫を ${qtyAfter} に調整しました（${delta >= 0 ? "+" : ""}${delta}）` };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "調整に失敗しました" };
  }
}

// ===== ユーザー管理 =====
// アカウントの発行・削除はポータル（/api/provision）へ移行済み。アプリ内では
// 作業者（workers。/api/workers）だけを管理し、記録入力時に名前を選択してもらう。
