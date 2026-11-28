// POST /api/survey: validate a survey response and save it to Firestore (survey_responses).
// The site itself never writes to Firestore; this function does, with the service account
// key stored as the Pages secret FIREBASE_SA (JSON). One document per email (id = SHA-256 of
// the lowercased email), so sending the survey again updates the earlier answers.
import SURVEY from "../../src/lib/survey.json";

const PROJECT = "deal-finder-d7a62";
const COLLECTION = "survey_responses";
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
// Common throwaway-mail domains.
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com",
  "10minutemail.net", "tempmail.com", "temp-mail.org", "temp-mail.io", "yopmail.com", "yopmail.net",
  "trashmail.com", "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "throwawaymail.com",
  "fakeinbox.com", "mintemail.com", "mohmal.com", "emailondeck.com", "tempmailo.com", "minuteinbox.com",
  "moakt.com", "spamgourmet.com", "mailnesia.com", "mytemp.email", "tempr.email", "discard.email",
  "burnermail.io", "inboxkitten.com", "tempinbox.com", "mailcatch.com", "linshiyouxiang.net",
]);
const RATE_LIMIT = 6; // submissions per IP per 10 minutes (per Cloudflare location)

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const fail = (error, field) => json({ ok: false, error, ...(field ? { field } : {}) }, 400);

export async function onRequestPost({ request, env, waitUntil }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail("Something went wrong. Please try again.");
  }
  if (!body || typeof body !== "object") return fail("Something went wrong. Please try again.");

  // Bots: the hidden "website" field is filled in, or the form was sent too fast.
  if (body.website || !(Number(body.elapsed) >= 4000)) return json({ ok: true });

  if (await rateLimited(request, waitUntil)) {
    return json({ ok: false, error: "Too many tries. Please wait a few minutes and try again." }, 429);
  }

  // ---- answers ----
  const answers = {};
  for (const q of SURVEY.questions) {
    const v = body.answers?.[q.id];
    if (q.type === "text") {
      const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
      if (t.length > (q.maxLength || 200)) return fail("That answer is too long.", q.id);
      if (q.required && !t) return fail("Please answer this question.", q.id);
      answers[q.id] = t;
      continue;
    }
    const list = q.type === "single" ? (v ? [v] : []) : Array.isArray(v) ? v : [];
    if (!list.every((x) => typeof x === "string" && q.options.includes(x)) || new Set(list).size !== list.length) {
      return fail("Please choose from the options.", q.id);
    }
    if (q.required && list.length === 0) return fail("Please answer this question.", q.id);
    if (q.max && list.length > q.max) return fail(`Pick up to ${q.max}.`, q.id);
    answers[q.id] = q.type === "single" ? list[0] || "" : list;
  }
  // Free text for "Other" (questions with other: true), saved as <id>_other.
  const others = {};
  for (const q of SURVEY.questions) {
    if (!q.other || !answers[q.id].includes("Other")) continue;
    const raw = body.answers?.[`${q.id}_other`];
    const t = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (t.length > 80) return fail("That answer is too long.", q.id);
    if (t) others[`${q.id}_other`] = t;
  }

  // ---- consent and email ----
  if (body.consent !== true) return fail("Please tick the box to agree.", "consent");
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const emailError = await checkEmail(email);
  if (emailError) return fail(emailError, "email");

  const source = SURVEY.sources.includes(body.source) ? body.source : "web";

  if (!env.FIREBASE_SA) return json({ ok: false, error: "The survey is not set up yet." }, 503);
  try {
    const id = await sha256(email);
    await saveResponse(env, id, {
      email,
      answers,
      others,
      source,
      consent: true,
      digest_optin: body.digest === true,
      country: request.cf?.country || "",
      version: 2,
    });
  } catch (e) {
    console.log("survey save failed", String(e));
    return json({ ok: false, error: "We couldn't save your answers. Please try again in a minute." }, 502);
  }
  return json({ ok: true });
}

export function onRequest() {
  return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}

async function checkEmail(email) {
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return "Please enter a valid email address.";
  const [local, domain] = email.split("@");
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return "Please enter a valid email address.";
  }
  if (DISPOSABLE.has(domain)) return "Please use your regular email, not a temporary one.";
  // The domain must be able to receive mail: an MX record, or (by the email standard) an A record.
  try {
    if (await hasRecord(domain, "MX")) return "";
    if (await hasRecord(domain, "A")) return "";
    return "That email domain can't receive mail. Please check for typos.";
  } catch {
    return ""; // DNS lookup itself failed: don't block the person for our problem
  }
}

async function hasRecord(name, type) {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { Accept: "application/dns-json" },
  });
  if (!r.ok) throw new Error(`dns ${r.status}`);
  const d = await r.json();
  if (d.Status === 3) return false; // NXDOMAIN
  // Null MX ("0 .") means the domain accepts no mail.
  return (d.Answer || []).some((a) => (type === "MX" ? a.type === 15 && !/^0 \.?$/.test(a.data.trim()) : a.type === 1));
}

async function rateLimited(request, waitUntil) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = new Request(`https://rate.cartcrush.internal/survey/${await sha256(ip)}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  const count = hit ? Number(await hit.text()) || 0 : 0;
  if (count >= RATE_LIMIT) return true;
  waitUntil(cache.put(key, new Response(String(count + 1), { headers: { "Cache-Control": "max-age=600" } })));
  return false;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- Firestore over REST, signed in as the service account ----
let token = { value: "", exp: 0 };

async function accessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (token.value && token.exp - 60 > now) return token.value;
  const sa = JSON.parse(env.FIREBASE_SA);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(sig)}` }),
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const d = await r.json();
  token = { value: d.access_token, exp: now + (d.expires_in || 3600) };
  return token.value;
}

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fsValue(v) {
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsValue(x)])) } };
}

async function saveResponse(env, id, data) {
  const db = `projects/${PROJECT}/databases/(default)`;
  const name = `${db}/documents/${COLLECTION}/${id}`;
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)]));
  // Update only these fields (keeps the counter), then stamp the time and count the submission.
  const write = {
    update: { name, fields },
    updateMask: { fieldPaths: Object.keys(fields) },
    updateTransforms: [
      { fieldPath: "submitted_at", setToServerValue: "REQUEST_TIME" },
      { fieldPath: "submissions", increment: { integerValue: "1" } },
    ],
  };
  const r = await fetch(`https://firestore.googleapis.com/v1/${db}/documents:commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(env)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes: [write] }),
  });
  if (!r.ok) throw new Error(`firestore ${r.status} ${(await r.text()).slice(0, 200)}`);
}
