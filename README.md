# Amazon Affiliate Deal Finder

Scrapes Amazon deals every 4 hours → validates them against a JSON schema → stores/dedupes them in
Firestore → posts to Facebook, Instagram (Reels) and optionally X → answers "DEAL" comments with an
automatic DM containing the affiliate link → shows everything live in a Flutter app (iOS, Android, Web).

```
GitHub Actions (cron 4h, free)
 └─ backend/ (Python)
     scraper.py ── Playwright headless Chromium → amazon.in|com /deals → /dp/ASIN pages
     models.py  ── JSON-schema + business-rule validation (nothing invalid leaves the process)
     store.py   ── Firestore: deals/{asin} upsert+dedupe, stale → inactive, post state
     graphics.py── Pillow card (1080×1350 JPEG) + ffmpeg Reel (1080×1920 MP4)
     meta.py    ── FB Page photo/video, IG Reel (resumable upload) / image
     twitter.py ── X API v2 via tweepy (off by default — paid)
     │                                           ┌──────────────────────────────┐
     └── writes ig_media/{id}, fb_posts/{id} ──► │ Firestore (Spark, free)      │
                                                 └──────┬──────────────┬────────┘
Meta webhook (comment "DEAL") ─► worker/ (Cloudflare)   │ REST get     │ realtime stream
                                 verify HMAC → lookup ──┘              ▼
                                 private-reply DM + public reply   app/ (Flutter, Riverpod)
```

---

## ⚠️ Read this first: what "100 % free" really means in Nov 2026

I verified each platform before writing code. Three things in the original brief no longer hold,
and the design was changed accordingly:

| Brief assumed | Reality (verified Nov 2026) | What this repo does |
|---|---|---|
| **X API v2 Free tier** for posting | X closed its free tier to new developers on 6 Feb 2026; posting is **pay-per-use**, billed per post (link posts cost more). | X is **off by default** (`X_ENABLED=false`), capped per run, and handles the "credits exhausted" (402) error. Turn it on only if you accept a small monthly bill. |
| **ManyChat Free** for comment-to-DM | Since 2 Mar 2026 the free plan is **25 contacts / month, 4 automations** — a trial, not a production tier. | ManyChat guide kept (Option A) with the limits stated; the **Cloudflare Worker (Option B) is the real $0 path**. |
| **Scrape Amazon** with Playwright | Works technically, but Amazon's Associates terms restrict automated scraping and require displayed prices to come from Amazon's API and be fresh (≤ 24 h). The sanctioned free route is the **Creators API** (replaced PA-API in 2026), which requires an active Associates account with qualifying sales. Datacenter IPs (GitHub runners) also get robot-checked often. | Scraper built as asked, but **isolated behind one function** (`scrape()` in `Deps`) so you can swap in a Creators API client once eligible. It never bypasses CAPTCHAs, stops cleanly on a robot check, and deals older than 24 h are auto-hidden. **Using the scraper is at your own risk to your Associates account.** |

Everything else (GitHub Actions, Firestore Spark, Cloudflare Workers, Meta Graph API, Firebase
Hosting for the web app) is genuinely free at this scale. Meta App Review is free but slow.

### Other review findings that changed the design
* **No media hosting needed.** Instagram normally requires a public image/video URL. Reels are sent
  with Meta's *resumable upload* (bytes straight to `rupload.facebook.com`) and Facebook posts are
  multipart uploads, so there's no bucket (Firebase Storage now needs the paid Blaze plan).
* **No double posts.** Uploads and `media_publish` are never retried on 5xx (they may have
  succeeded); only rate-limit errors are retried. Workflow `concurrency` stops overlapping runs.
* **One failing platform never blocks the others**, and failed platforms stay "un-posted" so the
  next run retries them. Re-posts happen only after a ≥ 5 % price drop and ≥ 24 h.
* **Webhook safety:** HMAC-SHA256 signature check, ignores the account's own comments (no reply
  loops), optional KV dedupe for Meta redeliveries, only `amazon.in|com/dp/…?tag=` links are ever DM'd.
* **Meta allows one private reply per comment within 7 days** — the Worker falls back to a public
  "link in bio" reply when the DM fails.
