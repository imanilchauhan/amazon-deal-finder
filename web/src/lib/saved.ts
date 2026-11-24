"use client";

/** Saved deals live only in this browser (no account): a snapshot of each deal when saved. */
export type SavedDeal = { asin: string; slug: string; title: string; imageUrl: string; price: number; currency: string; url: string; savedAt: string };

const KEY = "cartcrush:saved";
const EVENT = "cartcrush:saved";

export function readSaved(): SavedDeal[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(list: SavedDeal[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    /* storage full or blocked: saving is a convenience only */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function toggleSaved(d: Omit<SavedDeal, "savedAt">): boolean {
  const list = readSaved();
  const on = list.some((x) => x.asin === d.asin);
  write(on ? list.filter((x) => x.asin !== d.asin) : [{ ...d, savedAt: new Date().toISOString() }, ...list]);
  return !on;
}

export function onSavedChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
