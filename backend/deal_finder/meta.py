"""Facebook Page + Instagram professional-account publishing via the Graph API.

No public media hosting is needed in the default setup:
  * Facebook photos/videos are uploaded as multipart files.
  * Instagram Reels use the resumable upload protocol (bytes go to rupload.facebook.com).
  * Instagram *image* posts need a public JPEG URL, so IG_POST_MODE=image posts the
    Amazon product image itself (no price graphic). Reels (default) carry the graphic.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path

log = logging.getLogger(__name__)

GRAPH = "https://graph.facebook.com"
GRAPH_VIDEO = "https://graph-video.facebook.com"
RUPLOAD = "https://rupload.facebook.com/ig-api-upload"
TRANSIENT_CODES = {1, 2, 4, 17, 32, 341, 613}
RATE_LIMIT_CODES = {4, 17, 32, 613}  # request rejected before any side effect


class MetaAPIError(RuntimeError):
    def __init__(self, message: str, *, code: int | None = None, http_status: int | None = None):
        super().__init__(message)
        self.code = code
        self.http_status = http_status

    @property
    def transient(self) -> bool:
        return (self.http_status or 0) >= 500 or self.code in TRANSIENT_CODES


class MetaClient:
    def __init__(self, cfg, session=None, *, sleep=time.sleep, max_retries: int = 2,
                 poll_interval: float = 5.0, poll_timeout: float = 300.0):
        import requests

        self.cfg = cfg
        self.http = session or requests.Session()
        self._sleep = sleep
        self._max_retries = max_retries
        self._poll_interval = poll_interval
        self._poll_timeout = poll_timeout

    # ---- low level ---------------------------------------------------------
    def _url(self, path: str, base: str = GRAPH) -> str:
        return f"{base}/{self.cfg.graph_version}/{path.lstrip('/')}"

    def _request(self, method: str, url: str, *, params=None, data=None, files=None, headers=None,
                 timeout=120, idempotent: bool = True):
        """idempotent=False: only retry when Meta rate-limited the call (never on 5xx),
        so a publish/upload that may have succeeded server-side is not repeated."""
        params = dict(params or {})
        if not (headers and "Authorization" in headers):
            params["access_token"] = self.cfg.page_access_token
        attempt = 0
        while True:
            # rewind uploaded files on retry
            if files:
                for f in files.values():
                    fh = f[1] if isinstance(f, tuple) else f
                    if hasattr(fh, "seek"):
                        fh.seek(0)
            try:
                resp = self.http.request(method, url, params=params, data=data, files=files,
                                         headers=headers, timeout=timeout)
            except Exception as exc:  # network error
                err = MetaAPIError(f"network error calling Graph API: {exc}", http_status=599)
            else:
                body = _json(resp)
                if resp.status_code < 400 and not (isinstance(body, dict) and "error" in body):
                    return body
                e = (body or {}).get("error", {}) if isinstance(body, dict) else {}
                err = MetaAPIError(
                    f"Graph API {resp.status_code}: {e.get('message') or resp.text[:300]}",
                    code=e.get("code"), http_status=resp.status_code,
                )
            retry_ok = err.transient if idempotent else err.code in RATE_LIMIT_CODES
            if retry_ok and attempt < self._max_retries:
                attempt += 1
                wait = 2 ** attempt * 2
                log.warning("%s — retry %d in %ss", err, attempt, wait)
                self._sleep(wait)
                continue
            raise err

    # ---- Facebook Page -----------------------------------------------------
    def post_facebook_photo(self, image_path: Path, caption: str) -> str:
        with open(image_path, "rb") as fh:
            body = self._request(
                "POST", self._url(f"{self.cfg.page_id}/photos"),
                data={"message": caption, "published": "true"},
                files={"source": (Path(image_path).name, fh, "image/jpeg")},
                idempotent=False,
            )
        # post_id ("<page>_<post>") is what feed/comment webhooks reference
        return str(body.get("post_id") or f"{self.cfg.page_id}_{body['id']}")

    def post_facebook_video(self, video_path: Path, caption: str) -> str:
        with open(video_path, "rb") as fh:
            body = self._request(
                "POST", self._url(f"{self.cfg.page_id}/videos", base=GRAPH_VIDEO),
                data={"description": caption},
                files={"source": (Path(video_path).name, fh, "video/mp4")},
                timeout=600, idempotent=False,
            )
        return f"{self.cfg.page_id}_{body['id']}"

    # ---- Instagram ---------------------------------------------------------
    def post_instagram_reel(self, video_path: Path, caption: str) -> str:
        ig = self.cfg.ig_user_id
        container = self._request(
            "POST", self._url(f"{ig}/media"),
            data={"media_type": "REELS", "upload_type": "resumable", "caption": caption, "share_to_feed": "true"},
        )
        cid = container["id"]
        upload_uri = container.get("uri") or f"{RUPLOAD}/{self.cfg.graph_version}/{cid}"
        data = Path(video_path).read_bytes()
        self._request(
            "POST", upload_uri,
            headers={
                "Authorization": f"OAuth {self.cfg.page_access_token}",
                "offset": "0",
                "file_size": str(len(data)),
            },
            data=data, timeout=600,
        )
        self._wait_for_container(cid)
        return self._publish(cid)

    def post_instagram_image(self, image_url: str, caption: str) -> str:
        if not image_url.startswith("https://"):
            raise MetaAPIError("Instagram needs a public https JPEG URL")
        container = self._request(
            "POST", self._url(f"{self.cfg.ig_user_id}/media"),
            data={"image_url": image_url, "caption": caption},
        )
        self._wait_for_container(container["id"])
        return self._publish(container["id"])

    def _wait_for_container(self, container_id: str) -> None:
        deadline = time.monotonic() + self._poll_timeout
        while True:
            body = self._request("GET", self._url(container_id), params={"fields": "status_code,status"})
            code = body.get("status_code")
            if code == "FINISHED":
                return
            if code in {"ERROR", "EXPIRED"}:
                raise MetaAPIError(f"IG container {container_id} {code}: {body.get('status')}")
            if time.monotonic() > deadline:
                raise MetaAPIError(f"IG container {container_id} not ready after {self._poll_timeout}s")
            self._sleep(self._poll_interval)

    def _publish(self, container_id: str) -> str:
        body = self._request("POST", self._url(f"{self.cfg.ig_user_id}/media_publish"),
                             data={"creation_id": container_id}, idempotent=False)
        return str(body["id"])


def _json(resp):
    try:
        return resp.json()
    except Exception:  # noqa: BLE001
        return None
