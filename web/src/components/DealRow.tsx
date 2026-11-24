import Link from "next/link";
import type { Deal } from "@/lib/deals";
import { withoutVariants } from "@/lib/variants";
import { DealCard } from "./DealCard";
import { RowScroller } from "./RowScroller";
import s from "./ui.module.css";

type Props = {
  title: React.ReactNode;
  href: string;
  linkLabel: string;
  deals: Deal[];
  /** Short line under the title. */
  note?: string;
  /** Plain-text name for screen readers (the visible title may hold an icon). */
  label: string;
};

/** A titled, horizontally scrolling row of deal cards with a "see all" link (home page shelves). */
export function DealRow({ title, href, linkLabel, deals, note, label }: Props) {
  const shown = withoutVariants(deals);
  if (!shown.length) return null;
  return (
    <section className={s.rowSection}>
      <div className={s.rowHead}>
        <div>
          <h2>{title}</h2>
          {note && <p className={s.rowNote}>{note}</p>}
        </div>
        <Link href={href}>{linkLabel} →</Link>
      </div>
      <RowScroller label={label}>
        {shown.map((d, i) => (
          <div key={d.asin} role="listitem" className={s.rowItem}>
            <DealCard deal={d} index={i} />
          </div>
        ))}
      </RowScroller>
    </section>
  );
}
