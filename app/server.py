"""빈자리 레이더 서버 — 파이썬 표준 라이브러리만 사용.

실행:
    python3 -m app.server
그리고 브라우저에서 http://localhost:8000 접속.
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from . import config
from .poller import poller

_watch_lock = threading.Lock()


def _load_watches():
    try:
        with open(config.WATCHES_FILE, encoding="utf-8") as f:
            return set(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        return set()


def _save_watches(ids):
    config.DATA_DIR.mkdir(exist_ok=True)
    with open(config.WATCHES_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted(ids), f, ensure_ascii=False, indent=2)


_CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "BinjariRadar/1.0"

    def log_message(self, *args):
        pass  # 조용히

    # ---- 응답 헬퍼 ----
    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, ValueError):
            return {}

    # ---- 라우팅 ----
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/"):
            return self._api_get(path, parse_qs(parsed.query))
        return self._serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/watches":
            body = self._read_json_body()
            fid = (body.get("id") or "").strip()
            if not fid:
                return self._json({"error": "id 필요"}, 400)
            with _watch_lock:
                ids = _load_watches()
                ids.add(fid)
                _save_watches(ids)
            return self._json({"ok": True, "watches": sorted(ids)})
        return self._json({"error": "not found"}, 404)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/watches/"):
            fid = path[len("/api/watches/"):]
            with _watch_lock:
                ids = _load_watches()
                ids.discard(fid)
                _save_watches(ids)
            return self._json({"ok": True, "watches": sorted(ids)})
        return self._json({"error": "not found"}, 404)

    def _api_get(self, path, query):
        if path == "/api/facilities":
            snap = poller.snapshot()
            watches = _load_watches()
            cat = (query.get("category", [""])[0] or "").strip()
            area = (query.get("area", [""])[0] or "").strip()
            q = (query.get("q", [""])[0] or "").strip()
            only_watch = query.get("watch", ["0"])[0] == "1"
            facs = snap["facilities"]
            if cat and cat != "전체":
                facs = [f for f in facs if f["category"] == cat]
            if area and area != "전체":
                facs = [f for f in facs if f["area"] == area]
            if q:
                facs = [f for f in facs if q in f["name"] or q in f["place"]]
            if only_watch:
                facs = [f for f in facs if f["id"] in watches]
            for f in facs:
                f["watched"] = f["id"] in watches
            snap["facilities"] = facs
            snap["areas"] = sorted({f["area"] for f in poller.snapshot()["facilities"]})
            snap["categories"] = sorted({f["category"] for f in poller.snapshot()["facilities"]})
            return self._json(snap)

        if path == "/api/alerts":
            watches = _load_watches()
            alerts = poller.recent_alerts(80)
            for a in alerts:
                a["watched"] = a["id"] in watches
            return self._json({"alerts": alerts, "watch_count": len(watches)})

        if path == "/api/watches":
            return self._json({"watches": sorted(_load_watches())})

        return self._json({"error": "not found"}, 404)

    def _serve_static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        # 경로 traversal 방지
        target = (config.STATIC_DIR / path.lstrip("/")).resolve()
        if not str(target).startswith(str(config.STATIC_DIR.resolve())) or not target.is_file():
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404")
            return
        ctype = _CONTENT_TYPES.get(target.suffix, "application/octet-stream")
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    config.DATA_DIR.mkdir(exist_ok=True)
    poller.start()
    httpd = ThreadingHTTPServer((config.HOST, config.PORT), Handler)
    mode = "실시간(서울 열린데이터)" if config.SEOUL_API_KEY else "데모"
    url = f"http://localhost:{config.PORT}"
    print("=" * 56)
    print("  빈자리 레이더 — 공공 강습·시설 취소표 알림")
    print("=" * 56)
    print(f"  모드   : {mode}")
    print(f"  폴링   : {poller.interval}초마다")
    print(f"  주소   : {url}")
    print("  종료   : Ctrl+C")
    print("=" * 56)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n종료합니다.")
        poller.stop()
        httpd.shutdown()


if __name__ == "__main__":
    main()
