import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getOrCreateCompanyByName } from "@/lib/authDb";
import { syncPortalMasters, type PortalFactory, type PortalWorkplace } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ポータルからの工場・職場マスタ配信を受ける（内部用・UIなし）。
 * 認証はセッションではなく共有キー PF_PROVISION_KEY（未設定なら 503 で無効化）。provision と同じ方針。
 *
 * POST /api/portal-masters
 * body: {
 *   key: string,
 *   factories:  [{ code, name, sort }],
 *   workplaces: [{ code, name, factoryCode, sort }]   // factoryCode = 親工場の code
 * }
 * → { ok: true, applied: { sites, workplaces } }
 *
 * 工場・職場は portal_code で突合し、名称変更・並び順・新規追加に追従する（upsert のみ）。
 * 発行先の会社は provision と同じ固定値「株式会社パロマ」。
 */

const PROVISION_COMPANY_NAME = "株式会社パロマ";

/** タイミング安全なキー比較（長さ違いは即 false）。provision と同じ。 */
function safeKeyEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function cleanFactories(raw: unknown): PortalFactory[] {
  if (!Array.isArray(raw)) return [];
  const out: PortalFactory[] = [];
  for (const r of raw) {
    const code = String((r as { code?: unknown })?.code ?? "").trim();
    const name = String((r as { name?: unknown })?.name ?? "").trim();
    const sort = Number((r as { sort?: unknown })?.sort ?? 0) || 0;
    if (code && name) out.push({ code, name, sort });
  }
  return out;
}

function cleanWorkplaces(raw: unknown): PortalWorkplace[] {
  if (!Array.isArray(raw)) return [];
  const out: PortalWorkplace[] = [];
  for (const r of raw) {
    const code = String((r as { code?: unknown })?.code ?? "").trim();
    const name = String((r as { name?: unknown })?.name ?? "").trim();
    const factoryCode = String((r as { factoryCode?: unknown })?.factoryCode ?? "").trim();
    const sort = Number((r as { sort?: unknown })?.sort ?? 0) || 0;
    if (code && name && factoryCode) out.push({ code, name, factoryCode, sort });
  }
  return out;
}

export async function POST(req: Request) {
  const provisionKey = (process.env.PF_PROVISION_KEY || "").trim();
  if (!provisionKey) {
    return NextResponse.json({ message: "この機能は現在無効です（鍵未設定）" }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "不正なリクエストです" }, { status: 400 });
  }
  const key = typeof body.key === "string" ? body.key : "";
  if (!safeKeyEqual(key, provisionKey)) {
    return NextResponse.json({ message: "認証に失敗しました" }, { status: 401 });
  }

  const factories = cleanFactories(body.factories);
  const workplaces = cleanWorkplaces(body.workplaces);

  try {
    const companyId = await getOrCreateCompanyByName(PROVISION_COMPANY_NAME);
    const applied = await syncPortalMasters(companyId, factories, workplaces);
    return NextResponse.json({ ok: true, applied });
  } catch (e) {
    console.error("[portal-masters]", e);
    return NextResponse.json({ message: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
