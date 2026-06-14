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
