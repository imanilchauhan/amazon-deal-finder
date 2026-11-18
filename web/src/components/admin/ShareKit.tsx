"use client";

import { useState } from "react";
import type { Deal } from "@/lib/deal-model";
import {
  BUSINESS_SUITE_COMPOSER,
  downloadBlob,
  facebookText,
  instagramText,
  renderDealCard,
  shareCard,
  whatsappText,
  whatsappUrl,
} from "@/lib/socialshare";
import { buildPostText, xIntentUrl } from "@/lib/xshare";
import s from "./admin.module.css";

export const PLATFORMS = [
  { id: "x", label: "X" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;
export type PlatformId = (typeof PLATFORMS)[number]["id"];

type Props = {
  deal: Deal;
  onTogglePosted: (platform: PlatformId, posted: boolean) => void;
};

/**
 * Per-deal share actions. Each button prepares the post (caption copied, card made), opens
 * the right place, and marks the deal as posted on that platform so it isn't posted twice.
 * The chips below undo a mark if the post didn't go out.
 */
export function ShareKit({ deal, onTogglePosted }: Props) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const file = `cartcrush-${deal.asin}.jpg`;
  const share = { ...deal, brand: deal.brand };

  /** Mark these platforms as posted (only the ones not marked yet). */
  function markPosted(...ids: PlatformId[]) {
    for (const id of ids) if (!deal.postedOn.includes(id)) onTogglePosted(id, true);
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNote(`${what} caption copied. Paste it into the post.`);
    } catch {
      setNote("Couldn't copy automatically; long-press the caption in the post to paste it yourself.");
    }
  }

  async function card(): Promise<Blob | null> {
    setBusy(true);
    try {
      return await renderDealCard(share);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not make the deal card");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function facebookAndInstagram() {
    markPosted("facebook", "instagram");
    await copy(facebookText(share), "Facebook");
    const blob = await card();
    if (blob) downloadBlob(blob, file);
    window.open(BUSINESS_SUITE_COMPOSER, "_blank", "noopener");
    setNote("Card downloaded and Facebook caption copied. In Meta Business Suite: add the card, paste the caption, tick Facebook and Instagram, then Publish.");
  }

  async function phoneShare() {
    markPosted("instagram");
    await copy(instagramText(share), "Instagram");
    const blob = await card();
    if (!blob) return;
    const res = await shareCard(blob, file, whatsappText(share));
    if (res === "unsupported") {
      downloadBlob(blob, file);
      setNote("This browser can't share images, so the card was downloaded instead. Caption copied.");
    } else if (res === "shared") {
      setNote("Shared. For Instagram, paste the copied caption before posting.");
    }
  }

  async function downloadOnly() {
    const blob = await card();
    if (blob) {
      downloadBlob(blob, file);
      setNote("Deal card downloaded.");
    }
  }

  return (
    <div className={s.shareKit}>
      <div className={s.actions}>
        <a
          className={s.primary}
          href={xIntentUrl(buildPostText(deal))}
          target="_blank"
          rel="noopener"
          onClick={() => markPosted("x")}
        >
          Post on X
        </a>
        <button type="button" className={s.secondary} disabled={busy} onClick={facebookAndInstagram}>
          Facebook + Instagram
        </button>
        <button type="button" className={s.secondary} disabled={busy} onClick={phoneShare}>
          Share card…
        </button>
        <a
          className={s.secondary}
          href={whatsappUrl(whatsappText(share))}
          target="_blank"
          rel="noopener"
          onClick={() => {
            markPosted("whatsapp");
            setNote("WhatsApp opened with the deal text. Pick your channel or a chat and send.");
          }}
        >
          WhatsApp
        </a>
        <button type="button" className={s.linkBtn} disabled={busy} onClick={downloadOnly}>
          Download card
        </button>
        <button type="button" className={s.linkBtn} onClick={() => copy(instagramText(share), "Instagram")}>
          Copy Instagram caption
        </button>
      </div>
      <div className={s.postedRow} role="group" aria-label="Where this deal has been posted">
        <span className={s.muted}>Posted on (tap to undo):</span>
        {PLATFORMS.map((p) => {
          const on = deal.postedOn.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              className={on ? s.chipOn : s.chip}
              aria-pressed={on}
              onClick={() => onTogglePosted(p.id, !on)}
            >
              {on ? "✓ " : ""}
              {p.label}
            </button>
          );
        })}
      </div>
      {note && (
        <p className={s.muted} role="status">
          {note}
        </p>
      )}
    </div>
  );
}
