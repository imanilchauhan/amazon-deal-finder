"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Deal } from "@/lib/deal-model";
import { renderDealVideo, shareVideo, videoMime, VIDEO_THEMES, type DealVideo } from "@/lib/dealvideo";
import {
  BUSINESS_SUITE_COMPOSER,
  downloadBlob,
  facebookText,
  instagramText,
  renderDealCard,
  whatsappText,
  whatsappUrl,
} from "@/lib/socialshare";
import { isForHer, isWinter } from "@/lib/themes";
import { buildPostText, xIntentUrl } from "@/lib/xshare";
import { PLATFORMS, type PlatformId } from "./ShareKit";
import s from "./admin.module.css";

type ThemeId = keyof typeof VIDEO_THEMES;
const THEME_NAMES: Record<ThemeId, string> = { deal: "Deal alert", winter: "Winter", her: "For her", trending: "Hot deal" };

function defaultTheme(d: Deal): ThemeId {
  if (isWinter(d)) return "winter";
  if (isForHer(d)) return "her";
  if (d.discountPct >= 70) return "trending";
  return "deal";
}

type Props = {
  deal: Deal;
  onClose: () => void;
  onTogglePosted: (platform: PlatformId, posted: boolean) => void;
};

/**
 * Full-screen studio for one product: records a short 9:16 deal video in the browser and
 * puts every way to post it on the same screen (download, phone share, Instagram, Facebook,
 * WhatsApp, X, captions, link, still card).
 */
