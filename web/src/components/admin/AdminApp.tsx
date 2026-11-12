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
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { classify } from "@/lib/classify";
import { toDeal, type Deal } from "@/lib/deal-model";
import { firebaseApp } from "@/lib/firebase";
import { dealSlug, money } from "@/lib/format";
import { DEPARTMENTS, getDepartment } from "@/lib/taxonomy";
import { affiliateUrl, buildPostText, parseAsin, xIntentUrl } from "@/lib/xshare";
import s from "./admin.module.css";

const OWNER = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "imanilchauhan3@gmail.com").toLowerCase();

function useAuth() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(getAuth(firebaseApp()), setUser), []);
  return user;
}

export function AdminApp() {
  const user = useAuth();
  const [tab, setTab] = useState<"add" | "library">("add");
  const [loginError, setLoginError] = useState("");

  if (user === undefined) return <p className={s.muted}>Loading…</p>;

  if (!user) {
    return (
      <section className={s.card}>
        <h1>CartCrush admin</h1>
        <p className={s.muted}>Sign in with the owner Google account.</p>
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

  if ((user.email ?? "").toLowerCase() !== OWNER || !user.emailVerified) {
    return (
      <section className={s.card}>
        <h1>Not authorised</h1>
        <p className={s.muted}>{user.email} is not the owner account.</p>
        <button type="button" className={s.secondary} onClick={() => signOut(getAuth(firebaseApp()))}>
          Sign out
        </button>
      </section>
    );
  }

  return (
    <div className={s.wrap}>
      <header className={s.top}>
        <h1>CartCrush admin</h1>
        <div className={s.tabs} role="tablist">
          <button role="tab" aria-selected={tab === "add"} onClick={() => setTab("add")}>
            Add product
          </button>
          <button role="tab" aria-selected={tab === "library"} onClick={() => setTab("library")}>
            Library
          </button>
        </div>
        <button type="button" className={s.linkBtn} onClick={() => signOut(getAuth(firebaseApp()))}>
          Sign out
        </button>
      </header>
      {tab === "add" ? <AddProduct onSaved={() => setTab("library")} /> : <Library />}
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

  return (
    <section className={s.card}>
      <h2>Add a product</h2>
      <label className={s.field}>
        <span>Amazon.in product link or ASIN</span>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://www.amazon.in/dp/B0XXXXXXXX" />
      </label>
      {asin ? (
        <div className={s.linkBox}>
          <code>{link}</code>
          <button
            type="button"
            className={s.secondary}
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : (
        input.trim() && <p className={s.hint}>Short links (amzn.in / amzn.to) can&apos;t be read here. Open the link and paste the full amazon.in/dp/… address.</p>
      )}

      <label className={s.field}>
        <span>Title (as on Amazon)</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className={s.row}>
        <label className={s.field}>
          <span>Price ₹</span>
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className={s.field}>
          <span>MRP ₹</span>
          <input inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value)} />
        </label>
        <div className={s.field}>
          <span>Discount</span>
          <output className={s.out}>{pct ? `${pct}%` : "–"}</output>
        </div>
      </div>
      <label className={s.field}>
        <span>Image URL (right-click the product image on Amazon → copy image address)</span>
        <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://m.media-amazon.com/images/…" />
      </label>
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
            {dep === "uncategorised" ? <option value="uncategorised">Uncategorised</option> : cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
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

      {problems.length > 0 && (title || price || mrp || image || input) && (
        <ul className={s.problems}>
          {problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <div className={s.actions}>
        <button type="button" className={s.primary} disabled={busy || problems.length > 0} onClick={save}>
          {busy ? "Saving…" : "Save to Firestore"}
        </button>
        {msg && <span className={s.muted}>{msg}</span>}
      </div>
    </section>
  );
}

/* -------------------------------- library -------------------------------- */

type Row = Deal & { source: string };

function Library() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"all" | "unposted" | "posted">("unposted");
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<string | null>(null); // asin whose X window was opened
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const db = getFirestore(firebaseApp());
      const snap = await getDocs(query(collection(db, "deals"), orderBy("first_seen_at", "desc"), limit(500)));
      setRows(snap.docs.map((d) => ({ ...toDeal(d.id, d.data()), source: String(d.data().source ?? "scraper") })));
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

  async function patch(asin: string, data: Record<string, unknown>) {
    try {
      await updateDoc(doc(getFirestore(firebaseApp()), "deals", asin), data);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    }
  }

  const shown = rows.filter(
    (r) =>
      (filter === "all" || r.xStatus === filter) &&
      (!q.trim() || r.title.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const unposted = rows.filter((r) => r.xStatus === "unposted").length;

  return (
    <section>
      <div className={s.libHead}>
        <div className={s.tabs} role="group" aria-label="Filter by posted status">
          {(["unposted", "posted", "all"] as const).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "unposted" ? `To post (${unposted})` : f === "posted" ? `Posted (${rows.length - unposted})` : `All (${rows.length})`}
            </button>
          ))}
        </div>
        <input className={s.search} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className={s.secondary} onClick={load}>
          Refresh
        </button>
      </div>
      {err && <p className={s.error}>{err}</p>}
      {loading && <p className={s.muted}>Loading…</p>}
      <ul className={s.list}>
        {shown.map((r) => {
          const text = buildPostText(r);
          return (
            <li key={r.asin} className={s.item}>
              <img src={r.imageUrl} alt="" width={64} height={64} />
              <div className={s.itemMain}>
                <b>{r.shortTitle}</b>
                <span className={s.muted}>
                  {money(r.price)} · {r.discountPct}% off · {r.department} › {r.category}
                  {!r.active && " · hidden"}
                  {r.source === "manual" && " · manual"}
                </span>
                <span className={r.xStatus === "posted" ? s.posted : s.unposted}>{r.xStatus === "posted" ? "Posted on X" : "Not posted"}</span>
              </div>
              <div className={s.itemActions}>
                <a
                  className={s.primary}
                  href={xIntentUrl(text)}
                  target="_blank"
                  rel="noopener"
                  onClick={() => setPending(r.asin)}
                >
                  Share on X
                </a>
                {pending === r.asin && r.xStatus !== "posted" && (
                  <button type="button" className={s.secondary} onClick={() => patch(r.asin, { x_status: "posted", "posted.x_manual_at": serverTimestamp() }).then(() => setPending(null))}>
                    I posted it ✓
                  </button>
                )}
                {pending !== r.asin && (
                  <button type="button" className={s.secondary} onClick={() => patch(r.asin, { x_status: r.xStatus === "posted" ? "unposted" : "posted" })}>
                    {r.xStatus === "posted" ? "Mark unposted" : "Mark posted"}
                  </button>
                )}
                <button type="button" className={s.linkBtn} onClick={() => navigator.clipboard.writeText(r.url)}>
                  Copy link
                </button>
                <button type="button" className={s.linkBtn} onClick={() => patch(r.asin, { active: !r.active })}>
                  {r.active ? "Hide" : "Show"}
                </button>
                <a className={s.linkBtn} href={`/deals/${dealSlug(r.title, r.asin)}`} target="_blank" rel="noopener">
                  View
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      {!loading && !shown.length && <p className={s.muted}>Nothing here.</p>}
    </section>
  );
}
