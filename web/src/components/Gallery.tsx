"use client";
/* eslint-disable @next/next/no-img-element -- Amazon product photos are served from Amazon's CDN */
import { useState } from "react";
import s from "./gallery.module.css";

/** Main product photo with a thumbnail strip when the product has more than one photo. */
export function Gallery({ images, alt, mediaClass, badge }: { images: string[]; alt: string; mediaClass: string; badge?: React.ReactNode }) {
  const [i, setI] = useState(0);
  const main = images[i] ?? images[0];
  return (
    <div className={s.wrap}>
      <div className={mediaClass}>
        {badge}
        <img key={main} className={s.main} src={main} alt={i === 0 ? alt : `${alt}, photo ${i + 1}`} width={600} height={600} />
      </div>
      {images.length > 1 && (
        <div className={s.thumbs} role="group" aria-label="Product photos">
          {images.map((src, n) => (
            <button
              key={src}
              type="button"
              className={s.thumb}
              aria-pressed={n === i}
              aria-label={`Show photo ${n + 1} of ${images.length}`}
              onClick={() => setI(n)}
              onMouseEnter={() => setI(n)}
            >
              <img src={src} alt="" width={72} height={72} loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
