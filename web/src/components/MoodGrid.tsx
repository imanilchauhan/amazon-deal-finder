"use client";

import { useMemo, useState } from "react";
import type { Deal } from "@/lib/deal-model";
import { MOODS, type Mood } from "@/lib/themes";
import { DealCard } from "./DealCard";
import h from "@/app/home.module.css";

type Item = { deal: Deal; moods: Mood[] };

/** "Today's top crushes": the best deals with one-tap mood filters. */
export function MoodGrid({ items, perView = 8 }: { items: Item[]; perView?: number }) {
  const [mood, setMood] = useState<Mood | "all">("all");
  const available = useMemo(() => MOODS.filter((m) => m.id === "all" || items.some((i) => i.moods.includes(m.id as Mood))), [items]);
  const shown = useMemo(
    () => (mood === "all" ? items : items.filter((i) => i.moods.includes(mood))).slice(0, perView),
    [items, mood, perView],
  );
  return (
    <>
      <div className={h.moods} role="group" aria-label="Shop by mood">
        {available.map((m) => (
          <button key={m.id} type="button" className={h.mood} aria-pressed={mood === m.id} onClick={() => setMood(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className={h.crushGrid} key={mood}>
        {shown.map(({ deal }, i) => (
          <DealCard key={deal.asin} deal={deal} index={i} priority={i < 4} />
        ))}
      </div>
    </>
  );
}
