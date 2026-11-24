"use client";

import { useEffect, useMemo, useState } from "react";
import type { Deal } from "@/lib/deals";
import { titleMatches } from "@/lib/ask";
import { withoutVariants } from "@/lib/variants";
import { money } from "@/lib/format";
import { DealCard } from "./DealCard";
import { QuickView } from "./QuickView";
import s from "./ui.module.css";

type Sort = "discount" | "savings" | "low" | "high" | "new";
const SORTS: Record<Sort, { label: string; fn: (a: Deal, b: Deal) => number }> = {
  discount: { label: "Biggest discount", fn: (a, b) => b.discountPct - a.discountPct },
  savings: { label: "Most savings", fn: (a, b) => b.savings - a.savings },
  low: { label: "Price: low to high", fn: (a, b) => a.price - b.price },
  high: { label: "Price: high to low", fn: (a, b) => b.price - a.price },
  new: { label: "Newest", fn: (a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt) },
};
const PRICE_BANDS = [
  { id: "u500", label: "Under ₹500", min: 0, max: 500 },
  { id: "500-1000", label: "₹500 – ₹1,000", min: 500, max: 1000 },
  { id: "1000-5000", label: "₹1,000 – ₹5,000", min: 1000, max: 5000 },
  { id: "5000+", label: "Over ₹5,000", min: 5000, max: Infinity },
];
const DISCOUNTS = [0, 30, 50, 70];
const GENDERS = [
  { id: "men", label: "Men" },
  { id: "women", label: "Women" },
  { id: "kids", label: "Kids" },
];

type State = {
  cats: string[];
  bands: string[];
  minOff: number;
  brands: string[];
  genders: string[];
  sort: Sort;
  q: string;
  /** price range from an "Ask CartCrush" question ("under ₹1,000") */
  max: number;
  min: number;
  /** the question itself, shown above the results */
  ask: string;
};
const EMPTY: State = { cats: [], bands: [], minOff: 0, brands: [], genders: [], sort: "discount", q: "", max: 0, min: 0, ask: "" };

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

function fromUrl(): State {
  const p = new URLSearchParams(window.location.search);
  const sort = p.get("sort") as Sort | null;
  return {
    cats: list(p.get("cat")),
    bands: list(p.get("price")),
    minOff: Number(p.get("off") ?? 0) || 0,
    brands: list(p.get("brand")),
    genders: list(p.get("for")),
    sort: sort && sort in SORTS ? sort : "discount",
    q: p.get("q") ?? "",
    max: Number(p.get("max") ?? 0) || 0,
    min: Number(p.get("min") ?? 0) || 0,
    ask: p.get("ask") ?? "",
  };
}

function toUrl(st: State): string {
  const p = new URLSearchParams();
  if (st.cats.length) p.set("cat", st.cats.join(","));
  if (st.bands.length) p.set("price", st.bands.join(","));
  if (st.minOff) p.set("off", String(st.minOff));
  if (st.brands.length) p.set("brand", st.brands.join(","));
  if (st.genders.length) p.set("for", st.genders.join(","));
  if (st.sort !== "discount") p.set("sort", st.sort);
  if (st.q) p.set("q", st.q);
  if (st.max) p.set("max", String(st.max));
  if (st.min) p.set("min", String(st.min));
  if (st.ask) p.set("ask", st.ask);
  const qs = p.toString();
  return window.location.pathname + (qs ? `?${qs}` : "");
}

