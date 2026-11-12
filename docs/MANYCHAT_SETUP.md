# Option A — ManyChat blueprint (no code)

> **Read first:** on 2 March 2026 ManyChat cut its Free plan to **25 active contacts/month and
> 4 automations**. One popular deal post can exhaust that in hours, after which automations stop.
> Use this for a quick trial; for a genuinely $0 setup at any volume use **Option B** (the
> Cloudflare Worker). Free-plan limits change often — confirm on manychat.com/pricing.

## Setup (≈15 minutes)
1. Sign up at manychat.com → **Get started with Instagram** → log in with Facebook and pick the
   Page linked to your IG professional account. Also connect **Facebook Messenger** if you want FB.
2. On Instagram: **Settings → Messages and content → Connected tools → Allow access to messages = ON**.
3. **Automation → New automation → Start from template "Auto-DM links from comments"**
   (or *Blank* → trigger **"User comments on your Post or Reel"**).
4. Trigger configuration:
   * **Which post:** *Any post or reel* (so every new deal post works automatically).
   * **Keywords:** `DEAL` (add `deal`, `Deal`, `link` if you like — matching is case-insensitive).
   * **Public reply:** ON → `Sent you a DM 📩 check your message requests!` (add 2–3 variations
     so replies don't look identical).
5. DM step (**Send Message**):
   * Text: `Here's your link 🛒 #ad As an Amazon Associate I earn from qualifying purchases.`
   * Add a **button** "Open deal" → URL.
6. The per-post link problem: ManyChat can't look up Firestore on the free plan (External Request
   is a Pro feature). Two free workarounds:
   * **Per-post automation** — set *Which post* = the specific post and paste that deal's
     affiliate link in the button. Works, but manual, and the 4-automation cap applies.
   * **Hub link** — point the button to your Flutter web app (e.g. `https://yourapp.web.app`),
     which lists every live deal with affiliate links. One automation covers every post.
7. Set **IG_POST_MODE / FB_POST_MODE** as normal in GitHub; leave the Worker undeployed
   (two systems answering the same comment would send two DMs — Meta allows only one private
   reply per comment, so the second would fail anyway).

## Test
Comment `DEAL` on a post **from a different account** than the business account. You should
get the public reply and a DM (in Requests if that account doesn't follow you).
