/**
 * A short vertical (9:16) deal video drawn on a canvas and recorded in the browser with
 * MediaRecorder: the product zooms in, the discount badge pops, the price counts down from
 * MRP, then a "link in bio" call to action. MP4 where the browser can record it (Chrome 126+,
 * Safari), otherwise WebM. Nothing is uploaded; the owner downloads or shares the file.
 */
import { money, shortTitle } from "./format";
import { FONT, SITE, loadImage, roundRect, wrapLines, type Shareable } from "./socialshare";

export const VIDEO_W = 1080;
export const VIDEO_H = 1920;
const FPS = 30;

export type VideoTheme = { label: string; accent: string; soft: string };

export const VIDEO_THEMES = {
  winter: { label: "❄ WINTER STEAL", accent: "#2563EB", soft: "#dce7f7" },
  her: { label: "FOR HER", accent: "#DB2777", soft: "#fbe4ea" },
  trending: { label: "TRENDING NOW", accent: "#D97706", soft: "#fdf0d9" },
  deal: { label: "DEAL ALERT", accent: "#E5484D", soft: "#fde8e8" },
} satisfies Record<string, VideoTheme>;

export type DealVideo = { blob: Blob; mime: string; ext: "mp4" | "webm"; seconds: number };

/** The best container this browser can record, MP4 first because Instagram wants it. */
export function videoMime(): { mime: string; ext: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const options: [string, "mp4" | "webm"][] = [
    ["video/mp4;codecs=avc1.42E01E", "mp4"],
    ["video/mp4;codecs=avc1", "mp4"],
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9", "webm"],
    ["video/webm;codecs=vp8", "webm"],
    ["video/webm", "webm"],
  ];
  for (const [mime, ext] of options) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return null;
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));
/** 0→1 progress of `t` through [start, start + len]. */
const span = (t: number, start: number, len: number) => clamp((t - start) / len);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeBack = (x: number) => {
  const c = 1.9;
  return x === 0 ? 0 : 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

type Frame = (t: number) => void;

function scene(ctx: CanvasRenderingContext2D, d: Shareable, img: HTMLImageElement, theme: VideoTheme, seconds: number): Frame {
  const cur = d.currency ?? "INR";
  ctx.font = `800 60px ${FONT}`;
  const titleLines = wrapLines((s) => ctx.measureText(s).width, shortTitle(d.title, 90), 900, 2);
  const site = SITE.replace(/^https?:\/\//, "");

  return (t) => {
    const W = VIDEO_W;
    const H = VIDEO_H;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 1;

    // background: warm paper with a slow drifting accent glow
    ctx.fillStyle = "#f6f3ef";
    ctx.fillRect(0, 0, W, H);
    const gx = W * (0.75 - 0.1 * Math.sin(t * 0.6));
    const glow = ctx.createRadialGradient(gx, 380, 40, gx, 380, 900);
    glow.addColorStop(0, theme.soft);
    glow.addColorStop(1, "rgba(246,243,239,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // brand row
    const top = easeOut(span(t, 0, 0.6));
    ctx.globalAlpha = top;
    ctx.save();
    ctx.translate(0, (1 - top) * -40);
    ctx.fillStyle = "#e5484d";
    ctx.beginPath();
    ctx.arc(110, 150, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#16181d";
    ctx.font = `800 54px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.fillText("CartCrush", 142, 152);
    ctx.font = `800 30px ${FONT}`;
    const pw = ctx.measureText(theme.label).width + 60;
    roundRect(ctx, W - 90 - pw, 118, pw, 68, 34);
    ctx.fillStyle = theme.accent;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(theme.label, W - 90 - pw + 30, 153);
    ctx.restore();
    ctx.textBaseline = "alphabetic";

    // product card: scales in, then a slow Ken Burns zoom on the photo
    const pIn = easeBack(span(t, 0.2, 0.8));
    const cx = W / 2;
    const cy = 640;
    const cw = 900;
    const ch = 820;
    ctx.globalAlpha = clamp(pIn * 1.4);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(0.8 + 0.2 * pIn, 0.8 + 0.2 * pIn);
    ctx.shadowColor = "rgba(22,24,29,0.12)";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 20;
    roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 56);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 56);
    ctx.clip();
    const zoom = 1 + 0.08 * (t / seconds);
    const fit = Math.min(760 / img.width, 680 / img.height) * zoom;
    const iw = img.width * fit;
    const ih = img.height * fit;
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();
    ctx.restore();
    ctx.globalAlpha = 1;

    // discount badge pops with a little wobble
    const b = easeBack(span(t, 1.0, 0.7));
    if (b > 0) {
      ctx.save();
      ctx.translate(W - 190, 520);
      ctx.rotate(((-10 + 4 * Math.sin(t * 3)) * Math.PI) / 180);
      ctx.scale(b, b);
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(0, 0, 150, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = `900 112px ${FONT}`;
      ctx.fillText(`${d.discountPct}%`, 0, 18);
      ctx.font = `800 40px ${FONT}`;
      ctx.fillText("OFF", 0, 80);
      ctx.restore();
      ctx.textAlign = "left";
    }

    // title slides up
    const ti = easeOut(span(t, 1.6, 0.7));
    ctx.globalAlpha = ti;
    ctx.fillStyle = "#16181d";
    ctx.font = `800 60px ${FONT}`;
    titleLines.forEach((line, i) => ctx.fillText(line, 90, 1150 + i * 74 + (1 - ti) * 40));
    if (d.brand) {
      ctx.fillStyle = "#5b6170";
      ctx.font = `600 34px ${FONT}`;
      ctx.fillText(d.brand, 90, 1092 + (1 - ti) * 40);
    }
    ctx.globalAlpha = 1;

    // MRP appears and gets struck through, then the price counts down to the deal price
    if (t >= 2.3) {
      const m = easeOut(span(t, 2.3, 0.4));
      ctx.globalAlpha = m;
      ctx.fillStyle = "#5b6170";
      ctx.font = `600 46px ${FONT}`;
      const mrp = `MRP ${money(d.originalPrice, cur)}`;
      ctx.fillText(mrp, 90, 1330);
      const strike = easeOut(span(t, 2.6, 0.5));
      ctx.fillRect(90, 1314, ctx.measureText(mrp).width * strike, 5);
      ctx.globalAlpha = 1;
    }
    const pr = span(t, 2.7, 1.2);
    if (t >= 2.7) {
      const shown = Math.round(d.originalPrice - (d.originalPrice - d.price) * easeOut(pr));
      ctx.fillStyle = pr >= 1 ? theme.accent : "#16181d";
      ctx.font = `900 160px ${FONT}`;
      ctx.fillText(money(shown, cur), 82, 1480);
    }

    // "you save" pill
    const sv = easeBack(span(t, 3.8, 0.5));
    if (sv > 0) {
      const save = `You save ${money(d.originalPrice - d.price, cur)}`;
      ctx.font = `800 40px ${FONT}`;
      const sw = ctx.measureText(save).width + 60;
      ctx.save();
      ctx.translate(90 + sw / 2, 1560);
      ctx.scale(sv, sv);
      roundRect(ctx, -sw / 2, -40, sw, 80, 22);
      ctx.fillStyle = "#e7f4ec";
      ctx.fill();
      ctx.fillStyle = "#137a3e";
      ctx.textBaseline = "middle";
      ctx.fillText(save, -sw / 2 + 30, 2);
      ctx.restore();
      ctx.textBaseline = "alphabetic";
    }

    // call to action: slides in, then breathes
    const ca = easeOut(span(t, 4.6, 0.6));
    if (ca > 0) {
      const pulse = 1 + 0.025 * Math.sin((t - 4.6) * 5) * (t > 5.2 ? 1 : 0);
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.translate(W / 2, 1700 + (1 - ca) * 60);
      ctx.scale(pulse, pulse);
      roundRect(ctx, -450, -60, 900, 120, 60);
      ctx.fillStyle = "#16181d";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 46px ${FONT}`;
      ctx.fillText("Link in bio  →  grab it on Amazon", 0, 2);
      ctx.restore();
      ctx.globalAlpha = ca;
      ctx.textAlign = "center";
      ctx.fillStyle = "#5b6170";
      ctx.font = `500 28px ${FONT}`;
      ctx.fillText(`${site}  ·  #ad  ·  price when posted, Amazon prices change fast`, W / 2, 1815);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    }
  };
}

/** Draw one still frame (for a poster/thumbnail) without recording. */
export async function dealVideoPoster(d: Shareable, theme: VideoTheme, at = 99): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;
  const ctx = canvas.getContext("2d")!;
  scene(ctx, d, await loadImage(d.imageUrl), theme, 8)(at);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Record the video in real time (about `seconds` long); `onProgress` gets 0…1. */
export async function renderDealVideo(
  d: Shareable,
  theme: VideoTheme,
  { seconds = 8, onProgress }: { seconds?: number; onProgress?: (p: number) => void } = {},
): Promise<DealVideo> {
  const fmt = videoMime();
  if (!fmt) throw new Error("This browser can't record video. Use Chrome or Safari on a computer or phone.");
  const img = await loadImage(d.imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser");
  const draw = scene(ctx, d, img, theme, seconds);
  draw(0);

  const stream = canvas.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));

  rec.start(250);
  const t0 = performance.now();
  // A timer, not requestAnimationFrame, so recording keeps going if the tab loses focus.
  await new Promise<void>((resolve) => {
    const id = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      draw(Math.min(t, seconds));
      onProgress?.(clamp(t / seconds));
      if (t >= seconds + 0.3) {
        clearInterval(id);
        resolve();
      }
    }, 1000 / FPS);
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  const type = fmt.mime.split(";")[0];
  return { blob: new Blob(chunks, { type }), mime: type, ext: fmt.ext, seconds };
}

/** Phone share sheet with the video attached. */
export async function shareVideo(v: DealVideo, name: string, text: string): Promise<"shared" | "unsupported" | "cancelled"> {
  const file = new File([v.blob], name, { type: v.mime });
  if (typeof navigator === "undefined" || !navigator.canShare?.({ files: [file] })) return "unsupported";
  try {
    await navigator.share({ files: [file], text });
    return "shared";
  } catch {
    return "cancelled";
  }
}
