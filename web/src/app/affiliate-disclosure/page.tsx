import type { Metadata } from "next";
import { AMAZON_DISCLOSURE, PRICE_DISCLAIMER } from "@/lib/site";

export const metadata: Metadata = {
  title: "Affiliate Disclosure",
  description: "How CartCrush earns money through affiliate links, including the Amazon Associates programme.",
  alternates: { canonical: "/affiliate-disclosure" },
};

export default function AffiliateDisclosure() {
  return (
    <main className="prose">
      <h1>Affiliate disclosure</h1>
      <p>
        CartCrush is a participant in the Amazon Services LLC Associates Program and the Amazon.in Associates programme,
        affiliate advertising programmes designed to provide a means for sites to earn advertising fees by advertising and
        linking to Amazon.
      </p>
      <p>
        <strong>{AMAZON_DISCLOSURE}</strong>
      </p>
      <p>
        When you click a &quot;Buy on Amazon&quot; button and make a purchase, we may receive a small commission. You pay the
        same price either way. We may join other affiliate programmes in future (for example Flipkart or Myntra); the same
        rules will apply and links will be marked the same way.
      </p>
      <h2>Prices</h2>
      <p>{PRICE_DISCLAIMER}</p>
      <h2>Social media</h2>
      <p>Posts on our social accounts that contain affiliate links are marked with #ad.</p>
    </main>
  );
}
