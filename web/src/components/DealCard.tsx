"use client";
/* eslint-disable @next/next/no-img-element -- Amazon product images are linked, not proxied */
import Link from "next/link";
import type { Deal } from "@/lib/deals";
import { money } from "@/lib/format";
import { dealTag } from "@/lib/themes";
import { SaveButton } from "./SaveButton";
import s from "./ui.module.css";

type Props = {
  deal: Deal;
  priority?: boolean;
  /** position in the list, used to stagger the entrance animation */
  index?: number;
  onQuickView?: (deal: Deal) => void;
};

export function DealCard({ deal, priority = false, index = 0, onQuickView }: Props) {
  const tag = dealTag(deal);
  return (
    <article className={s.card} style={{ ["--i" as string]: Math.min(index, 11) }}>
      <div className={s.cardMediaWrap}>
        <Link href={`/deals/${deal.slug}`} className={s.cardMedia} aria-label={deal.shortTitle}>
          <img src={deal.imageUrl} alt={deal.shortTitle} width={300} height={300} loading={priority ? "eager" : "lazy"} decoding="async" />
        </Link>
        {deal.discountPct > 0 && <span className={s.badge}>−{deal.discountPct}%</span>}
        <SaveButton deal={deal} />
        {onQuickView && (
          <button type="button" className={s.quick} onClick={() => onQuickView(deal)} aria-label={`Quick view ${deal.shortTitle}`}>
            Quick view
          </button>
        )}
      </div>
      <div className={s.cardBody}>
        <span className={s.tag} data-empty={!tag || undefined}>
          {tag || "Deal"}
        </span>
        <h3 className={s.cardTitle}>
          <Link href={`/deals/${deal.slug}`}>{deal.shortTitle}</Link>
        </h3>
        <p className={s.priceRow}>
          <span className={s.price}>{money(deal.price, deal.currency)}</span>
          {deal.discountPct > 0 && <s className={s.mrp}>{money(deal.originalPrice, deal.currency)}</s>}
        </p>
        <p className={s.save}>{deal.discountPct > 0 ? `You save ${money(deal.savings, deal.currency)}` : "Our pick"}</p>
        <a className={s.buy} href={deal.url} target="_blank" rel="sponsored nofollow noopener" aria-label={`View ${deal.shortTitle} on Amazon`}>
          View on Amazon
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
        </a>
      </div>
    </article>
  );
}
