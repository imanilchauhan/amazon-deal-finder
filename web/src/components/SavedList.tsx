"use client";
/* eslint-disable @next/next/no-img-element -- Amazon product images are linked, not proxied */
import Link from "next/link";
import { useEffect, useState } from "react";
import { money } from "@/lib/format";
import { type SavedDeal, onSavedChange, readSaved, toggleSaved } from "@/lib/saved";
import s from "./ui.module.css";

export function SavedList() {
  const [list, setList] = useState<SavedDeal[] | null>(null);
  useEffect(() => {
    const sync = () => setList(readSaved());
    sync();
    return onSavedChange(sync);
  }, []);
  return (
    <section className={s.savedPage}>
      <h1>Saved deals</h1>
      <p className={s.muted}>
        Saved on this device only. Prices change fast on Amazon, so open a deal to see today&apos;s price.
      </p>
      {list && !list.length && (
        <p className={s.empty}>
          Nothing saved yet. Tap the heart on any deal to keep it here. <Link href="/deals">Browse deals →</Link>
        </p>
      )}
      <ul className={s.savedList}>
        {(list ?? []).map((d) => (
          <li key={d.asin}>
            <img src={d.imageUrl} alt="" width={72} height={72} loading="lazy" />
            <div>
              <Link href={`/deals/${d.slug}`}>{d.title}</Link>
              <span className={s.muted}>
                {money(d.price, d.currency)} when saved · {new Date(d.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            </div>
            <button type="button" className={s.linkBtn} onClick={() => toggleSaved(d)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
