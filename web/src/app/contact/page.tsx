import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/SiteChrome";
import { SITE, SOCIALS } from "@/lib/site";
import s from "./contact.module.css";

export const metadata: Metadata = {
  title: "Contact CartCrush – Email, Instagram, Facebook and X",
  description:
    "Get in touch with CartCrush: report a wrong price or broken link, suggest a product, or ask about working together. Follow our daily Amazon deals on Instagram, Facebook and X.",
  alternates: { canonical: "/contact" },
};

const REASONS = [
  { title: "A price looks wrong", body: "Amazon prices change fast. Send us the product link and we'll re-check it and fix the page." },
  { title: "A link doesn't work", body: "Tell us where you found it (the site, a post or a story) and we'll repair it." },
  { title: "Suggest a product", body: "Seen a great deal we missed, or want a collection for something? We'd love to hear it." },
  { title: "Work with us", body: "Brands and creators: write to us about collaborations and featured collections." },
];

function mailto(subject: string) {
  return `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}`;
}

export default function Contact() {
  return (
    <main className={s.page}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: "Contact CartCrush",
          url: `${SITE.url}/contact`,
          mainEntity: {
            "@type": "Organization",
            name: SITE.name,
            url: SITE.url,
            email: SITE.email,
            sameAs: SOCIALS.map((so) => so.url),
          },
        }}
      />
      <header className={s.hero}>
        <p className={s.kicker}>Contact us</p>
        <h1>We&apos;re here to help you shop smarter</h1>
        <p className={s.lead}>
          Questions about a deal, a price that looks off, or an idea for us? Email us, or message us on any of our channels.
        </p>
        <a className={s.primary} href={mailto("Hello CartCrush")}>
          Email {SITE.email}
        </a>
      </header>

      <section aria-labelledby="follow">
        <h2 id="follow" className={s.h2}>
          Follow CartCrush
        </h2>
        <ul className={s.socials}>
          {SOCIALS.map((so) => (
            <li key={so.name} className={s.social} style={{ ["--accent" as string]: so.accent }}>
              <div className={s.socialText}>
                <h3>{so.name}</h3>
                <p className={s.handle}>{so.handle}</p>
                <p className={s.blurb}>{so.blurb}</p>
              </div>
              <a className={s.follow} href={so.url} target="_blank" rel="noopener me" aria-label={`Follow CartCrush on ${so.name}`}>
                Follow
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="help">
        <h2 id="help" className={s.h2}>
          What can we help with?
        </h2>
        <ul className={s.reasons}>
          {REASONS.map((r) => (
            <li key={r.title} className={s.reason}>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
              <a href={mailto(r.title)}>Email us about this →</a>
            </li>
          ))}
        </ul>
      </section>

      <p className={s.note}>
        CartCrush is an independent deals site and not part of Amazon. For orders, delivery, returns or refunds, please
        contact Amazon customer service from your Amazon account. Read our <Link href="/affiliate-disclosure">affiliate
        disclosure</Link> and <Link href="/privacy">privacy policy</Link>.
      </p>
    </main>
  );
}
