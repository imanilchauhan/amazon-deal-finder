#!/bin/zsh
# CartCrush runner for a Mac. launchd runs this every 15 minutes (see install_mac.sh).
# Every run scrapes a small batch of Amazon deals into Firestore. Once an hour it also
# books the next posting slots in Buffer (X, Facebook, Instagram), side by side with the
# cloud job: each hourly slot is claimed in Firestore first, so they never double-post.
#
# Lives in ~/cartcrush-runner (macOS blocks background jobs from reading ~/Documents)
# and pulls the latest code from GitHub at the start of each run.
#
# Safety rails: one run at a time, quiet hours at night, and a 2-hour pause after
# Amazon shows a robot check, so the home connection doesn't get flagged.
set -u
BACKEND="${0:A:h:h}"
REPO="${BACKEND:h}"
SECRETS="${CARTCRUSH_SECRETS:-$HOME/.secrets}"
LOG_DIR="$HOME/Library/Logs/cartcrush"
LOG="$LOG_DIR/dealcheck.log"
LOCK="$LOG_DIR/dealcheck.lock"
COOLDOWN="$LOG_DIR/cooldown-until"
mkdir -p "$LOG_DIR"

log() { print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

# Keep the log small: roll it over at 5 MB.
if [[ -f "$LOG" && $(stat -f%z "$LOG") -gt 5000000 ]]; then mv -f "$LOG" "$LOG.1"; fi

now=$(date +%s)
hour=$(TZ=Asia/Kolkata date +%H)
if (( 10#$hour >= ${QUIET_FROM:-1} && 10#$hour < ${QUIET_TO:-7} )); then
  exit 0  # quiet hours (IST): no shopper traffic worth the scraping risk
fi
paused=0
if [[ -f "$COOLDOWN" ]] && (( now < $(cat "$COOLDOWN") )); then
  paused=1  # scraping paused after a robot check; posting still runs
fi
if ! mkdir "$LOCK" 2>/dev/null; then
  # A run is still going, or a crashed one left the lock. Clear locks older than 40 min.
  if [[ -n $(find "$LOCK" -maxdepth 0 -mmin +40 2>/dev/null) ]]; then rmdir "$LOCK"; mkdir "$LOCK" || exit 0
  else exit 0; fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# Self-update: pull the latest code; reinstall packages when requirements change.
old_head=$(git -C "$REPO" rev-parse HEAD 2>/dev/null)
if git -C "$REPO" pull --ff-only -q >/dev/null 2>&1; then
  new_head=$(git -C "$REPO" rev-parse HEAD)
  if [[ "$old_head" != "$new_head" ]]; then
    log "updated code ${old_head:0:7} -> ${new_head:0:7}"
    if git -C "$REPO" diff --name-only "$old_head" "$new_head" | grep -q 'backend/requirements'; then
      "$BACKEND/.venv/bin/pip" install -q -r "$BACKEND/requirements.txt" >> "$LOG" 2>&1
    fi
    rmdir "$LOCK" 2>/dev/null; trap - EXIT
    exec /bin/zsh "$0" "$@"   # run the new version of this script
  fi
fi

# Optional overrides and future keys live in the private secrets file.
if [[ -f "$SECRETS/cartcrush.env" ]]; then set -a; source "$SECRETS/cartcrush.env"; set +a; fi
# Keys kept next to the code: backend/.env (gitignored), e.g. BUFFER_API_KEY.
if [[ -f "$BACKEND/.env" ]]; then set -a; source "$BACKEND/.env"; set +a; fi

export AMAZON_MARKETPLACE="${AMAZON_MARKETPLACE:-in}"
export AMAZON_ASSOCIATE_TAG="${AMAZON_ASSOCIATE_TAG:-cartcrush004-21}"
export FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-deal-finder-d7a62}"
export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-$SECRETS/firestore-deals-ci.json}"
export MAX_PRODUCTS="${LOCAL_MAX_PRODUCTS:-8}"
export TRENDING_REFRESH_PER_RUN="${LOCAL_TRENDING_REFRESH:-3}"
export COLLECTION_REFRESH_PER_RUN="${LOCAL_COLLECTION_REFRESH:-6}"
export MIN_DISCOUNT_PCT="${MIN_DISCOUNT_PCT:-20}"
export X_ENABLED=false META_ENABLED=false DRY_RUN=false
export OUT_DIR="$LOG_DIR/out"
export PYTHONUNBUFFERED=1
# gRPC's bundled DNS resolver fails on some Macs ("DNS query cancelled"); use the system one.
export GRPC_DNS_RESOLVER=native

if [[ ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ]]; then
  log "ERROR: Firestore key not found at $GOOGLE_APPLICATION_CREDENTIALS"; exit 1
fi

cd "$BACKEND" || exit 1
if (( paused )); then
  log "scrape skipped: paused after a robot check"
else
log "run start"
RUN_LOG="$LOG_DIR/last-run.log"
"$BACKEND/.venv/bin/python" -m deal_finder > "$RUN_LOG" 2>&1
code=$?
cat "$RUN_LOG" >> "$LOG"
scraped=$("$BACKEND/.venv/bin/python" -c 'import json,sys; print(json.load(open(sys.argv[1])).get("scraped", 0))' "$OUT_DIR/summary.json" 2>/dev/null || echo 0)
# Pause only when Amazon blocked us (the run worked but scraped nothing, or the log shows a
# robot check). Other failures (network, Firestore) just retry on the next 15-minute run.
blocked=0
if (( code == 0 && scraped == 0 )); then blocked=1; fi
if grep -qiE "robot check|captcha" "$RUN_LOG"; then blocked=1; fi
if (( blocked )); then
  print $(( now + 2 * 3600 )) > "$COOLDOWN"
  log "run end: exit=$code scraped=$scraped -> Amazon robot check, pausing 2 hours"
elif (( code != 0 )); then
  log "run end: exit=$code scraped=$scraped -> failed, will retry next run"
else
  rm -f "$COOLDOWN"
  log "run end: exit=$code scraped=$scraped"
fi
fi

# Posting: at most once every 50 minutes, fill any free slot in the next 6 hours. (A stamp
# file, not the clock minute: launchd's 15-minute timer drifts and pauses while the Mac sleeps,
# so "first run after :00" missed most hours.)
POST_STAMP="$LOG_DIR/last-post-check"
post_due() {
  [[ ! -f "$POST_STAMP" ]] && return 0
  (( $(date +%s) - $(stat -f %m "$POST_STAMP") >= 3000 ))
}
if [[ "${LOCAL_POSTING:-true}" == "true" ]] && post_due; then
  touch "$POST_STAMP"
  if [[ -z "${BUFFER_API_KEY:-}" ]]; then
    log "post: skipped, BUFFER_API_KEY missing (add it to backend/.env)"
  else
    (
      export CARTCRUSH_RUNNER=mac
      export X_ENABLED=true FB_ENABLED=true IG_ENABLED=true COLLECTION_POSTS=true
      export BUFFER_CHANNEL_ID="${BUFFER_CHANNEL_ID:-6af5655a62b70b94b0040d8c}"
      export BUFFER_FB_CHANNEL_ID="${BUFFER_FB_CHANNEL_ID:-6af59bff62b70b94b006343c}"
      export BUFFER_IG_CHANNEL_ID="${BUFFER_IG_CHANNEL_ID:-6afc311fece6dfde5ff59e1e}"
      export CARDS_BASE_URL="${CARDS_BASE_URL:-https://cartcrush-cards.imanilchauhan3.workers.dev}"
      export SITE_URL="${SITE_URL:-https://cartcrush.pages.dev}"
      "$BACKEND/.venv/bin/python" -m deal_finder.post_queue 2>&1 | grep -E 'post_queue: |ERROR' >> "$LOG"
    )
  fi
fi
