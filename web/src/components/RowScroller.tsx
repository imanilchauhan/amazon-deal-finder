"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./ui.module.css";

/** Sideways card row with prev/next arrows (desktop) and a fade on any edge with more cards. */
export function RowScroller({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.85, 240), behavior: "smooth" });
  };

  return (
    <div className={s.rowWrap} data-more-left={edges.left} data-more-right={edges.right}>
      {edges.left && (
        <button type="button" className={`${s.rowArrow} ${s.rowPrev}`} onClick={() => page(-1)} aria-label={`Previous ${label}`}>
          ‹
        </button>
      )}
      <div ref={ref} className={s.row} role="list" aria-label={label}>
        {children}
      </div>
      {edges.right && (
        <button type="button" className={`${s.rowArrow} ${s.rowNext}`} onClick={() => page(1)} aria-label={`More ${label}`}>
          ›
        </button>
      )}
    </div>
  );
}