export function VideoStudio({ deal, onClose, onTogglePosted }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [theme, setTheme] = useState<ThemeId>(() => defaultTheme(deal));
  const [seconds, setSeconds] = useState(8);
  const [video, setVideo] = useState<DealVideo | null>(null);
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const supported = typeof window !== "undefined" && !!videoMime();
  const file = `cartcrush-${deal.asin}`;
  const share = { ...deal };

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const make = useCallback(async () => {
    setBusy(true);
    setNote("");
    setProgress(0);
    try {
      const v = await renderDealVideo(deal, VIDEO_THEMES[theme], { seconds, onProgress: setProgress });
      setVideo(v);
      setUrl(URL.createObjectURL(v.blob));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not make the video");
    } finally {
      setBusy(false);
    }
  }, [deal, theme, seconds]);

  // Make the first video as soon as the studio opens.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off render on open
    if (supported) void make();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open; "Make again" re-renders
  }, []);

  function mark(...ids: PlatformId[]) {
    for (const id of ids) if (!deal.postedOn.includes(id)) onTogglePosted(id, true);
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNote(`${what} copied.`);
      return true;
    } catch {
      setNote(`Couldn't copy the ${what.toLowerCase()} automatically.`);
      return false;
    }
  }

  function download() {
    if (!video) return;
    downloadBlob(video.blob, `${file}.${video.ext}`);
  }

  async function phoneShare() {
    if (!video) return;
    await copy(instagramText(share), "Instagram caption");
    const res = await shareVideo(video, `${file}.${video.ext}`, whatsappText(share));
    if (res === "unsupported") {
      download();
      setNote("This browser can't share videos, so it was downloaded instead. Instagram caption copied.");
    } else if (res === "shared") {
      setNote("Shared. For Instagram, paste the copied caption before posting.");
    }
  }

  async function instagram() {
    download();
    await copy(instagramText(share), "Instagram caption");
    mark("instagram");
    window.open("https://www.instagram.com/", "_blank", "noopener");
    setNote("Video downloaded and caption copied. On Instagram: Create → Reel, pick the video, paste the caption, Share.");
  }

  async function businessSuite() {
    download();
    await copy(facebookText(share), "Facebook caption");
    mark("facebook", "instagram");
    window.open(BUSINESS_SUITE_COMPOSER, "_blank", "noopener");
    setNote("Video downloaded and Facebook caption copied. In Business Suite: add the video, paste the caption, tick Facebook and Instagram, Publish.");
  }

  async function card() {
    try {
      downloadBlob(await renderDealCard(share), `${file}.jpg`);
      setNote("Still card downloaded.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not make the card");
    }
  }

  const sizeMb = video ? (video.blob.size / 1e6).toFixed(1) : "";

  return (
    <dialog ref={ref} className={s.studio} onClose={onClose} aria-label={`Video for ${deal.shortTitle}`}>
      <div className={s.studioHead}>
        <div>
          <b>
            Deal video · {deal.images.length} photo{deal.images.length === 1 ? "" : "s"}
          </b>
          <span className={s.hint}>{deal.shortTitle}</span>
        </div>
        <button type="button" className={s.ghost} onClick={() => ref.current?.close()} aria-label="Close">
          ✕
        </button>
      </div>

      <div className={s.studioBody}>
        <div className={s.stage}>
          {url && !busy ? (
            <video key={url} src={url} autoPlay loop muted playsInline controls />
          ) : (
            <div className={s.stageEmpty}>
              {!supported ? (
                <span>This browser can&apos;t record video. Open the admin in Chrome or Safari.</span>
              ) : (
                <>
                  <span>{busy ? "Recording the video…" : "Preparing…"}</span>
                  <div className={s.bar}>
                    <i style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                  <small>{Math.round(progress * seconds)}s of {seconds}s · keep this tab open</small>
                </>
              )}
            </div>
          )}
        </div>

        <div className={s.controls}>
          <section>
            <p className={s.section}>Style</p>
            <div className={s.actions}>
              {(Object.keys(VIDEO_THEMES) as ThemeId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`${s.swatch} ${theme === id ? s.swatchOn : ""}`}
                  aria-pressed={theme === id}
                  onClick={() => setTheme(id)}
                  disabled={busy}
                >
                  <i style={{ background: VIDEO_THEMES[id].accent }} />
                  {THEME_NAMES[id]}
                </button>
              ))}
            </div>
            <div className={s.actions} style={{ marginTop: 8 }}>
              <select className={s.select} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} disabled={busy} aria-label="Length">
                <option value={6}>6 seconds</option>
                <option value={8}>8 seconds</option>
                <option value={12}>12 seconds</option>
              </select>
              <button type="button" className={s.secondary} onClick={() => void make()} disabled={busy || !supported}>
                {busy ? `Recording ${Math.round(progress * 100)}%` : video ? "Make again" : "Make video"}
              </button>
            </div>
          </section>

          <section>
            <p className={s.section}>Get the video</p>
            <div className={s.actions}>
              <button type="button" className={s.primary} onClick={download} disabled={!video || busy}>
                Download {video ? `.${video.ext}` : "video"}
              </button>
              <button type="button" className={s.secondary} onClick={() => void phoneShare()} disabled={!video || busy}>
                Share video…
              </button>
            </div>
            {video && (
              <p className={s.hint}>
                {`1080×1920 · ${video.seconds}s · ${sizeMb} MB`}
                {video.ext === "webm" && " · WebM: Instagram prefers MP4, so record in Safari or a newer Chrome if upload fails."}
              </p>
            )}
          </section>

          <section>
            <p className={s.section}>Post it</p>
            <div className={s.postGrid}>
              <button type="button" className={s.postBtn} onClick={() => void instagram()} disabled={!video || busy}>
                <b>Instagram Reel</b>
                <span>Downloads video, copies caption</span>
              </button>
              <button type="button" className={s.postBtn} onClick={() => void businessSuite()} disabled={!video || busy}>
                <b>Facebook + Instagram</b>
                <span>Business Suite, both at once</span>
              </button>
              <a
                className={s.postBtn}
                href={whatsappUrl(whatsappText(share))}
                target="_blank"
                rel="noopener"
                onClick={() => {
                  mark("whatsapp");
                  setNote("WhatsApp opened with the deal text. Attach the downloaded video if you like, then send.");
                }}
              >
                <b>WhatsApp</b>
                <span>Deal text with link</span>
              </a>
              <a className={s.postBtn} href={xIntentUrl(buildPostText(deal))} target="_blank" rel="noopener" onClick={() => mark("x")}>
                <b>X</b>
                <span>Opens a ready post</span>
              </a>
            </div>
          </section>

          <section>
            <p className={s.section}>Copy</p>
            <div className={s.actions}>
              <button type="button" className={`${s.secondary} ${s.small}`} onClick={() => void copy(instagramText(share), "Instagram caption")}>
                IG caption
              </button>
              <button type="button" className={`${s.secondary} ${s.small}`} onClick={() => void copy(facebookText(share), "Facebook caption")}>
                FB caption
              </button>
              <button type="button" className={`${s.secondary} ${s.small}`} onClick={() => void copy(whatsappText(share), "WhatsApp text")}>
                WhatsApp text
              </button>
              <button type="button" className={`${s.secondary} ${s.small}`} onClick={() => void copy(deal.url, "Affiliate link")}>
                Amazon link
              </button>
              <button type="button" className={`${s.ghost} ${s.small}`} onClick={() => void card()}>
                Still card (JPG)
              </button>
            </div>
          </section>

          <section>
            <p className={s.section}>Posted on</p>
            <div className={s.badges}>
              {PLATFORMS.map((p) => {
                const on = deal.postedOn.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`${s.chip} ${on ? s.chipOn : ""}`}
                    aria-pressed={on}
                    onClick={() => onTogglePosted(p.id, !on)}
                  >
                    {on ? "✓ " : ""}
                    {p.label}
                  </button>
                );
              })}
            </div>
          </section>

          {note && (
            <p className={s.ok} role="status">
              {note}
            </p>
          )}
        </div>
      </div>
    </dialog>
  );
}
