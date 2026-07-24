"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireEntitledSession, requireAdminSession, requireSession } from "./session";
import { CURRENT_WP_COOKIE, currentWorkplaceLocationId, resolveCurrentWorkplace } from "./workplace";
import {
  assertIssueOrderInScope,
  assertLocationInScope,
  assertReceiptInScope,
  assertStocktakeInScope,
  assertWorkplaceInScope,
  currentSiteScope,
  scopeSiteId,
} from "./scope";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  nextStockKey,
  createSite,
  updateSite,
  deleteSite,
  createWorkplace,
  updateWorkplace,
  deleteWorkplace,
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
  type ProductInput,
  type PartnerInput,
} from "./db";
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
 * 作業者（role='worker'）は送信値を無視して必ず本人（ログイン中のアカウント名）で記録する。
 * 管理者・一般は作業者アカウント一覧からの代理入力を優先（未選択はログイン中のアカウント名）。
 */
function resolveOperator(
  fd: FormData,
  role: "admin" | "member" | "worker",
  userName: string
): string {
  if (role === "worker") return userName || "（未設定）";
  return str(fd, "operator") || userName || "（未設定）";
}

export interface ActionResult {
  ok: boolean;
  message: string;
  receiptTxId?: string; // 入荷成功時、現品票印刷リンク用
  id?: string; // 作成/更新した対象のID（クライアント側の遷移用）
}

// ===== 商品マスタ =====

/**
 * 商品の一意制約違反(23505)を利用者向けの日本語メッセージへ変換。
 * 全画面のサーバーエラーにせず、フォーム上にインライン表示するために使う。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function productDuplicateMessage(e: any): string | null {
  const code = e?.code ?? e?.sourceError?.code;
  if (code !== "23505") return null;
  const constraint = String(e?.constraint ?? e?.sourceError?.constraint ?? "");
  if (constraint.includes("drawing_no")) {
    return "この図番は既に登録されています。別の図番にするか、既存の商品を編集してください。";
  }
  if (constraint.includes("stockkey")) {
    return "この在庫管理キーは既に登録されています。別のキーを入力してください。";
  }
  if (constraint.includes("code")) {
    return "この商品CDは既に登録されています。別の商品CDを入力してください。";
  }
  return "図番・商品CD・在庫管理キーのいずれかが既に登録されています。入力内容をご確認ください。";
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

/** 商品登録。重複などの失敗は全画面エラーにせず ActionResult で返す（フォームにインライン表示・入力値保持）。 */
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
  await deleteProduct(companyId, id);
  revalidatePath("/products");
  redirect("/products");
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
  if (!productId || !locationId) return { ok: false, message: "商品とロケーションを指定してください" };
  if (!IO_TX_TYPES.includes(txType)) return { ok: false, message: "処理区分が不正です" };
  const qtyRaw = intOrNull(fd, "qty");
  if (qtyRaw == null || (txType !== "adjust" && qtyRaw <= 0)) {
    return { ok: false, message: "数量を正しく入力してください" };
  }
  try {
    // 所属工場の外の置き場へは書き込ませない（UIで出さないが、サーバー側でも必ず防ぐ）
    await assertLocationInScope(companyId, locationId);
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
    return { ok: false, message: "商品・移動元・移動先を指定してください" };
  }
  if (qty == null || qty <= 0) return { ok: false, message: "数量を正しく入力してください" };
  try {
    await assertLocationInScope(companyId, fromLocationId);
    await assertLocationInScope(companyId, toLocationId);
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
  await assertStocktakeInScope(companyId, stocktakeId);
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
  await assertStocktakeInScope(companyId, id);
  await updateStocktakeStatus(companyId, id, "review");
  revalidatePath(`/stocktakes/${id}`);
  revalidatePath("/stocktakes");
}

export async function backToCountingAction(id: string): Promise<void> {
  const { companyId } = await requireEntitledSession();
  await assertStocktakeInScope(companyId, id);
  await updateStocktakeStatus(companyId, id, "counting");
  revalidatePath(`/stocktakes/${id}`);
}

export async function cancelStocktakeAction(id: string): Promise<void> {
  const { companyId } = await requireEntitledSession();
  await assertStocktakeInScope(companyId, id);
  await updateStocktakeStatus(companyId, id, "cancelled");
  revalidatePath(`/stocktakes/${id}`);
  revalidatePath("/stocktakes");
  redirect("/stocktakes");
}

