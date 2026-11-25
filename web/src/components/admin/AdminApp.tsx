"use client";
/* eslint-disable @next/next/no-img-element -- admin previews use Amazon image URLs directly */
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteField,
  writeBatch,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { classify } from "@/lib/classify";
import { toDeal, type Deal } from "@/lib/deal-model";
import { firebaseApp } from "@/lib/firebase";
import { dealSlug, money } from "@/lib/format";
import { DEPARTMENTS, getDepartment } from "@/lib/taxonomy";
import { affiliateUrl, parseAsin } from "@/lib/xshare";
import { PLATFORMS, ShareKit, type PlatformId } from "./ShareKit";
import { WhatsAppDigest } from "./WhatsAppDigest";
import { CollectionsAdmin } from "./CollectionsAdmin";
import s from "./admin.module.css";

// The owner's Firebase user ID (not personal: it reveals nothing). Firestore rules check the same ID.
const OWNER_UID = process.env.NEXT_PUBLIC_ADMIN_UID || "1SFNbV75lgdxOFg1qY248oa5m9Z2";
const DAY = 24 * 60 * 60 * 1000;
const PAGE = 30;
const SHORT: Record<string, string> = { x: "X", facebook: "FB", instagram: "IG", whatsapp: "WA" };

function useAuth() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(getAuth(firebaseApp()), setUser), []);
  return user;
}

function millis(v: unknown): number {
  if (v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: unknown }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "string") return Date.parse(v) || 0;
  return 0;
}

