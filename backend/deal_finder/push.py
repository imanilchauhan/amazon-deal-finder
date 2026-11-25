"""Daily "today's new deals" push for the CartCrush app (FCM topic `daily-deals`).

Once a day (push.yml) this counts the deals first seen in the last 24 hours in the product
cache (catalog.json, no Firestore reads) and, when there are any, sends one notification to the
topic every app install subscribes to. No prices, no "price dropped" wording: the app is a deal
list, not a price tracker (Amazon Associates rules).

  python -m deal_finder.push            send
  DRY_RUN=true python -m deal_finder.push   print the message only

Auth: application-default credentials (keyless in GitHub Actions) or
FIREBASE_SERVICE_ACCOUNT_JSON. The service account needs the "Firebase Cloud Messaging API
Admin" role (roles/firebasecloudmessaging.admin).
"""
from __future__ import annotations

import logging
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

from .catalog import _parse
from .categorize import load_taxonomy

log = logging.getLogger(__name__)

TOPIC = "daily-deals"
WINDOW = timedelta(hours=24)
MAX_NAMES = 3


def new_deals(snapshot: dict | None, now: datetime) -> list[dict]:
    """Active deals first seen within WINDOW, newest first."""
    out = []
    for asin, d in ((snapshot or {}).get("deals") or {}).items():
        seen = _parse(d.get("first_seen_at"))
        if d.get("active") and seen is not None and now - seen <= WINDOW:
            out.append({**d, "asin": asin, "_seen": seen})
    out.sort(key=lambda d: d["_seen"], reverse=True)
    return out


def _category_names() -> dict[str, str]:
    names = {}
    for dep in load_taxonomy()["departments"]:
        names[dep["slug"]] = dep["name"]
        for cat in dep.get("categories", []):
            names[cat["slug"]] = cat["name"]
    return names


def _join(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " & " + names[-1]


def build_message(deals: list[dict]) -> dict | None:
    """Title/body for the day's notification, or None when nothing is new."""
    if not deals:
        return None
    labels = _category_names()
    counts = Counter(labels.get(d.get("category") or "", "") or labels.get(d.get("department") or "", "")
                     for d in deals)
    counts.pop("", None)
    top = [n for n, _ in counts.most_common(MAX_NAMES)]
    n = len(deals)
    noun = "deal" if n == 1 else "deals"
    body = f"{_join(top)} and more — tap to see what's new." if top else "Tap to see what's new."
    return {"title": f"{n} new {noun} on CartCrush today", "body": body,
            "data": {"tab": "home", "count": str(n)}}


def send(message: dict, *, dry_run: bool = False, messaging=None) -> str:
    if dry_run:
        log.info("DRY RUN push to /topics/%s: %s — %s", TOPIC, message["title"], message["body"])
        return "dry-run"
    if messaging is None:
        messaging = _messaging()
    msg = messaging.Message(
        topic=TOPIC,
        notification=messaging.Notification(title=message["title"], body=message["body"]),
        data=message.get("data") or {},
        android=messaging.AndroidConfig(collapse_key=TOPIC, ttl=timedelta(hours=12),
                                        notification=messaging.AndroidNotification(tag=TOPIC)),
        apns=messaging.APNSConfig(headers={"apns-collapse-id": TOPIC}),
    )
    return messaging.send(msg)


def _messaging():
    import firebase_admin
    from firebase_admin import credentials, messaging

    from .config import _load_firebase_credentials

    if not firebase_admin._apps:
        data = _load_firebase_credentials()
        cred = credentials.Certificate(data) if data else credentials.ApplicationDefault()
        opts = {"projectId": os.environ["FIREBASE_PROJECT_ID"]} if os.environ.get("FIREBASE_PROJECT_ID") else None
        firebase_admin.initialize_app(cred, opts)
    return messaging


def run(cache, *, now: datetime, dry_run: bool = False, messaging=None) -> int:
    deals = new_deals(cache.load(), now)
    message = build_message(deals)
    if message is None:
        log.info("No new deals in the last 24 h: no push today")
        return 0
    ref = send(message, dry_run=dry_run, messaging=messaging)
    log.info("Pushed '%s' (%s)", message["title"], ref)
    return len(deals)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    from .catalog import CatalogCache

    base = os.environ.get("CARDS_BASE_URL", "").strip()
    if not base:
        log.error("CARDS_BASE_URL is required (the catalog.json cache)")
        return 2
    dry = os.environ.get("DRY_RUN", "").strip().lower() in ("1", "true", "yes")
    run(CatalogCache(base, secret=""), now=datetime.now(timezone.utc), dry_run=dry)
    return 0


if __name__ == "__main__":
    sys.exit(main())
