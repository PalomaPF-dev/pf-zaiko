"use client";

import { useState } from "react";

/** シンプルなタブ切替（クライアント状態のみ）。 */
export default function Tabs({
  tabs,
  initial = 0,
}: {
  tabs: Array<{ label: React.ReactNode; content: React.ReactNode }>;
  initial?: number;
}) {
  const [active, setActive] = useState(initial);
  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {tabs.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              active === i
                ? "border-fuchsia-600 text-fuchsia-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={i} className={active === i ? "" : "hidden"}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
