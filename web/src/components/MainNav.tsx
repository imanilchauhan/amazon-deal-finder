"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { onSavedChange, readSaved } from "@/lib/saved";
import c from "./chrome.module.css";

const LINKS = [
  { href: "/deals", label: "Deals" },
  { href: "/collections", label: "Collections" },
  { href: "/guides", label: "Guides" },
  { href: "/contact", label: "Contact" },
];

function useSavedCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const sync = () => setN(readSaved().length);
    sync();
    return onSavedChange(sync);
  }, []);
  return n;
}

/** "/deals/x" counts as the Deals section, "/" only as home. */
function isCurrent(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

/** Header menu (tablets and desktops). */
export function HeaderNav() {
  const path = usePathname() ?? "/";
  const saved = useSavedCount();
  return (
    <nav className={c.nav} aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isCurrent(path, l.href) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      <Link href="/saved" aria-current={isCurrent(path, "/saved") ? "page" : undefined}>
        Saved{saved ? ` (${saved})` : ""}
      </Link>
    </nav>
  );
}

const icon = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  deals: (
    <>
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  collections: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  saved: <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z" />,
};

const TABS = [
  { href: "/", label: "Home", icon: icon.home },
  { href: "/deals", label: "Deals", icon: icon.deals },
  { href: "/collections", label: "Collections", icon: icon.collections },
  { href: "/saved", label: "Saved", icon: icon.saved },
];

/** Floating glass tab bar (phones only, hidden by CSS on wider screens), like the app. */
export function TabBar() {
  const path = usePathname() ?? "/";
  const saved = useSavedCount();
  return (
    <nav className={c.tabbar} aria-label="Main (phone)">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={c.tab} aria-current={isCurrent(path, t.href) ? "page" : undefined}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {t.icon}
          </svg>
          {t.label}
          {t.href === "/saved" && saved > 0 && (
            <span className={c.tabCount} aria-label={`${saved} saved`}>
              {saved}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
