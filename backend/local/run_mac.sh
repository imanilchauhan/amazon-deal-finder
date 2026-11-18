#!/bin/zsh
# CartCrush deal checker for a Mac. launchd runs this every 15 minutes (see install_mac.sh).
# It scrapes a small batch of Amazon deals and saves them to Firestore. It never posts:
# the cloud post job (every 2 h) books hourly slots from whatever is in Firestore.
#
# Safety rails: one run at a time, quiet hours at night, and a 2-hour pause after
# Amazon shows a robot check, so the home connection doesn't get flagged.
set -u
BACKEND="${0:A:h:h}"
SECRETS="$HOME/Documents/internal projects/.secrets"
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
if [[ -f "$COOLDOWN" ]] && (( now < $(cat "$COOLDOWN") )); then
  exit 0  # paused after a robot check
fi
if ! mkdir "$LOCK" 2>/dev/null; then
  # A run is still going, or a crashed one left the lock. Clear locks older than 40 min.
  if [[ -n $(find "$LOCK" -maxdepth 0 -mmin +40 2>/dev/null) ]]; then rmdir "$LOCK"; mkdir "$LOCK" || exit 0
  else exit 0; fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# Optional overrides and future keys live in the private secrets file.
if [[ -f "$SECRETS/cartcrush.env" ]]; then set -a; source "$SECRETS/cartcrush.env"; set +a; fi

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
log "run start"
"$BACKEND/.venv/bin/python" -m deal_finder >> "$LOG" 2>&1
code=$?
scraped=$("$BACKEND/.venv/bin/python" -c 'import json,sys; print(json.load(open(sys.argv[1])).get("scraped", 0))' "$OUT_DIR/summary.json" 2>/dev/null || echo 0)
# Pause only when Amazon blocked us (the run worked but scraped nothing, or the log shows a
# robot check). Other failures (network, Firestore) just retry on the next 15-minute run.
blocked=0
if (( code == 0 && scraped == 0 )); then blocked=1; fi
if tail -n 200 "$LOG" | grep -qiE "robot check|captcha"; then blocked=1; fi
if (( blocked )); then
  print $(( now + 2 * 3600 )) > "$COOLDOWN"
  log "run end: exit=$code scraped=$scraped -> Amazon robot check, pausing 2 hours"
elif (( code != 0 )); then
  log "run end: exit=$code scraped=$scraped -> failed, will retry next run"
else
  rm -f "$COOLDOWN"
  log "run end: exit=$code scraped=$scraped"
fi
