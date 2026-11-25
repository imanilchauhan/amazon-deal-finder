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

export type DealVideo = { blob: Blob; mime: string; ext: "mp4" | "webm"; seconds: number; music: boolean };

/** The best container this browser can record, MP4 first because Instagram wants it. */
export function videoMime(withAudio = false): { mime: string; ext: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const audio: [string, "mp4" | "webm"][] = withAudio
    ? [
        ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "mp4"],
        ["video/mp4;codecs=avc1,mp4a.40.2", "mp4"],
        ["video/webm;codecs=vp9,opus", "webm"],
        ["video/webm;codecs=vp8,opus", "webm"],
      ]
    : [];
  const options: [string, "mp4" | "webm"][] = [
    ...audio,
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

const MAX_PHOTOS = 5;

/** Load the product photos (main first); photos that fail to load are skipped. */
async function loadPhotos(d: Shareable): Promise<HTMLImageElement[]> {
  const urls = [...new Set([d.imageUrl, ...(d.images ?? [])])].filter(Boolean).slice(0, MAX_PHOTOS);
  const loaded = await Promise.all(urls.map((u) => loadImage(u).catch(() => null)));
  const ok = loaded.filter((x): x is HTMLImageElement => !!x);
  if (!ok.length) throw new Error("Could not load the product image");
  return ok;
}

function scene(ctx: CanvasRenderingContext2D, d: Shareable, photos: HTMLImageElement[], theme: VideoTheme, seconds: number): Frame {
  // Same timeline as backend/deal_finder/reel.py. Videos of 12 s or more get three acts:
  // hook (price, 0–5 s), showcase (big photos, 5 s → end−4.6 s), close (price + call to action).
  const long = seconds >= 12;
  const act2In = 5.0;
  const act2Out = seconds - 4.6;
  const ctaAt = long ? seconds - 4.0 : 4.6;
  const n = photos.length;
  let segments: [number, number][];
  if (long) {
    const show = n > 1 ? photos.map((_, i) => i).slice(1) : [0];
    const len = act2Out - act2In;
    segments = [[0, 0], ...show.map((k, i) => [act2In + 0.3 + (i * len) / show.length, k] as [number, number]), [act2Out + 0.3, 0]];
  } else {
    const order = n > 1 ? [...photos.map((_, i) => i), 0] : [0];
    const step = (seconds - 0.2) / order.length;
    segments = order.map((k, i) => [0.2 + i * step, k] as [number, number]);
  }
  const FADE = 0.35;
  const cur = d.currency ?? "INR";
  ctx.font = `800 60px ${FONT}`;
  const titleLines = wrapLines((s) => ctx.measureText(s).width, shortTitle(d.title, 90), 900, 2);
  const site = SITE.replace(/^https?:\/\//, "");
  const expand = (t: number) => (long ? easeOut(span(t, act2In, 0.6)) - easeOut(span(t, act2Out, 0.6)) : 0);

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
    ctx.globalAlpha = 1;

    const pIn = easeBack(span(t, 0.2, 0.8));
    const e = expand(t);
    const vis = 1 - e; // text panels give way to the big photo in act 2
    const cardW = 900 + 60 * e;
    const cardH = 820 + 560 * e;
    const cy = 640 + 330 * e;
    const cx = W / 2;

    // title slides up (behind the card while it grows)
    const ti = easeOut(span(t, 1.6, 0.7)) * vis;
    if (ti > 0.01) {
      ctx.globalAlpha = ti;
      ctx.fillStyle = "#16181d";
      ctx.font = `800 60px ${FONT}`;
      titleLines.forEach((line, i) => ctx.fillText(line, 90, 1150 + i * 74 + (1 - ti) * 40));
      if (d.brand && !d.title.toLowerCase().startsWith(d.brand.toLowerCase())) {
        ctx.fillStyle = "#5b6170";
        ctx.font = `600 34px ${FONT}`;
        ctx.fillText(d.brand, 90, 1092 + (1 - ti) * 40);
      }
      ctx.globalAlpha = 1;
    }

    // MRP appears and gets struck through, then the price counts down to the deal price
    if (t >= 2.3 && vis > 0.01) {
      ctx.globalAlpha = easeOut(span(t, 2.3, 0.4)) * vis;
      ctx.fillStyle = "#5b6170";
      ctx.font = `600 46px ${FONT}`;
      const mrp = `MRP ${money(d.originalPrice, cur)}`;
      ctx.fillText(mrp, 90, 1330);
      ctx.fillRect(90, 1314, ctx.measureText(mrp).width * easeOut(span(t, 2.6, 0.5)), 5);
      ctx.globalAlpha = 1;
    }
    const pr = span(t, 2.7, 1.2);
    if (t >= 2.7 && vis > 0.01) {
      const shown = Math.round(d.originalPrice - (d.originalPrice - d.price) * easeOut(pr));
      ctx.globalAlpha = vis;
      ctx.fillStyle = pr >= 1 ? theme.accent : "#16181d";
      ctx.font = `900 160px ${FONT}`;
      ctx.fillText(money(shown, cur), 82, 1480 + (1 - vis) * 40);
      ctx.globalAlpha = 1;
    }

    // "you save" pill
    const sv = easeBack(span(t, 3.8, 0.5)) * vis;
    if (sv > 0.02) {
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

    // product card over the text: scales in, grows for the showcase, photos cross-fade with a slow zoom
    let on = 0;
    if (pIn > 0) {
      const k = segments.reduce((acc, [st], i) => (st <= Math.max(t, segments[0][0]) ? i : acc), 0);
      const [segStart, idx] = segments[k];
      const segLen = (k + 1 < segments.length ? segments[k + 1][0] : seconds) - segStart;
      const local = Math.max(0, t - segStart);
      const fade = k > 0 ? easeOut(clamp(local / FADE)) : 1;
      on = idx;
      const sc = 0.8 + 0.2 * pIn;
      ctx.globalAlpha = clamp(pIn * 1.4);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);
      ctx.shadowColor = "rgba(22,24,29,0.12)";
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 20;
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 56);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.save();
      roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 56);
      ctx.clip();
      const boxW = 760 + 100 * e;
      const boxH = 680 + 560 * e;
      const drawPhoto = (img: HTMLImageElement, alpha: number, lt: number, len: number, dx: number) => {
        const zoom = 1 + 0.07 * clamp(lt / Math.max(len, 1));
        const fit = Math.min(boxW / img.width, boxH / img.height) * zoom;
        ctx.globalAlpha = alpha * clamp(pIn * 1.4);
        ctx.drawImage(img, (-img.width * fit) / 2 + dx, (-img.height * fit) / 2, img.width * fit, img.height * fit);
      };
      if (k > 0 && fade < 1) {
        const prevLen = segStart - segments[k - 1][0];
        drawPhoto(photos[segments[k - 1][1]], 1 - fade, prevLen + local, prevLen, -60 * fade);
      }
      drawPhoto(photos[idx], fade, local, segLen, 60 * (1 - fade));
      ctx.restore();
      ctx.restore();
      ctx.globalAlpha = 1;
      if (n > 1 && pIn > 0.5) {
        const gap = 30;
        const x0 = cx - ((n - 1) * gap) / 2;
        photos.forEach((_, i) => {
          ctx.fillStyle = i === on ? theme.accent : "#d5d5d6";
          ctx.beginPath();
          ctx.arc(x0 + i * gap, cy + cardH / 2 - 34, i === on ? 9 : 7, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }

    // discount badge pops with a little wobble; a bit smaller in the showcase
    const b = easeBack(span(t, 1.0, 0.7)) * (1 - 0.25 * e);
    if (b > 0) {
      ctx.save();
      ctx.translate(W - 190 + 20 * e, 520 - 120 * e);
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

    // showcase: a price chip under the big photo
    if (e > 0.15) {
      const chip = `${money(d.price, cur)}  ·  ${d.discountPct}% OFF  ·  link in bio`;
      ctx.font = `800 44px ${FONT}`;
      const chipW = ctx.measureText(chip).width + 80;
      ctx.globalAlpha = e * e;
      roundRect(ctx, W / 2 - chipW / 2, cy + cardH / 2 + 40 + (1 - e) * 40, chipW, 96, 48);
      ctx.fillStyle = theme.accent;
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(chip, W / 2, cy + cardH / 2 + 90 + (1 - e) * 40);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
    }

    // call to action: slides in, then breathes (in the close for long videos)
    const ca = easeOut(span(t, ctaAt, 0.6)) * (1 - e);
    if (ca > 0.02) {
      const pulse = 1 + 0.025 * Math.sin((t - ctaAt) * 5) * (t > ctaAt + 0.6 ? 1 : 0);
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
  scene(ctx, d, await loadPhotos(d), theme, 16)(at);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Record the video in real time (about `seconds` long); `onProgress` gets 0…1. */
export type VideoMusic = { url: string; start: number; gain: number };

/** Decode the track and route it, faded in and out, into a stream the recorder can capture (not the speakers). */
async function musicStream(m: VideoMusic, seconds: number) {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const data = await (await fetch(m.url)).arrayBuffer();
  const buffer = await ctx.decodeAudioData(data);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  const dest = ctx.createMediaStreamDestination();
  source.connect(gain).connect(dest);
  if (ctx.state === "suspended") await ctx.resume();
  return {
    track: dest.stream.getAudioTracks()[0],
    start() {
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(m.gain, t + 0.4);
      gain.gain.setValueAtTime(m.gain, t + Math.max(0.4, seconds - 1));
      gain.gain.linearRampToValueAtTime(0, t + seconds);
      source.start(t, m.start);
    },
    stop() {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      void ctx.close();
    },
  };
}

export async function renderDealVideo(
  d: Shareable,
  theme: VideoTheme,
  { seconds = 16, onProgress, music }: { seconds?: number; onProgress?: (p: number) => void; music?: VideoMusic | null } = {},
): Promise<DealVideo> {
  let audio: Awaited<ReturnType<typeof musicStream>> | null = null;
  if (music) {
    try {
      audio = await musicStream(music, seconds);
    } catch (e) {
      console.warn("music unavailable, recording without it", e);
    }
  }
  const fmt = videoMime(!!audio);
  if (!fmt) throw new Error("This browser can't record video. Use Chrome or Safari on a computer or phone.");
  const photos = await loadPhotos(d);
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser");
  const draw = scene(ctx, d, photos, theme, seconds);
  draw(0);

  const canvasStream = canvas.captureStream(FPS);
  const stream = audio ? new MediaStream([...canvasStream.getVideoTracks(), audio.track]) : canvasStream;
  const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));

  rec.start(250);
  audio?.start();
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
  audio?.stop();
  stream.getTracks().forEach((tr) => tr.stop());
  const type = fmt.mime.split(";")[0];
  return { blob: new Blob(chunks, { type }), mime: type, ext: fmt.ext, seconds, music: !!audio };
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
