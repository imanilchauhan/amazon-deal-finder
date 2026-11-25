"use client";

import { useMemo, useState } from "react";
import type { Deal } from "@/lib/deal-model";
import { istDateTime } from "@/lib/format";
import { downloadBlob, pickDigest, renderDealCard, shareCard, whatsappDigestText } from "@/lib/socialshare";
import s from "./admin.module.css";

type Props = {
  rows: Deal[];
  /** Tick "WhatsApp" on these deals once the digest has gone out. */
  onMarkSent: (asins: string[]) => Promise<void>;
};

/**
 * Daily WhatsApp Channel digest. WhatsApp has no API for Channels, so this prepares one
 * message (top 5 fresh deals) plus the card of the best one; the owner pastes it once a day.
 */
export function WhatsAppDigest({ rows, onMarkSent }: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Picked when the panel opens, so the list doesn't shift while the owner is posting.
  const [now, setNow] = useState(0);
  const picks = useMemo(() => (now ? pickDigest(rows, now) : []), [rows, now]);
  const oldest = picks.reduce((m, d) => (!m || d.checkedAt < m ? d.checkedAt : m), "");
  const text = picks.length ? whatsappDigestText(picks, istDateTime(oldest)) : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setNote("Message copied. Open your WhatsApp channel and paste it.");
    } catch {
      setNote("Couldn't copy automatically; select the text below and copy it.");
    }
  }

  async function shareWithCard() {
    if (!picks.length) return;
    setBusy(true);
    try {
      await copy();
      const blob = await renderDealCard(picks[0]);
      const res = await shareCard(blob, `cartcrush-digest-${picks[0].asin}.jpg`, text);
      if (res === "unsupported") {
        downloadBlob(blob, `cartcrush-digest-${picks[0].asin}.jpg`);
        setNote("Card downloaded and message copied. In your channel: attach the card, paste the message, send.");
      } else if (res === "shared") {
        setNote("Shared. If WhatsApp didn't keep the text, paste the copied message as the caption.");
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not make the card");
    } finally {
      setBusy(false);
    }
  }

  async function markSent() {
    setBusy(true);
    try {
      await onMarkSent(picks.map((p) => p.asin));
      setNote(`Marked ${picks.length} deals as posted on WhatsApp. Tomorrow's digest will pick new ones.`);
      setNow(Date.now());
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className={s.digest}>
        <div className={s.digestBar}>
          <span className={s.digestIcon} aria-hidden>
            WA
          </span>
          <div>
            <b>WhatsApp daily digest</b>
            <span className={s.hint}>Today&apos;s top 5 deals as one channel message, ready to paste.</span>
          </div>
          <button
            type="button"
            className={s.secondary}
            onClick={() => {
              setNow(Date.now());
              setOpen(true);
            }}
          >
            Prepare digest
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.digest}>
      <div className={s.digestBar}>
        <span className={s.digestIcon} aria-hidden>
          WA
        </span>
        <div>
          <b>WhatsApp daily digest</b>
          <span className={s.hint}>{picks.length} deals picked</span>
        </div>
        <button type="button" className={s.ghost} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {picks.length ? (
        <>
          <div className={s.actions}>
            <button type="button" className={s.primary} disabled={busy} onClick={shareWithCard}>
              Share card + message…
            </button>
            <button type="button" className={s.secondary} disabled={busy} onClick={copy}>
              Copy message
            </button>
            <button type="button" className={s.secondary} disabled={busy} onClick={markSent}>
              Mark these {picks.length} as sent
            </button>
          </div>
          <textarea className={s.digestText} readOnly value={text} rows={14} aria-label="Digest message" />
          <p className={s.muted}>
            On your phone: tap Share, pick WhatsApp, then your channel. On a computer: Copy message, open the channel in WhatsApp,
            paste and send. Then tap &ldquo;Mark these as sent&rdquo;.
          </p>
        </>
      ) : (
        <p className={s.muted}>No fresh deals left that haven&apos;t been sent to WhatsApp. Check back after the next scrape.</p>
      )}
      {note && (
        <p className={s.muted} role="status">
          {note}
        </p>
      )}
    </div>
  );
}
