import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How CartCrush handles your data.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <main className="prose">
      <h1>Privacy policy</h1>
      <p>Last updated: 12 November 2026</p>
      <h2>What we collect</h2>
      <p>
        CartCrush does not ask you to create an account and does not collect your name, email address or payment details.
        Our hosting provider may keep standard server logs (such as IP address, browser type and pages visited) to keep the
        site secure and running.
      </p>
      <h2>Affiliate links and cookies</h2>
      <p>
        When you click a link to Amazon or another store, that store may set cookies to record that you came from
        CartCrush, so we can earn a commission if you buy something. Those cookies are controlled by the store and covered
        by its own privacy policy, for example Amazon.in&apos;s privacy notice.
      </p>
      <h2>Third-party services</h2>
      <p>
        Deal data is stored with Google Firebase. Product images are loaded directly from Amazon&apos;s servers.
      </p>
      <h2>Contact</h2>
      <p>
        Questions about this policy? Email <a href="mailto:crushcart004.21@gmail.com">crushcart004.21@gmail.com</a>.
      </p>
    </main>
  );
}
