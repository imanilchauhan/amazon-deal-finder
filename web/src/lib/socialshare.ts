/**
 * Owner-side sharing for platforms that have no "post" link (Facebook Page, Instagram,
 * WhatsApp Channel): a branded deal card drawn in the browser plus a caption per platform.
 * The owner still presses Post in each app; nothing here posts on its own.
 */
import { money, shortTitle } from "./format";

export type Shareable = {
  title: string;
  brand?: string;
  price: number;
  originalPrice: number;
  discountPct: number;
  url: string;
  imageUrl: string;
  currency?: string;
};

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://cartcrush.pages.dev").replace(/\/$/, "");
const DISCLOSURE = "As an Amazon Associate I earn from qualifying purchases.";

/** Facebook Page: the link goes in the post (no "comment for link" bait). */
export function facebookText(d: Shareable): string {
  const cur = d.currency ?? "INR";
  return [
    `🔥 ${d.discountPct}% OFF: ${shortTitle(d.title, 110)}`,
    "",
    `💰 ${money(d.price, cur)} (MRP ${money(d.originalPrice, cur)})`,
    `✅ You save ${money(d.originalPrice - d.price, cur)}`,
    "",
    `🛒 Buy on Amazon: ${d.url}`,
    "⏳ Price at the time of posting; Amazon prices change fast.",
    "",
    `#ad ${DISCLOSURE}`,
    "#amazondeals #dealsoftheday #cartcrush",
  ].join("\n");
}

/** Instagram: links in captions are not clickable, so point to the link in bio. */
export function instagramText(d: Shareable): string {
  const cur = d.currency ?? "INR";
  return [
    `🔥 ${d.discountPct}% OFF: ${shortTitle(d.title, 110)}`,
    "",
    `💰 ${money(d.price, cur)} (MRP ${money(d.originalPrice, cur)}) · you save ${money(d.originalPrice - d.price, cur)}`,
    "",
    "👉 Tap the link in our bio to grab it on Amazon",
    "⏳ Price when posted; Amazon prices change fast.",
    "",
    `#ad ${DISCLOSURE}`,
    "",
    "#amazondeals #amazonindia #dealsoftheday #cartcrush",
  ].join("\n");
}

/** WhatsApp channel or chat: short, link last so WhatsApp shows its preview. */
export function whatsappText(d: Shareable): string {
  const cur = d.currency ?? "INR";
  return [
    `🔥 *${d.discountPct}% OFF* ${shortTitle(d.title, 90)}`,
    `💰 *${money(d.price, cur)}* (MRP ${money(d.originalPrice, cur)})`,
    "",
    `🛒 ${d.url}`,
    "",
    `_#ad ${DISCLOSURE}_`,
  ].join("\n");
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
/** Meta Business Suite composer: one post to the Facebook Page and the linked Instagram account. */
export const BUSINESS_SUITE_COMPOSER = "https://business.facebook.com/latest/composer";

// ---- deal card (1080 x 1350, Instagram's 4:5) -------------------------------------------

const W = 1080;
const H = 1350;
const FONT = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // Amazon's image CDN allows CORS, so the canvas stays exportable
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the product image"));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Break `text` into at most `maxLines` lines that fit `width`, ending with "…" if cut. */
export function wrapLines(measure: (s: string) => number, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (measure(next) <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = w;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  const used = lines.join(" ").split(/\s+/).length;
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && measure(`${last}…`) > width) last = last.replace(/\s*\S+$/, "");
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

export async function renderDealCard(d: Shareable): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser");
  const cur = d.currency ?? "INR";

  ctx.fillStyle = "#faf8f6";
  ctx.fillRect(0, 0, W, H);

  // brand row
  ctx.fillStyle = "#e5484d";
  ctx.beginPath();
  ctx.arc(75, 84, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#16181d";
  ctx.font = `800 40px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText("CartCrush", 100, 86);
  ctx.font = `700 24px ${FONT}`;
  const pill = "AMAZON DEAL";
  const pw = ctx.measureText(pill).width + 48;
  roundRect(ctx, W - 64 - pw, 60, pw, 52, 26);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#e7e2de";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#5b6170";
  ctx.fillText(pill, W - 64 - pw + 24, 87);

  // product image on a white card
  roundRect(ctx, 64, 150, 952, 640, 40);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#e7e2de";
  ctx.stroke();
  const img = await loadImage(d.imageUrl);
  const scale = Math.min(780 / img.width, 560 / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  ctx.drawImage(img, 64 + (952 - iw) / 2, 150 + (640 - ih) / 2, iw, ih);

  // discount badge
  ctx.save();
  ctx.translate(W - 158, 294);
  ctx.rotate((-8 * Math.PI) / 180);
  ctx.fillStyle = "#e5484d";
  ctx.beginPath();
  ctx.arc(0, 0, 118, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = `900 92px ${FONT}`;
  ctx.fillText(`${d.discountPct}%`, 0, -14);
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText("OFF", 0, 52);
  ctx.restore();
  ctx.textAlign = "left";

  // brand + title
  let y = 850;
  if (d.brand) {
    ctx.fillStyle = "#5b6170";
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(d.brand, 64, y);
    y += 50;
  }
  ctx.fillStyle = "#16181d";
  ctx.font = `700 50px ${FONT}`;
  for (const line of wrapLines((s) => ctx.measureText(s).width, shortTitle(d.title, 90), 952, 2)) {
    ctx.fillText(line, 64, y);
    y += 60;
  }

  // prices
  ctx.textBaseline = "alphabetic";
  ctx.font = `900 120px ${FONT}`;
  const priceText = money(d.price, cur);
  ctx.fillText(priceText, 64, 1150);
  const px = 64 + ctx.measureText(priceText).width + 28;
  ctx.fillStyle = "#5b6170";
  ctx.font = `500 38px ${FONT}`;
  const mrp = `MRP ${money(d.originalPrice, cur)}`;
  ctx.fillText(mrp, px, 1150);
  const mw = ctx.measureText(mrp).width;
  ctx.fillRect(px, 1137, mw, 3);
  const save = `Save ${money(d.originalPrice - d.price, cur)}`;
  ctx.font = `800 30px ${FONT}`;
  const sw = ctx.measureText(save).width + 44;
  roundRect(ctx, W - 64 - sw, 1094, sw, 62, 16);
  ctx.fillStyle = "#e7f4ec";
  ctx.fill();
  ctx.fillStyle = "#137a3e";
  ctx.fillText(save, W - 64 - sw + 22, 1136);

  // footer band
  ctx.fillStyle = "#16181d";
  ctx.fillRect(0, H - 150, W, 150);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 38px ${FONT}`;
  ctx.fillText(`Link in bio → ${SITE.replace(/^https?:\/\//, "")}`, 64, H - 82);
  ctx.fillStyle = "#a3a9b6";
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText("#ad · Price when posted; Amazon prices change fast.", 64, H - 40);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image"))), "image/jpeg", 0.9),
  );
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Phone share sheet with the card attached (Instagram, WhatsApp, Facebook apps). */
export async function shareCard(blob: Blob, name: string, text: string): Promise<"shared" | "unsupported" | "cancelled"> {
  const file = new File([blob], name, { type: "image/jpeg" });
  if (typeof navigator === "undefined" || !navigator.canShare?.({ files: [file] })) return "unsupported";
  try {
    await navigator.share({ files: [file], text });
    return "shared";
  } catch {
    return "cancelled";
  }
}