* **Disclosures everywhere:** `#Ad` on X, `#ad` + Amazon Associate statement on FB/IG captions,
  DMs and the app footer.

---

## Repository layout

```
amazon-deal-finder/
├── .github/workflows/
│   ├── deals.yml            # cron pipeline (Phase 1–3)
│   └── tests.yml            # CI for backend, worker, flutter
├── backend/
│   ├── deal_finder/
│   │   ├── __main__.py      # python -m deal_finder
│   │   ├── main.py          # orchestrator + dependency injection
│   │   ├── config.py        # env-var config + validation
│   │   ├── models.py        # Deal, JSON schema, price parsing, affiliate links
│   │   ├── scraper.py       # Playwright scraper
│   │   ├── store.py         # Firestore
│   │   ├── captions.py      # X / FB / IG text + disclosures
│   │   ├── twitter.py       # tweepy poster
│   │   ├── graphics.py      # card + reel rendering
│   │   └── meta.py          # Graph API client
│   ├── tests/               # 105 pytest tests (+ HTML fixtures)
│   ├── requirements.txt / requirements-dev.txt / pytest.ini
├── worker/                  # Cloudflare Worker (comment-to-DM)
│   ├── src/index.js
│   ├── test/index.test.js   # 25 node:test tests
│   └── wrangler.toml / package.json
├── app/                     # Flutter app
│   ├── lib/{main.dart, firebase_options.dart, models/, data/, providers/, services/, ui/}
│   └── test/deals_feed_test.dart
├── firebase/firestore.rules, firestore.indexes.json
├── firebase.json
├── docs/META_SETUP.md, docs/MANYCHAT_SETUP.md
└── .env.example
```

---

## Phase 1 — Scraper + GitHub Actions

### Setup
1. Push this repo to GitHub. **Public repo = unlimited Actions minutes.** Private repos get
   2,000 min/month; this job takes ~4–6 min × 6 runs/day ≈ 900 min/month, which still fits.
2. Settings → Secrets and variables → Actions → add the **secrets/variables** listed in
   [`.env.example`](.env.example). Minimum for a first run: secret `AMAZON_ASSOCIATE_TAG`.
3. Actions → **deals** → *Run workflow* → tick **dry_run**. It scrapes, validates, prints the
   summary, and uploads `out/summary.json` as an artifact. Nothing is written or posted.

### Local run
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
python -m playwright install --with-deps chromium     # once
export AMAZON_ASSOCIATE_TAG=yourtag-21 DRY_RUN=true
python -m deal_finder && cat out/summary.json
```

### Tests
```bash
cd backend
python -m pytest -v                       # everything (105 tests)
python -m pytest tests/test_models.py     # JSON schema + parsing only
python -m pytest -m "not browser"         # skip the Chromium-based extraction tests
```
`test_models.py` covers the schema (required fields, types, https-only images, amazon-only
affiliate URLs with `?tag=`, discount/price consistency). `test_scraper.py` runs the real
in-page extraction JavaScript against saved Amazon-like HTML in headless Chromium, including
CAPTCHA detection. The workflow runs the full suite as a gate **before** the pipeline step.

> Selectors break when Amazon changes its markup. When `scraped: 0` appears in the run summary
> with no robot-check warning, save a product page as HTML into `tests/fixtures/`, update
> `EXTRACT_PRODUCT_JS`, and add a test.

---

## Phase 2 — Firestore + X

### Firebase (Spark plan, no card)
1. console.firebase.google.com → **Add project** → Build → **Firestore Database** → Create
   (production mode, region close to your users, e.g. `asia-south1`).
2. Project settings → **Service accounts** → *Generate new private key*. Put the whole JSON
   (or `base64 -w0 key.json`) in the secret `FIREBASE_SERVICE_ACCOUNT_JSON`.
3. Deploy rules + the index the app's query needs:
   ```bash
   npm i -g firebase-tools && firebase login
   firebase use --add            # pick your project
   firebase deploy --only firestore:rules,firestore:indexes
   ```
4. Run the workflow without dry_run → documents appear under `deals/`.

Data model: `deals/{asin}` = schema fields + `active`, `first_seen_at`, `updated_at`,
`last_drop_at`, `posted.{x|facebook|instagram} = {at, price, id}`. Dedupe key is the ASIN;
a batched `get_all` + one batched commit per run keeps reads/writes tiny (≈ 30–60 writes/run vs the
free 20,000/day).

### X (optional, paid)
1. developer.x.com → create a Project + App, set **User authentication → Read and write**,
   regenerate the Access Token/Secret *after* switching to write, add credits and a spend cap.
2. Secrets `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`; variable `X_ENABLED=true`.

Tweet format (weighted-length-checked to ≤ 280, URLs count as 23):
```
🔥 46% OFF: boAt Rockerz 450 Bluetooth On Ear Headphones…
💰 ₹1,299 (was ₹2,399) · save ₹1,100
https://www.amazon.in/dp/B07PR1CL3S/?tag=yourtag-21
#Ad #AmazonDeals
```

### Tests
```bash
python -m pytest tests/test_store.py tests/test_twitter.py -v
```
Firestore is tested against an in-memory fake (insert, dedupe, price-drop flag, merge of per-platform
post state, stale deactivation, read/write failures → `StoreError`). X is tested with a fake tweepy
client (success, 429/5xx retry with back-off, 401/402/403-duplicate handling, truncation to 280).

---

## Phase 3 — Facebook + Instagram + Comment-to-DM

### 3A. Publishing (backend)
Follow [docs/META_SETUP.md](docs/META_SETUP.md) §1–3 to get `META_PAGE_ID`, `META_IG_USER_ID`,
`META_PAGE_ACCESS_TOKEN`, then set variable `META_ENABLED=true`.

* Instagram: `IG_POST_MODE=reel` (default; vertical video with the price graphic) or `image`
  (posts the Amazon product photo — IG image posts must come from a public URL).
* Facebook: `FB_POST_MODE=photo` (default) or `video`.

Caption example:
```
🔥 46% OFF — boAt Rockerz 450 Bluetooth On Ear Headphones

