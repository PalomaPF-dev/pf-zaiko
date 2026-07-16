"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp } from "@/lib/native";

/** iOS アプリ（Capacitor webview）内では外部課金導線を見せないため別ページへ退避。 */
export default function NativeRedirect({ to = "/login" }: { to?: string }) {
  const router = useRouter();
  useEffect(() => {
    if (isNativeApp()) router.replace(to);
  }, [router, to]);
  return null;
}
