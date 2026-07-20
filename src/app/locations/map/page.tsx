import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { resolveCurrentWorkplace } from "@/lib/workplace";
import { getWorkplace, listAreaPins, listWorkplaceAreas } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import DbErrorState from "@/components/DbErrorState";
import NoWorkplaceState from "@/components/NoWorkplaceState";
import MasterTabs from "@/components/MasterTabs";
import AreaMap from "@/components/AreaMap";

export const dynamic = "force-dynamic";

/** エリアマップ: 現在の職場の見取り図＋エリアの位置ピン。 */
export default async function LocationsMapPage() {
  const session = await requireAdminPage();
  const wp = await resolveCurrentWorkplace(session.companyId);
  if (!wp) {
    return (
      <div className="p-4 sm:p-6">
        <MasterTabs />
        <PageHeader title="エリアマップ" />
        <NoWorkplaceState />
      </div>
    );
  }

  let full, pins, areas;
  try {
    [full, pins, areas] = await Promise.all([
      getWorkplace(session.companyId, wp.id),
      listAreaPins(session.companyId, wp.id),
      listWorkplaceAreas(session.companyId, wp.id),
    ]);
  } catch (e) {
    console.error("[locations/map]", e);
    return (
      <div className="p-4 sm:p-6">
        <MasterTabs />
        <PageHeader title="エリアマップ" />
        <DbErrorState />
      </div>
    );
  }

  const label = `${wp.siteName}／${wp.name}`;
  return (
    <div className="p-4 sm:p-6">
      <MasterTabs />
      <div className="mb-3">
        <Link href="/locations" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> ロケーション一覧に戻る
        </Link>
      </div>
      <PageHeader
        title="エリアマップ"
        description="職場の見取り図の上に、エリア（ロケ番号の先頭記号 A・B…）の場所を表示します。見取り図をアップロードし、各エリアのピンを配置してください。"
      />
      <AreaMap
        workplaceId={wp.id}
        workplaceLabel={label}
        mapUrl={full?.mapImageUrl ?? null}
        areas={areas}
        pins={pins}
        canEdit
      />
    </div>
  );
}