function ago(ms: number): string {
  if (!ms) return "–";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export function AdminApp() {
  const user = useAuth();
  const [loginError, setLoginError] = useState("");

  if (user === undefined) return <p className={s.muted} style={{ padding: "48px 0", textAlign: "center" }}>Loading…</p>;

  if (!user) {
    return (
      <section className={`${s.card} ${s.signin}`}>
        <h1>CartCrush studio</h1>
        <p className={s.muted}>Sign in with the owner Google account to add products, post deals and curate collections.</p>
        <button
          type="button"
          className={s.primary}
          onClick={async () => {
            setLoginError("");
            try {
              await signInWithPopup(getAuth(firebaseApp()), new GoogleAuthProvider());
            } catch (e) {
              setLoginError(e instanceof Error ? e.message : "Sign-in failed");
            }
          }}
        >
          Sign in with Google
        </button>
        {loginError && <p className={s.error}>{loginError}</p>}
      </section>
    );
  }

  if (user.uid !== OWNER_UID || !user.emailVerified) {
    return (
      <section className={`${s.card} ${s.signin}`}>
        <h1>Not authorised</h1>
        <p className={s.muted}>{user.email} is not the owner account.</p>
        <button type="button" className={s.secondary} onClick={() => signOut(getAuth(firebaseApp()))}>
          Sign out
        </button>
      </section>
    );
  }

  return <Studio user={user} />;
}

/* -------------------------------- studio -------------------------------- */

type Row = Deal & { source: string; postedAt: number };
type Tab = "library" | "add" | "collections";

function Studio({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>("library");
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    setLoadedAt(Date.now());
    try {
      const db = getFirestore(firebaseApp());
      const snap = await getDocs(query(collection(db, "deals"), orderBy("first_seen_at", "desc"), limit(500)));
      setRows(
        snap.docs.map((d) => {
          const data = d.data();
          const posted = (data.posted as Record<string, { at?: unknown } | undefined>) ?? {};
          const postedAt = Math.max(0, ...Object.values(posted).map((p) => millis(p?.at)));
          return { ...toDeal(d.id, data), source: String(data.source ?? "scraper"), postedAt };
        }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load products");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const now = loadedAt;
    const live = rows.filter((r) => r.active);
    return {
      live: live.length,
      toPost: live.filter((r) => !r.postedOn.length).length,
      posted24: rows.filter((r) => r.postedAt > now - DAY).length,
      lastCheck: Math.max(0, ...rows.map((r) => Date.parse(r.checkedAt) || 0)),
    };
  }, [rows, loadedAt]);

  const initial = (user.displayName || user.email || "?").trim()[0]?.toUpperCase();

  return (
    <div className={s.wrap}>
      <header className={s.top}>
        <div className={s.titleBlock}>
          <h1>Studio</h1>
          <p>Add products, post deals and curate collections.</p>
        </div>
        <div className={s.tabs} role="tablist" aria-label="Sections">
          {(
            [
              ["library", "Library"],
              ["add", "Add product"],
              ["collections", "Collections"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className={s.who}>
          <span className={s.avatar} aria-hidden>
            {initial}
          </span>
          <button type="button" className={s.linkBtn} onClick={() => signOut(getAuth(firebaseApp()))}>
            Sign out
          </button>
        </div>
      </header>

      <div className={s.kpis}>
        <div className={s.kpi}>
          <span>Live deals</span>
          <b>{loading ? "…" : stats.live}</b>
          <small>of the newest {rows.length}</small>
        </div>
        <div className={`${s.kpi} ${s.kpiAccent}`}>
          <span>Not posted yet</span>
          <b>{loading ? "…" : stats.toPost}</b>
          <small>live, on no channel</small>
        </div>
        <div className={s.kpi}>
          <span>Posted in 24 h</span>
          <b>{loading ? "…" : stats.posted24}</b>
          <small>auto + manual</small>
        </div>
        <div className={s.kpi}>
          <span>Last price check</span>
          <b style={{ fontSize: 20 }}>{loading ? "…" : ago(stats.lastCheck)}</b>
          <small>Mac + cloud runners</small>
        </div>
      </div>

      {err && <p className={s.error}>{err}</p>}
      {tab === "library" && <Library rows={rows} loading={loading} reload={load} setErr={setErr} />}
      {tab === "add" && (
        <AddProduct
          onSaved={() => {
            void load();
            setTab("library");
          }}
        />
      )}
      {tab === "collections" && <CollectionsAdmin />}
    </div>
  );
}

/* ------------------------------ add product ------------------------------ */

function AddProduct({ onSaved }: { onSaved: () => void }) {
  const [input, setInput] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [image, setImage] = useState("");
  const [dep, setDep] = useState("uncategorised");
  const [cat, setCat] = useState("uncategorised");
  const [brand, setBrand] = useState("");
  const [gender, setGender] = useState("");
  const [touchedCat, setTouchedCat] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const asin = parseAsin(input);
  const link = asin ? affiliateUrl(asin) : "";
  const p = Number(price);
  const m = Number(mrp);
  const pct = m > p && p > 0 ? Math.round(((m - p) / m) * 100) : 0;

  // Suggest category / brand / gender from the title until the owner picks one by hand.
  useEffect(() => {
    if (!title.trim()) return;
    const c = classify(title);
    if (!touchedCat) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived suggestion, overridable
      setDep(c.department);
      setCat(c.category);
    }
    setBrand((b) => b || (c.brand ?? ""));
    setGender((g) => g || (c.gender ?? ""));
  }, [title, touchedCat]);

  const problems = useMemo(() => {
    const out: string[] = [];
    if (!asin) out.push("Paste an amazon.in product link (…/dp/XXXXXXXXXX) or a 10-character ASIN.");
    if (title.trim().length < 3) out.push("Add the product title.");
    if (!(p > 0)) out.push("Add the current price.");
    if (!(m > p)) out.push("MRP must be higher than the price.");
    if (pct > 95) out.push("Discount above 95% looks wrong.");
    if (!/^https:\/\//.test(image.trim())) out.push("Image URL must start with https://");
    return out;
  }, [asin, title, p, m, pct, image]);

  async function save() {
    if (problems.length || !asin) return;
    setBusy(true);
    setMsg("");
    try {
      const db = getFirestore(firebaseApp());
      const ref = doc(db, "deals", asin);
      const existing = await getDoc(ref);
      const d = getDepartment(dep);
      await setDoc(
        ref,
        {
          asin,
          title: title.trim(),
          price: p,
          original_price: m,
          discount_pct: pct,
          currency: "INR",
          image_url: image.trim(),
          url: link,
          marketplace: "in",
          scraped_at: new Date().toISOString(),
          active: true,
          updated_at: serverTimestamp(),
          ...(existing.exists() ? {} : { first_seen_at: serverTimestamp(), posted: {}, x_status: "unposted" }),
          source: "manual",
          department: dep,
          category: cat,
          category_path: [dep, cat],
          category_source: "manual",
          category_confidence: 1,
          brand: brand.trim() || null,
          gender: gender || null,
        },
        { merge: true },
      );
      setMsg(`Saved ${d ? d.name : dep} › ${cat}. ${existing.exists() ? "Updated the existing product." : "New product added."}`);
      setInput("");
      setTitle("");
      setPrice("");
      setMrp("");
      setImage("");
      setBrand("");
      setGender("");
      setTouchedCat(false);
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const cats = getDepartment(dep)?.categories ?? [];
  const depName = getDepartment(dep)?.name ?? "Uncategorised";
  const catName = cats.find((c) => c.slug === cat)?.name ?? cat;
  const started = !!(title || price || mrp || image || input);

  return (
    <div className={s.addGrid}>
      <section className={s.card}>
        <h2>Add a product</h2>
        <p className={s.hint}>Use this for a deal the scraper missed. It goes live on the site on the next rebuild.</p>

        <p className={s.section}>Product</p>
        <label className={s.field}>
          <span>Amazon.in link or ASIN</span>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://www.amazon.in/dp/B0XXXXXXXX" />
        </label>
        {asin ? (
          <div className={s.linkBox}>
            <code title={link}>{link}</code>
            <button
              type="button"
              className={`${s.secondary} ${s.small}`}
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy affiliate link"}
            </button>
          </div>
        ) : (
          input.trim() && (
            <p className={s.hint}>Short links (amzn.in / amzn.to) can&apos;t be read here. Open the link and paste the full amazon.in/dp/… address.</p>
          )
        )}
        <label className={s.field}>
          <span>Title (as on Amazon)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className={s.field}>
          <span>Image URL</span>
          <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="Right-click the product image on Amazon → Copy image address" />
        </label>

        <p className={s.section}>Price</p>
        <div className={s.row}>
          <label className={s.field}>
            <span>Deal price ₹</span>
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className={s.field}>
            <span>MRP ₹</span>
            <input inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value)} />
          </label>
          <div className={s.field}>
            <span>Discount</span>
            <output className={s.out}>{pct ? `${pct}% off` : "–"}</output>
          </div>
        </div>

        <p className={s.section}>Where it shows</p>
        <div className={s.row}>
          <label className={s.field}>
            <span>Department</span>
            <select
              value={dep}
              onChange={(e) => {
                setTouchedCat(true);
                setDep(e.target.value);
                setCat(getDepartment(e.target.value)?.categories[0]?.slug ?? "uncategorised");
              }}
            >
              <option value="uncategorised">Uncategorised</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.icon} {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            <span>Category</span>
            <select
              value={cat}
              onChange={(e) => {
                setTouchedCat(true);
                setCat(e.target.value);
              }}
            >
              {dep === "uncategorised" ? (
                <option value="uncategorised">Uncategorised</option>
              ) : (
                cats.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
        <div className={s.row}>
          <label className={s.field}>
            <span>Brand</span>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </label>
          <label className={s.field}>
            <span>For</span>
            <select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Anyone</option>
              <option value="men">Men</option>
              <option value="women">Women</option>
              <option value="kids">Kids</option>
            </select>
          </label>
        </div>

        {problems.length > 0 && started && (
          <ul className={s.problems}>
            {problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        <div className={s.actions}>
          <button type="button" className={s.primary} disabled={busy || problems.length > 0} onClick={save}>
            {busy ? "Saving…" : "Save product"}
          </button>
          {msg && <span className={s.muted}>{msg}</span>}
        </div>
      </section>

      <aside className={`${s.card} ${s.preview}`} aria-label="Preview">
        <p className={s.section} style={{ margin: 0 }}>
          Preview
        </p>
        <div className={s.previewMedia}>
          {/^https:\/\//.test(image.trim()) ? <img src={image.trim()} alt="" /> : <span>Image appears here</span>}
        </div>
        <div className={s.previewTitle}>{title.trim() || "Product title"}</div>
        <div className={s.priceLine}>
          <b>{p > 0 ? money(p) : "₹–"}</b>
          {m > p && p > 0 && <s>{money(m)}</s>}
          {pct > 0 && <span className={s.off}>{pct}% off</span>}
        </div>
        <div className={s.meta}>
          <span className={s.tag}>{depName}</span>
          {dep !== "uncategorised" && <span className={s.tag}>{catName}</span>}
          {brand.trim() && <span className={s.tag}>{brand.trim()}</span>}
        </div>
      </aside>
    </div>
  );
}

/* -------------------------------- library -------------------------------- */

type Filter = "unposted" | "posted" | "hidden" | "all";
type Sort = "new" | "discount" | "recent-post" | "price";

function Library({
  rows,
  loading,
  reload,
  setErr,
}: {
  rows: Row[];
  loading: boolean;
  reload: () => Promise<void>;
  setErr: (e: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("unposted");
  const [q, setQ] = useState("");
  const [dep, setDep] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [flash, setFlash] = useState("");

  async function patch(asin: string, data: Record<string, unknown>) {
    try {
      await updateDoc(doc(getFirestore(firebaseApp()), "deals", asin), data);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function markWhatsAppSent(asins: string[]) {
    try {
      const db = getFirestore(firebaseApp());
      const batch = writeBatch(db);
      for (const asin of asins) {
        const r = rows.find((x) => x.asin === asin);
        batch.update(doc(db, "deals", asin), { "posted.whatsapp": { at: serverTimestamp(), price: r?.price ?? null, id: "digest" } });
      }
      await batch.commit();
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    }
  }

  function togglePosted(r: Row, platform: PlatformId, on: boolean) {
    return patch(r.asin, {
      [`posted.${platform}`]: on ? { at: serverTimestamp(), price: r.price, id: "manual" } : deleteField(),
      ...(platform === "x" ? { x_status: on ? "posted" : "unposted" } : {}),
    });
  }

  const counts = useMemo(
    () => ({
      unposted: rows.filter((r) => r.active && !r.postedOn.length).length,
      posted: rows.filter((r) => r.postedOn.length).length,
      hidden: rows.filter((r) => !r.active).length,
      all: rows.length,
    }),
    [rows],
  );

  const deps = useMemo(() => [...new Set(rows.map((r) => r.department))].sort(), [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        (filter === "all" ||
          (filter === "unposted" && r.active && !r.postedOn.length) ||
          (filter === "posted" && r.postedOn.length > 0) ||
          (filter === "hidden" && !r.active)) &&
        (!dep || r.department === dep) &&
        (!needle || r.title.toLowerCase().includes(needle) || r.asin.toLowerCase() === needle),
    );
    if (sort === "discount") out.sort((a, b) => b.discountPct - a.discountPct);
    if (sort === "price") out.sort((a, b) => a.price - b.price);
    if (sort === "recent-post") out.sort((a, b) => b.postedAt - a.postedAt);
    return out;
  }, [rows, filter, dep, q, sort]);

  async function copyLink(r: Row) {
    try {
      await navigator.clipboard.writeText(r.url);
      setFlash(r.asin);
      setTimeout(() => setFlash(""), 1400);
    } catch {
      setErr("Couldn't copy the link");
    }
  }

  const depLabel = (slug: string) => getDepartment(slug)?.name ?? slug;

  return (
    <section style={{ display: "grid", gap: 14 }}>
      {!loading && <WhatsAppDigest rows={rows} onMarkSent={markWhatsAppSent} />}

      <div className={s.toolbar}>
        <div className={s.tabs} role="group" aria-label="Filter by posted status">
          {(
            [
              ["unposted", "To post"],
              ["posted", "Posted"],
              ["hidden", "Hidden"],
              ["all", "All"],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              aria-pressed={filter === f}
              onClick={() => {
                setFilter(f);
                setShown(PAGE);
                if (f === "posted") setSort("recent-post");
                else if (sort === "recent-post") setSort("new");
              }}
            >
              {label}
              <span className={s.count}>{counts[f]}</span>
            </button>
          ))}
        </div>
        <input
          className={s.search}
          type="search"
          placeholder="Search title or ASIN"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setShown(PAGE);
          }}
        />
        <select className={s.select} value={dep} onChange={(e) => setDep(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {deps.map((d) => (
            <option key={d} value={d}>
              {depLabel(d)}
            </option>
          ))}
        </select>
        <select className={s.select} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="new">Newest first</option>
          <option value="discount">Biggest discount</option>
          <option value="price">Lowest price</option>
          <option value="recent-post">Recently posted</option>
        </select>
        <button type="button" className={s.secondary} onClick={() => void reload()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <ul className={s.list}>
        {list.slice(0, shown).map((r) => {
          const isOpen = open === r.asin;
          return (
            <li key={r.asin} className={`${s.item} ${isOpen ? s.itemOpen : ""}`}>
              {r.imageUrl ? <img className={s.thumb} src={r.imageUrl} alt="" width={64} height={64} loading="lazy" /> : <span className={s.thumbEmpty}>No image</span>}
              <div className={s.itemMain}>
                <span className={s.itemTitle} title={r.title}>
                  {r.title}
                </span>
                <div className={s.meta}>
                  <b>{money(r.price)}</b>
                  {r.discountPct > 0 && <span className={s.off}>{r.discountPct}% off</span>}
                  <span>
                    {depLabel(r.department)} › {r.category}
                  </span>
                  {!r.active && <span className={`${s.tag} ${s.tagWarn}`}>Hidden</span>}
                  {r.source === "manual" && <span className={s.tag}>Manual</span>}
                  {r.postedAt > 0 && <span>Posted {ago(r.postedAt)}</span>}
                </div>
              </div>
              <div className={s.itemSide}>
                <div className={s.badges} role="group" aria-label="Posted on (click to toggle)">
                  {PLATFORMS.map((p) => {
                    const on = r.postedOn.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`${s.badge} ${on ? s.badgeOn : ""}`}
                        aria-pressed={on}
                        title={`${on ? "Posted" : "Not posted"} on ${p.label}. Click to ${on ? "undo" : "mark as posted"}.`}
                        onClick={() => void togglePosted(r, p.id, !on)}
                      >
                        {SHORT[p.id]}
                      </button>
                    );
                  })}
                </div>
                <div className={s.actions}>
                  <button type="button" className={`${isOpen ? s.primary : s.secondary} ${s.small}`} onClick={() => setOpen(isOpen ? null : r.asin)} aria-expanded={isOpen}>
                    {isOpen ? "Close" : "Share"}
                  </button>
                  <button type="button" className={`${s.ghost} ${s.small}`} onClick={() => void copyLink(r)}>
                    {flash === r.asin ? "Copied" : "Link"}
                  </button>
                  <a className={`${s.ghost} ${s.small}`} href={`/deals/${dealSlug(r.title, r.asin)}`} target="_blank" rel="noopener">
                    View ↗
                  </a>
                  <button type="button" className={`${s.ghost} ${s.small}`} onClick={() => void patch(r.asin, { active: !r.active })}>
                    {r.active ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className={s.panel}>
                  <ShareKit deal={r} onTogglePosted={(platform, on) => void togglePosted(r, platform, on)} />
                </div>
              )}
            </li>
          );
        })}
        {!loading && !list.length && <li className={s.empty}>Nothing here. Try another filter or search.</li>}
        {loading && !rows.length && <li className={s.empty}>Loading products…</li>}
        {list.length > shown && (
          <li className={s.more}>
            <button type="button" className={s.secondary} onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, list.length - shown)} more · {list.length - shown} left
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}
