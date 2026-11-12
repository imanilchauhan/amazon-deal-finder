"""One-off: tag every deal with department/category/brand/gender (skips manual overrides).

Run via the `backfill` GitHub workflow or `python -m deal_finder.backfill`.
"""
from __future__ import annotations

import logging
import os

from .categorize import classify
from .store import init_firestore

log = logging.getLogger(__name__)


def tag_all(db, *, dry_run: bool = False) -> dict:
    stats = {"seen": 0, "tagged": 0, "skipped_manual": 0, "uncategorised": 0}
    batch = db.batch()
    pending = 0
    for snap in db.collection("deals").stream():
        stats["seen"] += 1
        data = snap.to_dict() or {}
        if data.get("category_source") == "manual":
            stats["skipped_manual"] += 1
            continue
        cats = classify(str(data.get("title", "")))
        if cats["department"] == "uncategorised":
            stats["uncategorised"] += 1
        update = dict(cats)
        if "x_status" not in data:
            update["x_status"] = "posted" if (data.get("posted") or {}).get("x") else "unposted"
        stats["tagged"] += 1
        if not dry_run:
            batch.update(snap.reference, update)
            pending += 1
            if pending >= 400:
                batch.commit()
                batch = db.batch()
                pending = 0
    if pending and not dry_run:
        batch.commit()
    return stats


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    db = init_firestore(os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", ""), os.environ.get("FIREBASE_PROJECT_ID", ""))
    log.info("backfill: %s", tag_all(db, dry_run=os.environ.get("DRY_RUN") == "true"))


if __name__ == "__main__":
    main()
