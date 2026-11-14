import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/data/guides";
import c from "@/components/content.module.css";

export const metadata: Metadata = {
  title: "Buying Guides – What to Look For Before You Buy",
  description:
    "Short, practical buying guides for Indian shoppers: room heaters, geysers, wedding jewellery, winter wear and more, each with today's live Amazon deals.",
  alternates: { canonical: "/guides" },
};

export default function GuidesIndex() {
  return (
    <main>
      <article className={c.article}>
        <h1>Buying guides</h1>
        <p>
          Quick, honest advice on what to check before you buy, written for Indian homes and seasons. Every guide ends with the
          matching deals that are live on Amazon India right now.
        </p>
      </article>
      <div className={c.cards}>
        {GUIDES.map((g) => (
          <Link key={g.slug} href={`/guides/${g.slug}`} className={c.card}>
            <h2>{g.h1}</h2>
            <p>{g.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