💰 Now ₹1,299 (MRP ₹2,399)
✅ You save ₹1,100

👇 Comment "DEAL" and we'll DM you the link!
⏳ Prices change fast — grab it before it's gone.

#ad As an Amazon Associate I earn from qualifying purchases.
#amazondeals #dealsoftheday #lootdeals
```
Each published post id is written to `ig_media/{id}` or `fb_posts/{id}` → `{asin, url, title}`
so the comment handler knows which link to send.

### 3B. Comment-to-DM — Option B: Cloudflare Worker (recommended, $0)
```bash
cd worker
npm install
npx wrangler login
# edit wrangler.toml [vars]: IG_USER_ID, PAGE_ID, FIREBASE_PROJECT_ID, FALLBACK_URL
npx wrangler secret put APP_SECRET            # Meta app secret (App settings → Basic)
npx wrangler secret put VERIFY_TOKEN          # any random string, reused in the Meta dashboard
npx wrangler secret put PAGE_ACCESS_TOKEN     # same long-lived Page token
npx wrangler secret put FIREBASE_WEB_API_KEY  # Firebase → Project settings → Web API key
# optional dedupe store:
npx wrangler kv namespace create DEDUPE        # paste id into wrangler.toml, uncomment block
npx wrangler deploy
```
Then register `https://<worker>.workers.dev/webhook` in the Meta dashboard (META_SETUP.md §4).
The Firebase Web API key is safe to use here: Firestore rules make every collection read-only and
the mapping collections single-document-get only.

Free-tier fit: Workers free = 100,000 requests/day; each comment costs one request plus 3 subrequests.

### 3B. Option A: ManyChat
See [docs/MANYCHAT_SETUP.md](docs/MANYCHAT_SETUP.md). Don't run both options at once.

### Tests
```bash
cd backend && python -m pytest tests/test_meta.py tests/test_graphics.py tests/test_main.py -v
cd worker  && npm test
```
Meta tests use a fake HTTP session to assert exact endpoints, headers and payloads (resumable
upload headers, container polling, ERROR/timeout, rate-limit retry, *no* retry of non-idempotent
calls). Graphics tests render real JPEGs and run ffmpeg, then `ffprobe` the Reel (H.264 1080×1920 +
AAC). Pipeline tests cover dry run, all-platform posting, no re-posting, failure isolation, per-platform
budgets and schema rejection. Worker tests cover verification handshake, HMAC, keyword matching
(`DEAL` yes, `ideal`/`dealer` no), IG and FB flows, fallback link, DM-window failure, KV dedupe and
rejecting tampered Firestore links.

