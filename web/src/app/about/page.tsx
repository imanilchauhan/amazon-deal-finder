import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "About CartCrush – How We Find Amazon Deals",
  description:
    "CartCrush checks Amazon India every few hours and lists only real price drops. Learn how our deal finder works and how we choose deals.",
  alternates: { canonical: "/about" },
};

export default function About() {
  return (
    <main className="prose">
      <h1>About CartCrush</h1>
      <p>
        CartCrush is a deals site for people who like a good price but hate scrolling through endless sale pages. We check
        Amazon India every few hours and pick out the products with the biggest real price drops.
      </p>
      <h2>How we pick deals</h2>
      <ul>
        <li>We compare the current price with the product&apos;s regular price and list items with a meaningful discount.</li>
        <li>Every deal shows the current price, the regular price, how much you save and when we last checked it.</li>
        <li>Deals that end are removed automatically, and the same product isn&apos;t posted again unless the price drops further.</li>
      </ul>
      <h2>How CartCrush is funded</h2>
      <p>
        Some links on this site are affiliate links. If you buy through them we may earn a small commission, at no extra
        cost to you. This never changes the price you pay. Read our <Link href="/affiliate-disclosure">affiliate disclosure</Link>.
      </p>
      <h2>Get deals first</h2>
      <p>
        Follow <a href={SITE.xUrl}>{SITE.xHandle}</a> on X for price drop alerts as soon as we find them.
      </p>
    </main>
  );
}
