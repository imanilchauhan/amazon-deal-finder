"use client";
/* eslint-disable @next/next/no-img-element -- admin previews use Amazon image URLs directly */
import { arrayRemove, arrayUnion, doc, getDoc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { COLLECTIONS } from "@/data/collections";
import { toDeal, type Deal } from "@/lib/deal-model";
import { firebaseApp } from "@/lib/firebase";
import { money } from "@/lib/format";
import { parseAsin } from "@/lib/xshare";
import s from "./admin.module.css";

type Pick = { asin: string; deal: Deal | null };

/**
 * Hand-pick products into a collection. Picks are stored as ASINs in
 * collections/{slug}.asins; the scraper checks each pick's price (even at full price)
 * on its next run, and the site shows picks first on the collection page.
 */
export function CollectionsAdmin() {
  const [slug, setSlug] = useState(COLLECTIONS[0].slug);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [input, setInput] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setNote("");
    try {
      const db = getFirestore(firebaseApp());
      const snap = await getDoc(doc(db, "collections", slug));
      const asins = ((snap.data()?.asins as string[] | undefined) ?? []).filter((a) => typeof a === "string");
      const deals = await Promise.all(
        asins.map(async (a) => {
          const d = await getDoc(doc(db, "deals", a));
          return { asin: a, deal: d.exists() ? toDeal(d.id, d.data()) : null };
        }),
      );
      setPicks(deals);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not load the collection");
    } finally {
      setBusy(false);
    }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load picks when the collection changes
    void load();
  }, [load]);

  async function add() {
    const lines = input.split(/[\s,]+/).filter(Boolean);
    const asins = [...new Set(lines.map(parseAsin).filter((a): a is string => !!a))];
    const bad = lines.filter((l) => !parseAsin(l));
    if (!asins.length) {
      setNote("Paste Amazon product links or ASINs, one per line.");
      return;
    }
    setBusy(true);
    try {
      const db = getFirestore(firebaseApp());
      await setDoc(doc(db, "collections", slug), { asins: arrayUnion(...asins), updated_at: serverTimestamp() }, { merge: true });
      setInput("");
      setNote(
        `Added ${asins.length} product${asins.length > 1 ? "s" : ""}.` +
          (bad.length ? ` Skipped ${bad.length} line(s) that weren't Amazon product links.` : "") +
          " New picks get their price on the next check (every 15 min while your Mac is on, or the next cloud run).",
      );
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove(asin: string) {
    setBusy(true);
    try {
      const db = getFirestore(firebaseApp());
      await setDoc(doc(db, "collections", slug), { asins: arrayRemove(asin), updated_at: serverTimestamp() }, { merge: true });
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  const col = COLLECTIONS.find((c) => c.slug === slug)!;

  return (
    <section className={s.digest}>
      <div className={s.actions}>
        <label>
          <b>Collection </b>
          <select className={s.search} value={slug} onChange={(e) => setSlug(e.target.value)}>
            {COLLECTIONS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.group} · {c.h1}
              </option>
            ))}
          </select>
        </label>
        <a className={s.linkBtn} href={`/collections/${slug}`} target="_blank" rel="noopener">
          View page
        </a>
      </div>
      <p className={s.muted}>
        Your picks show first on <b>{col.h1}</b>, above the automatic sections ({col.sections.map((x) => x.heading).join(", ")}).
      </p>
      <textarea
        className={s.digestText}
        rows={4}
        placeholder={"Paste Amazon product links or ASINs, one per line\nhttps://www.amazon.in/dp/B0XXXXXXXX"}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        aria-label="Amazon links to add"
      />
      <div className={s.actions}>
        <button type="button" className={s.primary} disabled={busy || !input.trim()} onClick={add}>
          Add to collection
        </button>
        <button type="button" className={s.secondary} disabled={busy} onClick={load}>
          Refresh
        </button>
      </div>
      {note && (
        <p className={s.muted} role="status">
          {note}
        </p>
      )}
      <ul className={s.list}>
        {picks.map(({ asin, deal }) => (
          <li key={asin} className={s.item}>
            {deal ? <img src={deal.imageUrl} alt="" width={64} height={64} /> : <span className={s.muted}>{asin}</span>}
            <div className={s.itemMain}>
              <b>{deal ? deal.shortTitle : asin}</b>
              <span className={s.muted}>
                {!deal
                  ? "Waiting for its first price check"
                  : deal.active
                    ? `Live · ${money(deal.price)}${deal.discountPct > 0 ? ` · ${deal.discountPct}% off` : " · full price"}`
                    : "Hidden: no fresh price in the last 24 hours (re-checked automatically)"}
              </span>
            </div>
            <button type="button" className={s.linkBtn} disabled={busy} onClick={() => remove(asin)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      {!busy && !picks.length && <p className={s.muted}>No picks yet. The page still fills itself from the automatic sections.</p>}
    </section>
  );
}
