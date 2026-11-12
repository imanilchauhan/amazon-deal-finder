"use client";
/* eslint-disable @next/next/no-img-element -- Amazon product images are linked, not proxied */
import Link from "next/link";
import type { Deal } from "@/lib/deals";
import { money } from "@/lib/format";
import s from "./ui.module.css";

type Props = {
  deal: Deal;
  priority?: boolean;
  /** position in the list, used to stagger the entrance animation */
  index?: number;
  onQuickView?: (deal: Deal) => void;
};

export function DealCard({ deal, priority = false, index = 0, onQuickView }: Props) {
  return (
    <article className={s.card} style={{ ["--i" as string]: Math.min(index, 11) }}>
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
      {onQuickView && (
        <button type="button" className={s.quick} onClick={() => onQuickView(deal)} aria-label={`Quick view ${deal.shortTitle}`}>
          Quick view
        </button>
      )}
      <div className={s.cardBody}>
        {deal.brand && <p className={s.brandTag}>{deal.brand}</p>}
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
