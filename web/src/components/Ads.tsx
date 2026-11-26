"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT, AD_SLOTS, adsEnabled } from "@/lib/ads";
import s from "./ads.module.css";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/** Loads AdSense on this page (Auto ads + any AdSlot). Renders nothing until AdSense is configured. */
export function AdsScript() {
  if (!adsEnabled()) return null;
  return (
    <Script
      id="adsense"
      async
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
    />
  );
}

/** One labelled ad unit, kept apart from the Amazon buttons so it can't be mistaken for a deal. */
export function AdSlot({ kind = "display" }: { kind?: keyof typeof AD_SLOTS }) {
  const slot = AD_SLOTS[kind];
  const pushed = useRef(false);
  useEffect(() => {
    if (!adsEnabled() || !slot || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // An ad blocker or a slow script only costs the ad.
    }
  }, [slot]);
  if (!adsEnabled() || !slot) return null;
  return (
    <aside className={s.ad} aria-label="Advertisement">
      <span className={s.label}>Advertisement</span>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        {...(kind === "article"
          ? { "data-ad-layout": "in-article", "data-ad-format": "fluid" }
          : { "data-ad-format": "auto", "data-full-width-responsive": "true" })}
      />
    </aside>
  );
}
