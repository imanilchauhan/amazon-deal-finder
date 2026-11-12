"use client";

import { useState } from "react";
import type { Deal } from "@/lib/deals";
import { DealCard } from "./DealCard";
import { QuickView } from "./QuickView";
import s from "./ui.module.css";

/** Plain grid of deal cards with quick view. Filtering lives in <Catalog>. */
export function DealGrid({ deals }: { deals: Deal[]; showControls?: boolean }) {
  const [quick, setQuick] = useState<Deal | null>(null);
  return (
    <>
      <div className={s.grid}>
        {deals.map((d, i) => (
          <DealCard key={d.asin} deal={d} priority={i < 4} index={i} onQuickView={setQuick} />
        ))}
      </div>
      <QuickView deal={quick} onClose={() => setQuick(null)} />
    </>
  );
}
