import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/session";
import { listScopedWorkplaces, resolveCurrentWorkplace } from "@/lib/workplace";
import { currentSiteScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * ヘッダの職場セレクタ用: 選べる職場の一覧＋現在選択中の職場ID。
 * 工場スコープが効いている場合は自工場の職場だけを返し、scope に表示用の情報を添える
 * （matched=false は「所属工場に一致する工場マスタが無い＝表示できるデータが無い」）。
 */
export async function GET() {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ workplaces: [], currentId: null, scope: null });
  try {
    const [workplaces, current, scope] = await Promise.all([
      listScopedWorkplaces(session.companyId),
      resolveCurrentWorkplace(session.companyId),
      currentSiteScope(),
    ]);
    return NextResponse.json({
      workplaces,
      currentId: current?.id ?? null,
      scope: scope ? { factory: scope.factory, matched: scope.siteId != null } : null,
    });
  } catch {
    return NextResponse.json({ workplaces: [], currentId: null, scope: null });
  }
}
