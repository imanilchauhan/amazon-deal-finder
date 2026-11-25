/**
 * Background music for deal videos — the same rules as backend/deal_finder/music.py.
 * Royalty-free Pixabay tracks, hosted on the cards Worker (/m/<file>.mp3), not in this repo.
 */
import type { Deal } from "./deal-model";

export const MUSIC_BASE = (process.env.NEXT_PUBLIC_CARDS_BASE_URL || "https://cartcrush-cards.imanilchauhan3.workers.dev").replace(/\/$/, "");

export type TrackId = "gadget" | "desi" | "light" | "winter" | "default";
export type Track = { label: string; file: string; start: number; gain: number };

export const TRACKS: Record<TrackId, Track> = {
  gadget: { label: "Gadget beat", file: "gadget", start: 0, gain: 0.85 },
  desi: { label: "Desi", file: "desi", start: 0, gain: 0.85 },
  light: { label: "Ukulele", file: "light", start: 0.45, gain: 0.9 },
  winter: { label: "Winter acoustic", file: "winter", start: 0, gain: 1.3 },
  default: { label: "Everyday beat", file: "gadget", start: 0, gain: 0.7 },
};

const ETHNIC_RX = /\b(kurta|kurti|kurtis|saree|sari|lehenga|salwar|dupatta|anarkali|sherwani|ethnic|churidar|palazzo set)\b/i;
const GADGET_DEPTS = new Set(["electronics", "mobiles-tablets", "computers-accessories", "large-appliances"]);
const GADGET_CATS = new Set(["watches", "smartwatches-bands", "headphones-earbuds"]);
const LIGHT_DEPTS = new Set(["baby", "home-kitchen", "beauty-personal-care", "home-improvement-garden", "toys-games"]);

export function pickTrack(d: Pick<Deal, "title" | "department" | "category" | "gender" | "discountPct">, theme = ""): TrackId {
  if (theme === "winter") return "winter";
  if (ETHNIC_RX.test(d.title) || (d.gender === "women" && d.department === "fashion")) return "desi";
  if (GADGET_DEPTS.has(d.department) || GADGET_CATS.has(d.category)) return "gadget";
  if (LIGHT_DEPTS.has(d.department)) return "light";
  if (d.discountPct >= 70) return "gadget";
  return "default";
}

export const trackUrl = (id: TrackId) => `${MUSIC_BASE}/m/${TRACKS[id].file}.mp3`;
