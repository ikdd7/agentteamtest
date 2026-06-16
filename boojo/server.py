"""부조 로컬 서버 — 외부 의존 0(http.server). 판정 API + 데이터 누적 API.

GET  /            → 방문자 페이지
GET  /api/total   → 누적 데이터 수
POST /api/judge   → 호구지수 판정(저장 안 함)
POST /api/record  → 익명 금액 누적
"""

from __future__ import annotations

import json
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .app import Boojo
from .page import render

_FIELDS = ("event", "relation", "intimacy", "meal", "attended", "amount")


def _make_handler(boojo: Boojo) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _json(self, obj: dict) -> None:
            self._send(200, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8")

        def _read(self) -> dict:
            n = int(self.headers.get("Content-Length", 0))
            return json.loads(self.rfile.read(n).decode() or "{}")

        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/":
                self._send(200, render().encode(), "text/html; charset=utf-8")
            elif self.path == "/api/total":
                self._json({"total": boojo.total()})
            else:
                self._send(404, b"not found", "text/plain")

        def do_POST(self) -> None:  # noqa: N802
            try:
                d = self._read()
                args = [d[f] for f in _FIELDS]
            except (KeyError, json.JSONDecodeError):
                self._send(400, b"bad request", "text/plain")
                return
            if self.path == "/api/judge":
                self._json(asdict(boojo.judge(*args)))
            elif self.path == "/api/record":
                self._json({"sample": boojo.record(*args)})
            else:
                self._send(404, b"not found", "text/plain")

        def log_message(self, *_: object) -> None:
            pass  # 조용히

    return Handler


def serve(host: str = "127.0.0.1", port: int = 8000, path: str = "boojo_data.json") -> None:
    boojo = Boojo.create(path)
    httpd = ThreadingHTTPServer((host, port), _make_handler(boojo))
    print(f"부조 서버 실행 → http://{host}:{port}  (Ctrl+C 종료) · 데이터: {path}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n종료.")