export async function applyStocktakeAction(id: string): Promise<void> {
  const { companyId, userName } = await requireEntitledSession();
  await assertStocktakeInScope(companyId, id);
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
  await assertIssueOrderInScope(companyId, orderId);
  const productId = str(fd, "productId");
  const qty = intOrNull(fd, "qtyPlanned");
  if (!productId) throw new Error("商品を選択してください");
  if (qty == null || qty <= 0) throw new Error("出荷予定数を正しく入力してください");
  // 引当は現在の職場のロケに限定する
  const wp = await resolveCurrentWorkplace(companyId);
  const locationId = strOrNull(fd, "locationId");
  if (locationId) await assertLocationInScope(companyId, locationId);
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
  await assertIssueOrderInScope(companyId, orderId);
  await deleteIssueOrderLine(companyId, lineId);
  revalidatePath(`/issue-orders/${orderId}`);
}

/** 明細1件を出庫実行（引当ロケから指示数を出庫）。 */
export async function issueOrderLineAction(orderId: string, lineId: string): Promise<ActionResult> {
  const { companyId, userName } = await requireEntitledSession();
  try {
    await assertIssueOrderInScope(companyId, orderId);
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
    await assertIssueOrderInScope(companyId, orderId);
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
  await assertIssueOrderInScope(companyId, id);
  await updateIssueOrderStatus(companyId, id, "cancelled");
  revalidatePath("/issue-orders");
  revalidatePath(`/issue-orders/${id}`);
  redirect("/issue-orders");
}

// ===== 入荷（受入）／入庫（棚入れ） =====

/** ①入荷：受入伝票を作成（納入場所を指定）。 */
export async function createReceiptAction(fd: FormData): Promise<void> {
  const { companyId, userName } = await requireEntitledSession();
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
  await assertReceiptInScope(companyId, receiptId);
  const productId = str(fd, "productId");
  if (!productId) throw new Error("商品を選択してください");
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
  await assertReceiptInScope(companyId, receiptId);
  await deleteReceiptLine(companyId, lineId);
  revalidatePath(`/inbound/${receiptId}`);
}

/** ②入庫（棚入れ）：未入庫分をロケへ棚入れ。 */
export async function putawayAction(fd: FormData): Promise<ActionResult> {
  const { companyId, userName, role } = await requireEntitledSession();
  const productId = str(fd, "productId");
  const locationId = str(fd, "locationId");
  const qty = intOrNull(fd, "qty");
  if (!productId) return { ok: false, message: "商品を指定してください（ラベルをスキャン）" };
  if (!locationId) return { ok: false, message: "棚入れ先ロケーションを指定してください" };
  if (qty == null || qty <= 0) return { ok: false, message: "数量を正しく入力してください" };
  try {
    // 棚入れ先も、消し込む入荷も所属工場の中に限定する
    await assertLocationInScope(companyId, locationId);
    const { qtyAfter } = await putawayProduct(companyId, {
      productId,
      locationId,
      qty,
      operator: resolveOperator(fd, role, userName),
      siteId: scopeSiteId(await currentSiteScope()),
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

export async function createSiteAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const name = str(fd, "name");
  if (name) await createSite(companyId, name);
  revalidatePath("/sites");
}

export async function updateSiteAction(id: string, fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const name = str(fd, "name");
  if (name) await updateSite(companyId, id, name);
  revalidatePath("/sites");
}

export async function deleteSiteAction(id: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  await deleteSite(companyId, id);
  revalidatePath("/sites");
}

export async function createWorkplaceAction(fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const siteId = str(fd, "siteId");
  const name = str(fd, "name");
  if (siteId && name) await createWorkplace(companyId, siteId, name);
  revalidatePath("/sites");
}

export async function updateWorkplaceAction(id: string, fd: FormData): Promise<void> {
  const { companyId } = await requireAdminSession();
  const name = str(fd, "name");
  if (name) await updateWorkplace(companyId, id, name);
  revalidatePath("/sites");
}

export async function deleteWorkplaceAction(id: string): Promise<void> {
  const { companyId } = await requireAdminSession();
  await deleteWorkplace(companyId, id);
  revalidatePath("/sites");
}

/** ヘッダの職場セレクタ: 現在の職場を Cookie に保存し、全画面を再取得させる。 */
export async function setCurrentWorkplaceAction(workplaceId: string): Promise<void> {
  const { companyId } = await requireSession();
  // スコープ外の職場へは切り替えさせない（Cookie を直接書き換えても resolveCurrentWorkplace が弾く）
  await assertWorkplaceInScope(companyId, workplaceId);
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
  // 所属工場の外へは移動させない
  try {
    await assertWorkplaceInScope(companyId, destWorkplaceId);
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
