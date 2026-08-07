import { NextResponse } from "next/server";
import { getSessionWithRole } from "@/lib/session";
import { getItemMasterByCode } from "@/lib/db";
import { ensureItemMasterSeeded } from "@/lib/itemMasterSeed";
import { itemUnitLabel, normalizeItemCode } from "@/lib/itemCode";

export const dynamic = "force-dynamic";

/**
 * 品目コードで品目マスタを1件引く（商品登録フォームの「呼び出す」用）。
 * ハイフン付き・桁落ちの入力も normalizeItemCode で吸収する。
 */
export async function GET(req: Request) {
  const session = await getSessionWithRole();
  if (!session) return NextResponse.json({ ok: false, message: "ログインが必要です" }, { status: 401 });

  const raw = (new URL(req.url).searchParams.get("code") ?? "").trim();
  if (!raw) return NextResponse.json({ ok: false, message: "品目コードを入力してください" }, { status: 400 });

  const code = normalizeItemCode(raw);
  if (!code) {
    return NextResponse.json(
      { ok: false, message: "品目コードは数字9桁（例 06-26105-00）で入力してください" },
      { status: 400 }
    );
  }

  try {
    // 初回の取込は管理者の操作でだけ走らせる（一般・作業者の呼び出しで重い取込を起こさない）
    if (session.role === "admin") await ensureItemMasterSeeded(session.companyId);
    const item = await getItemMasterByCode(session.companyId, code);
    if (!item) {
      return NextResponse.json(
        { ok: false, message: `品目コード ${code} は品目マスタにありません` },
        { status: 404 }
      );
    }
    return NextResponse.json({
      ok: true,
      item: { ...item, unitLabel: itemUnitLabel(item.unitCode), packUnitLabel: itemUnitLabel(item.packUnitCode) },
    });
  } catch (e) {
    console.error("[items/lookup]", e);
    return NextResponse.json({ ok: false, message: "呼び出しに失敗しました" }, { status: 500 });
  }
}
