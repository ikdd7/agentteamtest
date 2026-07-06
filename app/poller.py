"""데이터 수집 + '접수중' 전환(취소표) 감지 폴러.

- SEOUL_API_KEY 가 있으면 서울 열린데이터광장 공개 API에서 실시간 수집.
- 없으면 data/demo.json 을 로드하고, 매 주기 슬롯 상태를 살짝 흔들어
  '마감 -> 접수중' 전환(취소표)이 실제로 발생하는 것처럼 보여준다.
"""
import json
import random
import threading
import time
import urllib.request
from datetime import datetime

from . import config

# 서울 API SVCSTATNM -> 내부 상태
_STATUS_MAP = {
    "접수중": "open",
    "예약마감": "full",
    "접수종료": "closed",
    "안내중": "info",
    "예약일시안내": "info",
}

_CATEGORY_KEYWORDS = [
    ("수영", "수영"),
    ("아쿠아", "수영"),
    ("테니스", "테니스"),
    ("축구", "유아체능"),
    ("체능", "유아체능"),
    ("스케이트", "유아체능"),
    ("빙상", "유아체능"),
]


def _guess_category(name, dataset_label):
    for kw, cat in _CATEGORY_KEYWORDS:
        if kw in name:
            return cat
    if dataset_label == "문화":
        return "문화강좌"
    if dataset_label == "교육":
        return "문화강좌"
    return "기타"


class Poller:
    def __init__(self):
        self.lock = threading.Lock()
        self.facilities = {}          # id -> record
        self.alerts = []              # 최근 취소표 알림 (dict), 최신순
        self.mode = "demo"
        self.last_poll = None
        self.poll_count = 0
        self.interval = config.POLL_INTERVAL_SEC or (
            60 if config.SEOUL_API_KEY else 20
        )
        self._stop = threading.Event()
        self._demo_seed = None

    # ---- 공개 인터페이스 ----
    def start(self):
        self.poll_once()  # 부팅 즉시 1회 (열자마자 데이터가 보이도록)
        t = threading.Thread(target=self._loop, daemon=True)
        t.start()

    def snapshot(self, watched_ids=None):
        with self.lock:
            facs = list(self.facilities.values())
            open_ids = {f["id"] for f in facs if f["status"] == "open"}
            return {
                "mode": self.mode,
                "last_poll": self.last_poll,
                "poll_count": self.poll_count,
                "interval": self.interval,
                "total": len(facs),
                "open_now": len(open_ids),
                "facilities": sorted(
                    facs, key=lambda f: (f["status"] != "open", f["category"], f["name"])
                ),
            }

    def recent_alerts(self, limit=50):
        with self.lock:
            return list(self.alerts[:limit])

    def stop(self):
        self._stop.set()

    # ---- 내부 ----
    def _loop(self):
        while not self._stop.wait(self.interval):
            try:
                self.poll_once()
            except Exception as exc:  # 폴링 실패는 앱을 죽이지 않는다
                print(f"[poller] 폴링 오류: {exc}")

    def poll_once(self):
        records = None
        if config.SEOUL_API_KEY:
            records = self._fetch_seoul()
        if records is None:
            records = self._fetch_demo()
            self.mode = "demo"
        else:
            self.mode = "live"

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_alerts = []
        with self.lock:
            for rec in records:
                prev = self.facilities.get(rec["id"])
                # 마감/종료 -> 접수중 전환 = 취소표!
                if prev and prev["status"] != "open" and rec["status"] == "open":
                    new_alerts.append({
                        "id": rec["id"],
                        "name": rec["name"],
                        "place": rec["place"],
                        "area": rec["area"],
                        "category": rec["category"],
                        "url": rec["url"],
                        "at": now,
                    })
                self.facilities[rec["id"]] = rec
            for a in reversed(new_alerts):
                self.alerts.insert(0, a)
            del self.alerts[config.MAX_ALERTS:]
            self.last_poll = now
            self.poll_count += 1
        if new_alerts:
            for a in new_alerts:
                print(f"[알림] 취소표 발생 → {a['name']} @ {a['place']} ({a['area']})")
        return new_alerts

    def _fetch_seoul(self):
        """서울 공개 API에서 예약 정보 수집. 실패 시 None 반환(데모로 폴백)."""
        out = []
        ok = False
        for svc, label in config.SEOUL_DATASETS:
            url = (
                f"http://openapi.seoul.go.kr:8088/{config.SEOUL_API_KEY}"
                f"/json/{svc}/1/1000/"
            )
            try:
                with urllib.request.urlopen(url, timeout=8) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
            except Exception as exc:
                print(f"[poller] {svc} 요청 실패: {exc}")
                continue
            body = payload.get(svc) or {}
            rows = body.get("row") or []
            if not rows:
                continue
            ok = True
            for r in rows:
                name = (r.get("SVCNM") or "").strip()
                if not name:
                    continue
                status = _STATUS_MAP.get((r.get("SVCSTATNM") or "").strip(), "info")
                out.append({
                    "id": (r.get("SVCID") or name).strip(),
                    "name": name,
                    "category": _guess_category(name, label),
                    "area": (r.get("AREANM") or "-").strip(),
                    "place": (r.get("PLACENM") or "-").strip(),
                    "status": status,
                    "payType": (r.get("PAYATNM") or "").strip(),
                    "target": (r.get("USETGTINFO") or "").strip(),
                    "url": (r.get("SVCURL") or "https://yeyak.seoul.go.kr").strip(),
                    "rcptBgn": (r.get("RCPTBGNDT") or "").strip(),
                    "rcptEnd": (r.get("RCPTENDDT") or "").strip(),
                })
        return out if ok else None

    def _fetch_demo(self):
        """데모 데이터 로드 후, 폴링마다 상태를 흔들어 취소표를 만들어낸다."""
        if self._demo_seed is None:
            with open(config.DATA_DIR / "demo.json", encoding="utf-8") as f:
                self._demo_seed = json.load(f)["facilities"]
        base = [dict(x) for x in self._demo_seed]

        # 부팅 첫 회는 원본 그대로. 이후 회차부터 변동을 준다.
        if self.poll_count == 0:
            return base

        current = self.facilities
        for rec in base:
            cur = current.get(rec["id"])
            rec["status"] = cur["status"] if cur else rec["status"]

        # 마감/종료 중 하나를 접수중으로 (취소표 발생)
        blocked = [r for r in base if r["status"] in ("full", "closed")]
        if blocked and random.random() < 0.7:
            random.choice(blocked)["status"] = "open"
        # 접수중 하나를 다시 마감으로 (누가 잡아감)
        opened = [r for r in base if r["status"] == "open"]
        if len(opened) > 1 and random.random() < 0.5:
            random.choice(opened)["status"] = "full"
        return base


poller = Poller()
