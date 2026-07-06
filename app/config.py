"""빈자리 레이더 설정. 환경변수로 오버라이드 가능."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"
WATCHES_FILE = DATA_DIR / "watches.json"

# 서버
HOST = os.environ.get("RADAR_HOST", "0.0.0.0")
PORT = int(os.environ.get("RADAR_PORT", "8000"))

# 서울 열린데이터광장 공개 API 키 (없으면 데모 모드로 자동 전환)
#   발급: https://data.seoul.go.kr  →  일반 인증키(sample 키도 소량 동작)
SEOUL_API_KEY = os.environ.get("SEOUL_API_KEY", "").strip()

# 폴링 주기(초). 데모 모드는 슬롯 변화를 빨리 보여주려고 더 짧게.
POLL_INTERVAL_SEC = int(os.environ.get("RADAR_POLL_SEC", "0")) or None

# 서울 공개 API가 제공하는 예약 데이터셋 (체육/교육/문화)
SEOUL_DATASETS = [
    ("ListPublicReservationSport", "체육"),
    ("ListPublicReservationEducation", "교육"),
    ("ListPublicReservationCulture", "문화"),
]

# 최근 알림 보관 개수
MAX_ALERTS = 200
