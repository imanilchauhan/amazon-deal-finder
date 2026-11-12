"use client";

import { useMemo, useState } from "react";
import type { Deal } from "@/lib/deals";
import { DealCard } from "./DealCard";
import s from "./ui.module.css";

const FILTERS = [
  { id: "all", label: "All deals", test: () => true },
  { id: "50", label: "50%+ off", test: (d: Deal) => d.discountPct >= 50 },
  { id: "70", label: "70%+ off", test: (d: Deal) => d.discountPct >= 70 },
  { id: "u500", label: "Under ₹500", test: (d: Deal) => d.price < 500 },
  { id: "u1000", label: "Under ₹1,000", test: (d: Deal) => d.price < 1000 },
] as const;

const SORTS = {
  discount: { label: "Biggest discount", fn: (a: Deal, b: Deal) => b.discountPct - a.discountPct },
  savings: { label: "Most savings", fn: (a: Deal, b: Deal) => b.savings - a.savings },
  low: { label: "Lowest price", fn: (a: Deal, b: Deal) => a.price - b.price },
  new: { label: "Newest", fn: (a: Deal, b: Deal) => b.firstSeenAt.localeCompare(a.firstSeenAt) },
} as const;

type SortKey = keyof typeof SORTS;

export function DealGrid({ deals, showControls = true }: { deals: Deal[]; showControls?: boolean }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [sort, setSort] = useState<SortKey>("discount");

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
    return deals.filter(f.test).sort(SORTS[sort].fn);
  }, [deals, filter, sort]);

  return (
    <>
      {showControls && (
        <div className={s.controls}>
          <div className={s.chips} role="group" aria-label="Filter deals">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={s.chip}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className={s.sort}>
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {visible.length ? (
        <div className={s.grid}>
          {visible.map((d, i) => (
            <DealCard key={d.asin} deal={d} priority={i < 4} />
          ))}
        </div>
      ) : (
        <p className={s.empty}>No deals match this filter right now. New deals are added every few hours.</p>
      )}
    </>
  );
}