const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function Catalog({ deals, categories }: { deals: Deal[]; categories?: { slug: string; name: string }[] }) {
  const [st, setSt] = useState<State>(EMPTY);
  const [sheet, setSheet] = useState(false);
  const [quick, setQuick] = useState<Deal | null>(null);

  // Filters live in the URL so a filtered view can be shared; read it once on the client.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialise from the URL after hydration
    setSt(fromUrl());
  }, []);
  const update = (patch: Partial<State>) => {
    const next = { ...st, ...patch };
    setSt(next);
    window.history.replaceState(null, "", toUrl(next));
  };

  const brandCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deals) if (d.brand) m.set(d.brand, (m.get(d.brand) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [deals]);
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deals) m.set(d.category, (m.get(d.category) ?? 0) + 1);
    return m;
  }, [deals]);

  const visible = useMemo(() => {
    const words = st.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const bands = PRICE_BANDS.filter((b) => st.bands.includes(b.id));
    const list = deals
      .filter(
        (d) =>
          (!st.cats.length || st.cats.includes(d.category)) &&
          (!bands.length || bands.some((b) => d.price >= b.min && d.price < b.max)) &&
          d.discountPct >= st.minOff &&
          (!st.brands.length || st.brands.includes(d.brand)) &&
          (!st.genders.length || st.genders.includes(d.gender)) &&
          (!st.max || d.price <= st.max) &&
          (!st.min || d.price >= st.min) &&
          (!words.length || titleMatches(d.title, words)),
      )
      .sort(SORTS[st.sort].fn);
    return withoutVariants(list);
  }, [deals, st]);

  const activeCount =
    st.cats.length + st.bands.length + st.brands.length + st.genders.length + (st.minOff ? 1 : 0) + (st.q ? 1 : 0) + (st.max || st.min ? 1 : 0);
  const clear = () => update({ ...EMPTY, sort: st.sort });
  const visibleCats = categories?.filter((c) => catCounts.get(c.slug));

  const panel = (
    <div className={s.filters}>
      {visibleCats && visibleCats.length > 1 && (
        <fieldset>
          <legend>Category</legend>
          {visibleCats.map((c) => (
            <label key={c.slug} className={s.check}>
              <input type="checkbox" checked={st.cats.includes(c.slug)} onChange={() => update({ cats: toggle(st.cats, c.slug) })} />
              <span>{c.name}</span>
              <small>{catCounts.get(c.slug)}</small>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>Price</legend>
        {PRICE_BANDS.map((b) => (
          <label key={b.id} className={s.check}>
            <input type="checkbox" checked={st.bands.includes(b.id)} onChange={() => update({ bands: toggle(st.bands, b.id) })} />
            <span>{b.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Discount</legend>
        <div className={s.chips}>
          {DISCOUNTS.map((n) => (
            <button key={n} type="button" className={s.chip} aria-pressed={st.minOff === n} onClick={() => update({ minOff: n })}>
              {n ? `${n}%+` : "Any"}
            </button>
          ))}
        </div>
      </fieldset>
      {brandCounts.length > 1 && (
        <fieldset>
          <legend>Brand</legend>
          {brandCounts.map(([b, n]) => (
            <label key={b} className={s.check}>
              <input type="checkbox" checked={st.brands.includes(b)} onChange={() => update({ brands: toggle(st.brands, b) })} />
              <span>{b}</span>
              <small>{n}</small>
            </label>
          ))}
        </fieldset>
      )}
      {deals.some((d) => d.gender) && (
        <fieldset>
          <legend>For</legend>
          <div className={s.chips}>
            {GENDERS.map((g) => (
              <button key={g.id} type="button" className={s.chip} aria-pressed={st.genders.includes(g.id)} onClick={() => update({ genders: toggle(st.genders, g.id) })}>
                {g.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );

  return (
    <div className={s.catalog}>
      <aside className={s.sidebar} aria-label="Filters">
        <div className={s.sideHead}>
          <h2>Filters</h2>
          {activeCount > 0 && (
            <button type="button" className={s.linkBtn} onClick={clear}>
              Clear all
            </button>
          )}
        </div>
        {panel}
      </aside>

      <section aria-label="Deals">
        <div className={s.toolbar}>
          <input
            type="search"
            className={s.search}
            placeholder="Search these deals"
            aria-label="Search these deals"
            value={st.q}
            onChange={(e) => update({ q: e.target.value, ask: "" })}
          />
          <button type="button" className={s.filterBtn} onClick={() => setSheet(true)}>
            Filters{activeCount ? ` (${activeCount})` : ""}
          </button>
          <label className={s.sort}>
            <span>Sort</span>
            <select value={st.sort} onChange={(e) => update({ sort: e.target.value as Sort })}>
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {st.ask && (
          <p className={s.askNote}>
            Deals for <b>&ldquo;{st.ask}&rdquo;</b>
            {st.max ? ` · up to ${money(st.max, "INR")}` : ""}
            {st.min ? ` · from ${money(st.min, "INR")}` : ""}
            {st.genders.length ? ` · for ${st.genders.join(", ")}` : ""}
          </p>
        )}
        <p className={s.count} aria-live="polite">
          {visible.length} deal{visible.length === 1 ? "" : "s"}
          {activeCount > 0 && (
            <button type="button" className={s.linkBtn} onClick={clear}>
              Clear filters
            </button>
          )}
        </p>
        {visible.length ? (
          // key forces the entrance animation to replay when the result set changes
          <div className={s.grid} key={`${st.sort}|${visible.length}|${activeCount}`}>
            {visible.map((d, i) => (
              <DealCard key={d.asin} deal={d} priority={i < 4} index={i} onQuickView={setQuick} />
            ))}
          </div>
        ) : (
          <div className={s.empty}>
            <p>No deals match these filters{st.bands.length ? ` (${st.bands.map((b) => PRICE_BANDS.find((x) => x.id === b)?.label).join(", ")})` : ""}.</p>
            <button type="button" className={s.buy} onClick={clear}>
              Clear filters
            </button>
            <p className={s.muted}>
              Cheapest here is {deals.length ? money(Math.min(...deals.map((d) => d.price)), deals[0].currency) : "n/a"}. New deals are added every few hours.
            </p>
          </div>
        )}
      </section>

      {sheet && (
        <div className={s.sheetWrap} role="dialog" aria-modal="true" aria-label="Filters">
          <button type="button" className={s.sheetBackdrop} aria-label="Close filters" onClick={() => setSheet(false)} />
          <div className={s.sheet}>
            <div className={s.sideHead}>
              <h2>Filters</h2>
              <button type="button" className={s.linkBtn} onClick={clear}>
                Clear all
              </button>
            </div>
            {panel}
            <button type="button" className={s.buy} onClick={() => setSheet(false)}>
              Show {visible.length} deal{visible.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
      <QuickView deal={quick} onClose={() => setQuick(null)} />
    </div>
  );
}
