import Link from "next/link";
import Image from "next/image";
import { AMAZON_DISCLOSURE, SITE } from "@/lib/site";
import s from "./ui.module.css";

export function Header() {
  return (
    <header className={s.header}>
      <div className={s.headerInner}>
        <Link href="/" className={s.logo} aria-label="CartCrush home">
          <Image src="/logo-mark.png" alt="" width={34} height={34} priority />
          <span>CartCrush</span>
        </Link>
        <nav className={s.nav} aria-label="Main">
          <Link href="/deals">All deals</Link>
          <Link href="/collections">Collections</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/about">About</Link>
          <a href={SITE.xUrl} target="_blank" rel="noopener">
            Follow on X
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
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
          <a href={SITE.xUrl} target="_blank" rel="noopener">
            X {SITE.xHandle}
          </a>
        </nav>
      </div>
      <p className={s.disclosure}>{AMAZON_DISCLOSURE} Amazon and the Amazon logo are trademarks of Amazon.com, Inc. or its affiliates.</p>
    </footer>
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
