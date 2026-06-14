# 실측 빠른 시작 (본인 PC)

검증 하니스의 **실제 측정**은 열린 네트워크 + 브라우저가 필요해 본인 PC에서
실행합니다. (원격 세션은 egress 허용목록 정책으로 외부 쇼핑몰·브라우저 다운로드가
막혀 실측이 불가합니다.)

## 1. 설치

```bash
git clone https://github.com/ikdd7/agentteamtest && cd agentteamtest
pip install playwright
playwright install chromium
```

## 2. 첫 실측 — 자동화 테스트용(동의된) 데모 쇼핑몰

`validation/sites_demo.json`은 **자동화 테스트 목적으로 공개된 데모 쇼핑몰**입니다
(automationexercise, practicesoftwaretesting, OpenCart/Magento/Vercel 데모, saucedemo).
이런 사이트로 첫 실측을 돌리는 건 동의·합법 범위입니다.

```bash
# 리더보드 HTML 생성
python -m validation --driver playwright --sites validation/sites_demo.json --html board.html
open board.html      # (mac) / start board.html (win) / xdg-open board.html (linux)

# 단일 머천트 진단 리포트
python -m validation --driver playwright --sites validation/sites_demo.json --diagnose automationexercise
```

진행 로그(어느 사이트가 어느 단계에서 깨졌는지)는 stderr로, 리더보드는 stdout으로
나옵니다. 이 결과가 곧 **첫 데이터이자 PR/언론용 리더보드 샘플**입니다.

## 3. 내 사이트로 측정

```json
// my_sites.json
[
  {"name": "내 쇼핑몰", "url": "https://my-shop.example.com", "query": "검색어"}
]
```

```bash
python -m validation --driver playwright --sites my_sites.json --html board.html
```

## 안전 원칙 (반드시)

- **결제는 절대 실행하지 않습니다** — 코드상 결제 폼 **도달까지만** 측정하고
  카드 입력·결제 제출 단계가 없습니다.
- **실제 머천트는 동의를 받은 곳만** 측정하세요(샌드박스/스테이징 권장). 비동의
  대량 주행은 약관·법적 리스크가 있습니다(PRD §6).
- "봇 차단(blocked)"과 "체크아웃 실패(failed)"는 분리 기록됩니다 — 측정 불가와
  실제 결함을 혼동하지 않기 위함.

## 결과 해석

- **도달률** = 결제 폼까지 퍼널 통과율(차단 주행 제외, 여러 에이전트 프로파일 중앙값)
- **완주율** = 결제 폼 도달 주행 비율
- **차단율** = 봇 차단으로 측정 불가 비율
- 진단 리포트의 **월 추정 손실 $**는 가정 입력값 기반이므로 머천트 실데이터로 교체하세요.

## 커버리지 메모

`validation/playbooks.py`의 플랫폼 플레이북(Shopify/WooCommerce/일반)으로 6단계를
시도하되, 사이트별 DOM 차이로 일부 단계에서 `element_not_found`가 날 수 있습니다 —
이는 버그가 아니라 **"에이전트가 그 사이트에서 실제로 깨진다"는 측정 결과**입니다.
커버리지를 높이려면 해당 사이트의 셀렉터를 플레이북에 추가하세요.
