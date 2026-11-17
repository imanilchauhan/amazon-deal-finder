"use client";
/* eslint-disable @next/next/no-img-element -- Amazon product images are linked, not proxied */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Deal } from "@/lib/deals";
import { money } from "@/lib/format";
import s from "./ui.module.css";

/** Counts from ~60% of the price up to the price, once, unless the visitor prefers reduced motion. */
function useCountUp(target: number, key: string) {
  const [value, setValue] = useState(target);
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opt in to the animation after hydration
    setAnimate(true);
    const start = performance.now();
    const from = target * 1.6;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, key]);
  return Math.round(animate ? value : target);
}

export function QuickView({ deal, onClose }: { deal: Deal | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const price = useCountUp(deal?.price ?? 0, deal?.asin ?? "");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (deal && !el.open) el.showModal();
    if (!deal && el.open) el.close();
  }, [deal]);

  return (
    <dialog
      ref={ref}
      className={s.qv}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
      aria-label={deal ? `Quick view: ${deal.shortTitle}` : "Quick view"}
    >
      {deal && (
        <div className={s.qvBody}>
          <button type="button" className={s.qvClose} onClick={onClose} aria-label="Close quick view">
            ×
          </button>
          <div className={s.qvMedia}>
            <span className={s.badge}>-{deal.discountPct}%</span>
            <img src={deal.imageUrl} alt={deal.shortTitle} width={420} height={420} />
          </div>
          <div className={s.qvInfo}>
            {deal.brand && <p className={s.brandTag}>{deal.brand}</p>}
            <h2>{deal.shortTitle}</h2>
            <p className={s.qvPrice}>
              {money(price, deal.currency)}
              <s>{money(deal.originalPrice, deal.currency)}</s>
            </p>
            <p className={s.save}>You save {money(deal.savings, deal.currency)}</p>
            {/* No affiliate link inside the overlay: Amazon bans Special Links in pop-ups and layers. */}
            <Link className={s.buy} href={`/deals/${deal.slug}`}>
              See deal details
            </Link>
          </div>
        </div>
      )}
    </dialog>
  );
}
