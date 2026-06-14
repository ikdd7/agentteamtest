# agentteamtest

개발/분석 도메인을 위한 **에이전트 팀**입니다. 두 가지 형태로 제공됩니다.

1. **Claude Code 서브에이전트** (`.claude/agents/`) — Claude Code에서 바로 호출
2. **멀티에이전트 앱** (`multiagent/`) — Claude API로 동작하는 코디네이터 기반 팀

> **API 키 없이 바로 쓰려면** → 아래 [3. 로컬 모드(LLM 미사용)](#3-로컬-모드-llm-미사용)로.

두 형태 모두 **전사 직군을 망라한 같은 역할 구성**을 공유합니다. 모든
에이전트는 "분석 먼저, 사고흐름을 드러내는" 공통 원칙(`SHARED_PRINCIPLES`)을
공유하되 각자의 직군에 집중합니다.

| 직군 | 에이전트 | 하는 일 |
|------|----------|---------|
| 기획 | `product` | 문제 정의 · 요구사항(PRD) · 우선순위 |
| 개발 | `planner` | 기술 설계 · 구현 단계 분해 |
| 개발 | `implementer` | 설계에 따라 코드 작성 |
| 운영 | `devops` | 배포 · CI/CD · 인프라 |
| 검증 | `reviewer` (subagent: `code-reviewer`) | 정확성 버그 · 개선점 리뷰 |
| 검증 | `tester` | 테스트 전략 · 케이스 설계 |
| 검증 | `security` | 취약점 · 위협 점검 |
| 디자인 | `ux` | 사용자 플로우 · 사용성 |
| 디자인 | `designer` | UI 비주얼 방향 · 컴포넌트 |
| 마케팅 | `marketer` | 포지셔닝 · 메시징 · GTM · 카피 |
| 문서 | `writer` | README · 가이드 문서 |
| 분석 | `analyst` | 코드/데이터 분석 · 인사이트 |

> 코디네이터(2번 LLM 팀)는 이 12직군에 `delegate`로 위임하며, 한 작업을 여러
> 직군에 동시 위임해 협업시킬 수 있습니다.

---

## 1. Claude Code 서브에이전트

`.claude/agents/`에 5종의 서브에이전트가 정의되어 있습니다. Claude Code에서
이 저장소를 열면 자동으로 인식되며, 다음처럼 호출할 수 있습니다.

```
> planner 서브에이전트로 결제 모듈 설계를 잡아줘
> 방금 바꾼 코드 code-reviewer로 리뷰해줘
```

각 에이전트는 프런트매터에 `name`, `description`, `tools`, `model`이 지정되어
있어 역할에 필요한 도구만 사용합니다. `description`에 적힌 상황에서는 Claude가
알아서(proactively) 위임하기도 합니다.

서브에이전트 목록 확인·관리는 Claude Code에서 `/agents` 명령으로 할 수 있습니다.

---

## 2. 멀티에이전트 앱

코디네이터 에이전트가 작업을 분석해 `delegate` 도구로 전문 에이전트에게
하위 작업을 위임하고, 결과를 종합합니다. (Claude API 기반, Python)

### 설치

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
```

### 실행

```bash
# 인자로 작업 전달
python -m multiagent "URL 단축 서비스를 설계하고 핵심 로직을 구현한 뒤 리뷰해줘"

# 표준 입력으로 전달
echo "다음 함수의 버그를 분석해줘: def div(a,b): return a/b" | python -m multiagent
```

진행 상황(어느 에이전트에게 위임했는지)은 stderr로, 최종 결과는 stdout으로
출력됩니다.

### 코드로 사용

```python
from multiagent import Orchestrator

team = Orchestrator()
answer = team.run("재고 관리 API를 설계하고 테스트 계획까지 세워줘")
print(answer)
```

### 동작 방식

```
사용자 작업
   │
   ▼
코디네이터 (claude-opus-4-8) ──delegate──▶ planner
   │  도구 호출 루프         ──delegate──▶ implementer
   │                        ──delegate──▶ reviewer / tester / analyst
   ▼
최종 종합 답변
```

- 코디네이터는 `delegate(agent, task, context)` 도구만 사용합니다.
- 하네스(`orchestrator.py`)가 도구 호출을 받아 해당 전문 에이전트를 별도
  Claude 호출로 실행하고 결과를 돌려줍니다.
- 독립적인 하위 작업은 한 턴에 여러 개 위임해 병렬 처리할 수 있습니다.
- 모델은 어댑티브 thinking을 사용하며, 전문 에이전트는 역할별 `effort`로
  비용/품질을 조절합니다.

### 구조

```
multiagent/
├── __init__.py        # 공개 API (Orchestrator, TEAM, Agent)
├── agents.py          # 전문 에이전트 페르소나 정의
├── orchestrator.py    # 코디네이터 + delegate 도구 + 위임 실행 루프
├── local.py           # LLM 미사용 로컬 도구 기반 에이전트 (아래 3번)
└── __main__.py        # CLI 진입점
```

---

## 3. 로컬 모드 (LLM 미사용)

API 키도, 네트워크도 필요 없습니다. 각 에이전트가 LLM 대신 **결정론적 로컬
도구**로 실제 작업을 수행합니다. (`multiagent/local.py`, stdlib만 사용. ruff·
pytest가 설치돼 있으면 자동 활용)

```bash
python -m multiagent.local analyst .          # 파일/언어 통계, 라인 수, TODO 스캔
python -m multiagent.local reviewer multiagent/   # ruff(없으면 내장 규칙)로 정적 점검
python -m multiagent.local tester .           # 테스트 탐지 후 pytest 실행
python -m multiagent.local planner "URL 단축 서비스"   # 표준 개발 체크리스트 생성
python -m multiagent.local implementer src/new_module.py   # 모듈 스캐폴드 생성
python -m multiagent.local all .              # analyst+reviewer+tester 종합
```

| 에이전트 | 입력 | 하는 일 (LLM 없이) |
|----------|------|--------------------|
| `analyst` | 경로 | 파일 수·언어별 분포·총 라인·큰 파일 Top5·TODO 스캔 |
| `reviewer` | 경로 | `ruff check` 실행, 없으면 내장 규칙(bare except, 가변 기본 인자, `== None`, 긴 라인 등) |
| `tester` | 경로 | `test_*.py` 탐지 → `pytest -q` 실행·결과 보고 |
| `planner` | 작업 설명 | 표준 개발 단계 체크리스트 템플릿 |
| `implementer` | 새 파일 경로 | `.py` 모듈 스캐폴드 생성(기존 파일은 덮어쓰지 않음) |

로컬 모드는 결정론적 도구로 처리 가능한 직군(`analyst`/`reviewer`/`tester`/
`planner`/`implementer`)만 지원합니다. 추론이 필요한 직군(`product`/`ux`/
`designer`/`marketer`/`writer`/`security`/`devops`)은 LLM 팀(2번)에서만
동작합니다.

LLM 기반 팀(2번)과 로컬 팀(3번)은 같은 역할 이름을 공유하므로, 키가 없을 땐
3번으로 동작을 확인하고 키가 있을 땐 2번으로 전 직군 추론까지 맡길 수 있습니다.

---

## 4. 구독 기반 (CLI 백엔드, API 키 미사용)

**API 키 없이도 전 직군이 실제로 동작합니다.** Anthropic SDK 대신 로컬에 설치된
`claude` CLI 를 `-p`(비대화) 모드로 호출해, **로그인된 구독(Claude Max/Pro)**
계정으로 추론합니다. (`multiagent/cli_team.py`)

전제: `claude` CLI 설치 + 로그인(`claude` 한 번 실행해 로그인) 되어 있을 것.
`ANTHROPIC_API_KEY` 는 필요 없습니다.

### 실행

```bash
# 코디네이터가 팀을 자동 구성 → 각 직군 claude -p 실행 → 종합
python -m multiagent.cli_team "할 일 앱을 전 직군이 협업해 기획·구현해줘"

# 직군을 직접 지정 (코디네이터의 팀 구성 단계를 건너뜀)
python -m multiagent.cli_team --agents product,ux,marketer "랜딩페이지 만들기"

# 모델 지정 (기본 sonnet — 구독 플랜에 맞춰)
python -m multiagent.cli_team --model opus "..."
```

### 동작 방식

```
사용자 작업
   │
   ▼
팀 리드(claude -p) ── plan ──▶ 어느 직군에 무엇을 맡길지 JSON 계획
   │
   ├─ claude -p (product)   ┐
   ├─ claude -p (ux)        │ 스레드 병렬 실행
   ├─ claude -p (marketer)  ┘  (각자 agents.py 페르소나를 --append-system-prompt)
   ▼
팀 리드(claude -p) ── 종합 ──▶ 최종 결과
```

- 2번(SDK)과 **동일한 12직군 페르소나**(`agents.py`의 `TEAM`)를 그대로 사용합니다.
- 키 대신 구독으로 인증하므로, 위 스크린샷처럼 여러 에이전트를 구독으로 돌리는
  구조와 같은 맥락입니다(여기선 tmux 패널 대신 `claude -p` 프로세스로 병렬화).

---

## 5. Peer-to-peer (에이전트끼리 @멘션 대화, API 미사용)

4번이 팀 리드 중심의 fan-out이라면, 5번은 **에이전트들이 서로 직접 메시지를
주고받는** 구조입니다. 각 에이전트가 자기 대화 히스토리를 갖고, 응답에 `@이름`을
적으면 그 팀원에게 메시지가 라우팅됩니다. (구독 `claude` CLI, 키 미사용 —
`multiagent/p2p.py`)

```bash
python -m multiagent.p2p --agents implementer,reviewer "add(a,b) 구현하고 리뷰까지"
python -m multiagent.p2p --agents product,ux,implementer --max-calls 8 "할 일 앱"
```

실제 실행 로그(메시지 흐름) 예시:

```
@user       → @team-lead
@team-lead  → @implementer      # 리드가 분배
@team-lead  → @reviewer
@implementer → @reviewer        # 에이전트끼리 직접 대화(@멘션)
@reviewer   → @team-lead        # 리드로 보고
team-lead: FINAL 종합
```

- 상태 없는 `claude -p` 위에 액터 모델(메시지 큐 + 받은편지함)을 얹습니다.
- 멘션이 없는 응답은 `@team-lead` 에게 보고가 올라갑니다.
- `--max-calls` 로 총 `claude` 호출 수(=구독 사용량)를 제한합니다(기본 10).
- 리드가 `FINAL:` 줄을 내면 종료합니다.

### 다섯 가지 사용 방식 비교

| 방식 | 진입점 | 인증 | 구조 | 전 직군 |
|------|--------|------|------|---------|
| SDK 팀 | `multiagent` | `ANTHROPIC_API_KEY` | 코디네이터 fan-out (tool_use) | ✅ |
| 구독 CLI 팀 | `multiagent.cli_team` | `claude` 로그인 | 코디네이터 fan-out | ✅ |
| **Peer-to-peer** | `multiagent.p2p` | `claude` 로그인 | **에이전트 간 @멘션 대화** | ✅ |
| 로컬 도구 | `multiagent.local` | 불필요 | 단발 도구 실행 | ❌ (5직군) |
| Claude Code 서브에이전트 | `.claude/agents/` | Claude Code | 메인 세션이 위임 | ✅ |

---

## 6. 검증 하니스 (`validation/`) — "Agent Checkout Index" 14일 검증

이 에이전트 팀으로 **시장 리서치 → 아이디어 발굴 → 전 직군 95점 검증**을 거쳐
도출한 제품 아이디어("AI 쇼핑 에이전트가 실제로 결제를 완주하는지 측정하는 중립
인덱스")의 **빌드 전 검증 실험**을 실제 코드로 구현한 것.

핵심 전제 — *"에이전트 결제가 자주 깨진다"* — 를 데이터로 확인하고 첫 리더보드를
만든다. **법적 안전 원칙: 결제 폼 도달까지만 측정(결제 미실행), "봇 차단"과
"체크아웃 실패"를 분리, 실측은 동의 사이트 한정.**

```bash
python -m validation                    # mock 데모 (네트워크 0, 로직 검증용)
python -m validation --out report.md    # 리더보드 → report.md + report.csv
python -m validation --html board.html  # 공개 리더보드(공유용 단독 HTML)
python -m validation --driver playwright --sites my_sites.json   # 실측(본인 PC)
```

Phase 1 산출물인 **공개 "Agent-Readiness 리더보드"**(`validation/leaderboard.py`)는
외부 의존 없는 자체완결 HTML 한 페이지로, GTM·PR 인바운드 엔진이다.

구조:

```
validation/
├── funnel.py      # 퍼널(로드→상품→장바구니→체크아웃→결제폼) + 결과 모델
├── driver.py      # MockDriver(데모) · CheckoutEngine · PlaywrightDriver(실측, 결제 미실행)
├── playbooks.py   # 플랫폼(Shopify/Woo/일반) 감지 + 단계별 셀렉터 + 차단 신호
├── scoring.py     # 멀티에이전트 집계: 도달률 중앙값 + 차단율 분리
├── report.py      # 리더보드(md/csv) + 핵심 전제 합격 판정
├── leaderboard.py # 공개 리더보드(공유용 단독 HTML)
├── diagnostic.py  # 머천트 진단 리포트(손실 추정 + 수정 가이드)
├── runner.py      # 사이트 × 에이전트 주행 오케스트레이션
└── __main__.py    # CLI (--out / --html / --diagnose)
```

- **멀티에이전트 중립성**(여러 에이전트 프로파일로 측정)이 해자라, 기본으로 여러
  에이전트로 같은 사이트를 주행해 집계한다.
- mock 데모는 12개 샘플 사이트로 리더보드 + 전제 판정을 즉시 보여준다(실측 아님).
- 실측 `PlaywrightDriver`는 결제 폼 도달까지만 수행하며 결제 제출 단계가 **없다**.
- **본인 PC 실측 빠른 시작:** [`docs/QUICKSTART-실측.md`](docs/QUICKSTART-실측.md)
  (`validation/sites_demo.json` = 자동화 테스트용 동의 데모 쇼핑몰).
