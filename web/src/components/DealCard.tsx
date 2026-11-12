/* eslint-disable @next/next/no-img-element -- Amazon product images are linked, not proxied */
import Link from "next/link";
import type { Deal } from "@/lib/deals";
import { money } from "@/lib/format";
import s from "./ui.module.css";

export function DealCard({ deal, priority = false }: { deal: Deal; priority?: boolean }) {
  return (
    <article className={s.card}>
      <Link href={`/deals/${deal.slug}`} className={s.cardMedia} aria-label={deal.shortTitle}>
        <span className={s.badge}>-{deal.discountPct}%</span>
        <img
          src={deal.imageUrl}
          alt={deal.shortTitle}
          width={300}
          height={300}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
        />
      </Link>
      <div className={s.cardBody}>
        <h3 className={s.cardTitle}>
          <Link href={`/deals/${deal.slug}`}>{deal.shortTitle}</Link>
        </h3>
        <p className={s.priceRow}>
          <span className={s.price}>{money(deal.price, deal.currency)}</span>
          <s className={s.mrp}>{money(deal.originalPrice, deal.currency)}</s>
        </p>
        <p className={s.save}>You save {money(deal.savings, deal.currency)}</p>
        <a
          className={s.buy}
          href={deal.url}
          target="_blank"
          rel="sponsored nofollow noopener"
          aria-label={`Buy ${deal.shortTitle} on Amazon`}
        >
          Buy on Amazon
        </a>
      </div>
    </article>
  );
}