### Manual end-to-end check
1. Run the workflow → a Reel appears on IG and a photo on your Page.
2. From a **different** IG account, comment `deal` on the Reel.
3. Within seconds: public reply "Sent you a DM 📩" and a DM (in Requests if not following) with
   `https://www.amazon.in/dp/<ASIN>/?tag=<yourtag>`.
4. `npx wrangler tail` shows the processing log.

---

## Phase 4 — Flutter app (iOS / Android / Web)

```bash
cd app
flutter create --platforms=android,ios,web .     # generates platform folders, keeps lib/ and test/
flutter pub get
dart pub global activate flutterfire_cli
flutterfire configure                            # overwrites lib/firebase_options.dart with your keys
flutter run -d chrome                            # or an emulator / device
```
If `pub get` complains about versions with your Flutter SDK, run `flutter pub upgrade --major-versions`
(the code only uses stable APIs of firebase_core, cloud_firestore, flutter_riverpod 2.x and url_launcher).
* **State management:** Riverpod — `dealsStreamProvider` wraps the Firestore `snapshots()` stream,
  so new deals from the cron job appear without refresh.
* **Layout:** responsive grid (`maxCrossAxisExtent: 340`) — 1 column on phones, up to 5 on desktop web.
* **Buying:** "Buy on Amazon" opens the exact affiliate URL — in-app browser (Custom Tabs /
  SFSafariViewController) on mobile, a new tab on web. iOS needs no extra config for `https` links;
  for Android 11+ add the `<queries>` intent for `https` to `AndroidManifest.xml` as described in the
  `url_launcher` README.
* **Disclosure:** "As an Amazon Associate we earn from qualifying purchases." is pinned at the bottom.

Deploy the web build free on Firebase Hosting:
```bash
flutter build web --release
cd .. && firebase deploy --only hosting      # serves app/build/web
```
Use that URL as the Worker's `FALLBACK_URL` and as the "link in bio".

### Tests
```bash
cd app && flutter test
```
Widget tests override the Riverpod providers with fake streams and a fake launcher, and check:
image (correct URL), title, discounted price, struck-through MRP, savings, discount badge, buy button,
disclosure; that tapping opens the exact affiliate URL; snackbar on launch failure; live updates when
the stream emits; loading, empty, error/retry states; broken-image fallback; model parsing and
rejection of non-Amazon URLs; Indian number grouping.

---

## Free-tier budget per day (default settings: 6 runs/day, 15 products, 2 posts/platform/run)

| Service | Used | Free limit |
|---|---|---|
| GitHub Actions | ~30 min | unlimited (public) / ~66 min/day (private) |
| Firestore writes | ~200–400 | 20,000 |
| Firestore reads | ~150 backend + app users | 50,000 |
| Cloudflare Worker | 1 request per comment | 100,000 requests |
| Cloudflare KV writes | 1 per DM'd comment | 1,000 |
| Meta Graph API | ~10 calls per post | rate-limited, free |

Each app user opening the feed reads up to 100 docs, so ~400 daily app opens use the Firestore
read quota. Lower `watchDeals(limit:)` if your audience grows.

## Operations notes
* GitHub **disables cron workflows in public repos after 60 days without commits**. Push any commit
  (or re-enable in the Actions tab) to keep it alive.
* GitHub may delay scheduled runs by several minutes at busy times — fine for deals.
* Page token invalid (code 190) → regenerate per META_SETUP.md §3 and update the secret.
* Many robot checks → lower `MAX_PRODUCTS` or move to the Creators API.

## What I verified vs. what you must verify
* **Ran here:** all 105 backend tests (including real headless-Chromium extraction and real ffmpeg
  rendering) and all 25 Worker tests pass.
* **Not runnable here (no Flutter SDK in my environment):** the Flutter widget tests — they run in
  `tests.yml` CI and with `flutter test` locally.
* **Can't be tested without your accounts:** live Amazon pages (selectors can drift), Meta App Review
  outcome, X billing. Do the dry run first, then enable one platform at a time.
