"use client";

import { useEffect, useState } from "react";
import s from "./chrome.module.css";

function ago(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** "Prices checked 12 min ago", counted from the newest price check in this build. */
export function Freshness({ checked, short = false }: { checked: string; short?: boolean }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- relative time needs the visitor's clock
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!checked) return null;
  return (
    <span className={s.fresh} title={new Date(checked).toLocaleString("en-IN")}>
      <span className={s.liveDot} aria-hidden="true" />
      {now ? `${short ? "Checked" : "Prices checked"} ${ago(checked, now)}` : short ? "Checked today" : "Prices checked today"}
    </span>
  );
}
