"use client";

import { useEffect, useState } from "react";
import type { Deal } from "@/lib/deal-model";
import { onSavedChange, readSaved, toggleSaved } from "@/lib/saved";
import s from "./ui.module.css";

export function SaveButton({ deal, className }: { deal: Deal; className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(readSaved().some((x) => x.asin === deal.asin));
    sync();
    return onSavedChange(sync);
  }, [deal.asin]);
  return (
    <button
      type="button"
      className={className ?? s.save_}
      aria-pressed={on}
      aria-label={on ? `Remove ${deal.shortTitle} from saved` : `Save ${deal.shortTitle} for later`}
      onClick={() =>
        setOn(
          toggleSaved({
            asin: deal.asin,
            slug: deal.slug,
            title: deal.shortTitle,
            imageUrl: deal.imageUrl,
            price: deal.price,
            currency: deal.currency,
            url: deal.url,
          }),
        )
      }
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z" />
      </svg>
    </button>
  );
}
