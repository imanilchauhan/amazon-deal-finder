"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { askToQuery } from "@/lib/ask";
import s from "./chrome.module.css";

const EXAMPLES = ["warm jacket under ₹1,000 for my dad", "gift for mom under ₹500", "earbuds under 1500", "saree under 800"];

/** "Ask CartCrush": a sentence in, matching deals out (parsed in the browser, see lib/ask.ts). */
export function AskBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const placeholder = `Ask: ${EXAMPLES[1]}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (t) router.push(`/deals?${askToQuery(t)}`);
  }

  return (
    <form role="search" className={compact ? `${s.ask} ${s.askCompact}` : s.ask} onSubmit={submit}>
      <svg className={s.spark} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 16l-1.8-4.8L5.5 9.4l4.7-1.8z" />
        <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
      </svg>
      <label className={s.srOnly} htmlFor={compact ? "ask-m" : "ask"}>
        Ask CartCrush for a deal
      </label>
      <input
        id={compact ? "ask-m" : "ask"}
        type="search"
        enterKeyHint="search"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoComplete="off"
      />
      <button type="submit" aria-label="Find deals">
        <span className={s.askLabel}>Find deals</span>
        <svg className={s.askArrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}
