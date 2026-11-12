# Meta setup — publishing + Comment-to-DM webhook

Everything here is free, but App Review takes time (days to weeks). Plan for it.

## 1. Accounts
1. Convert your Instagram account to **Professional (Business or Creator)**.
2. Create a **Facebook Page** and link the Instagram account to it
   (Page → Settings → Linked accounts → Instagram).
3. Go to developers.facebook.com → **Create app** → type **Business**.
   Add products: **Facebook Login for Business**, **Instagram** (API setup with Facebook Login), **Webhooks**.

## 2. Permissions the system uses
| Permission | Used by |
|---|---|
| `pages_show_list`, `pages_read_engagement` | resolving the Page + IG account |
| `pages_manage_posts` | backend: Facebook photo/video posts |
| `instagram_basic`, `instagram_content_publish` | backend: Reels / image posts |
| `instagram_manage_comments` | Worker: receive IG comments, public reply |
| `instagram_manage_messages` | Worker: IG private reply DM |
| `pages_manage_engagement` | Worker: public reply on FB comments |
| `pages_messaging` | Worker: FB private reply DM |

While the app is in **Development** mode it only works for people who have a role on the app.
To receive comments from the public and DM them, switch the app to **Live** with **Advanced Access**
for the comment/messaging permissions. That needs **App Review** (screencast + privacy-policy URL —
your Flutter web app on Firebase Hosting can host the privacy policy page) and usually
**Business Verification**. Submit early.

## 3. Long-lived Page access token (doesn't expire)
1. Graph API Explorer → select your app → *Get User Access Token* with the permissions above.
2. Exchange for a long-lived user token:
   ```
   GET https://graph.facebook.com/v26.0/oauth/access_token
       ?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_TOKEN
   ```
3. Get the Page token (derived from a long-lived user token, it has no expiry):
   ```
   GET https://graph.facebook.com/v26.0/me/accounts?access_token=LONG_USER_TOKEN
   ```
   → copy `access_token` and `id` for your Page → `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`.
4. IG user id:
   ```
   GET https://graph.facebook.com/v26.0/PAGE_ID?fields=instagram_business_account&access_token=PAGE_TOKEN
   ```
   → `META_IG_USER_ID`.
5. Check it in the **Access Token Debugger** ("Expires: Never").

The token is invalidated if you change your Facebook password or remove the app — the backend
then logs `Graph API 400: Error validating access token` (code 190). Regenerate and update the secret.

## 4. Webhooks → Cloudflare Worker
1. Deploy the worker (README, Phase 3B) → URL `https://deal-comment-to-dm.<you>.workers.dev/webhook`.
2. App Dashboard → Webhooks:
   * Object **Instagram** → Callback URL = worker URL, Verify token = your `VERIFY_TOKEN` → subscribe field **comments**.
   * Object **Page** → same URL/token → subscribe field **feed**.
3. Subscribe the Page to your app (needed for both FB and IG events with Facebook Login):
   ```
   POST https://graph.facebook.com/v26.0/PAGE_ID/subscribed_apps?subscribed_fields=feed&access_token=PAGE_TOKEN
   ```
4. Instagram app setting: on the IG account, **Settings → Messages and content → Connected tools →
   Allow access to messages** must be ON, or private replies fail.

## 5. Platform limits worth knowing
* **One private reply per comment**, and only within **7 days** of the comment. The Worker handles
  the failure by posting a public "link in bio" reply instead.
* Users who don't follow you receive the DM in **Message Requests** — the public reply says so.
* Instagram publishing is limited per 24 h per account (check `GET /IG_USER_ID/content_publishing_limit`).
  The default 2 posts/run × 6 runs/day = 12/day stays well inside it.
* Reels: 9:16, H.264 + AAC, at least 3 s. The backend renders 1080×1920, 7 s, with a silent AAC track.
