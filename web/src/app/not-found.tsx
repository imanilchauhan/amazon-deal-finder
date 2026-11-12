import type { Metadata } from "next";
import Link from "next/link";

// A gone deal must not inherit the home page's canonical or "index" robots tag.
export const metadata: Metadata = {
  title: "Deal not found",
  robots: { index: false, follow: true },
  alternates: { canonical: null },
};

export default function NotFound() {
  return (
    <main className="prose">
      <h1>This deal has gone</h1>
      <p>Deals move fast. The page you&apos;re looking for has ended or never existed.</p>
      <p>
        <Link href="/deals">See today&apos;s live deals →</Link>
      </p>
    </main>
  );
}
