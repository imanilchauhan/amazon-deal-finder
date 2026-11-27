import Link from "next/link";
import Image from "next/image";
import { AMAZON_DISCLOSURE, SITE, SOCIALS } from "@/lib/site";
import { AskBar } from "./AskBar";
import c from "./chrome.module.css";
import { Freshness } from "./Freshness";
import { HeaderNav, TabBar } from "./MainNav";
import s from "./ui.module.css";

export function Header({ checked = "" }: { checked?: string }) {
  return (
    <header className={c.header}>
      <div className={c.inner}>
        <Link href="/" className={c.logo} aria-label="CartCrush home">
          <Image src="/logo-mark.png" alt="" width={32} height={32} priority />
          <span>CartCrush</span>
        </Link>
        <Freshness checked={checked} short />
        <AskBar />
        <HeaderNav />
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <>
    <TabBar />
    <footer className={s.footer}>
      <div className={s.footerInner}>
        <div>
          <p className={s.footerBrand}>CartCrush</p>
          <p className={s.footerMuted}>{SITE.tagline}. Deals are checked every few hours.</p>
        </div>
        <nav className={s.footerNav} aria-label="Footer">
          <Link href="/deals">All deals</Link>
          <Link href="/collections">Collections</Link>
          <Link href="/guides">Buying guides</Link>
          <Link href="/black-friday">Black Friday deals</Link>
          <Link href="/about">About</Link>
          <Link href="/affiliate-disclosure">Affiliate disclosure</Link>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/contact">Contact us</Link>
        </nav>
        <nav className={s.footerNav} aria-label="Follow CartCrush">
          {SOCIALS.map((so) => (
            <a key={so.name} href={so.url} target="_blank" rel="noopener me">
              {so.name} {so.handle}
            </a>
          ))}
        </nav>
      </div>
      <p className={s.disclosure}>{AMAZON_DISCLOSURE} Amazon and the Amazon logo are trademarks of Amazon.com, Inc. or its affiliates.</p>
    </footer>
    </>
  );
}

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify escaped for safe embedding in HTML
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
