# agentteamtest

개발/분석 도메인을 위한 **에이전트 팀**입니다. 두 가지 형태로 제공됩니다.

1. **Claude Code 서브에이전트** (`.claude/agents/`) — Claude Code에서 바로 호출
2. **멀티에이전트 앱** (`multiagent/`) — Claude API로 동작하는 코디네이터 기반 팀

두 형태 모두 같은 역할 구성을 공유합니다.

| 역할 | 하는 일 |
|------|---------|
| `planner` | 요구사항 분해 · 구현 계획/설계 |
| `implementer` | 설계에 따라 코드 작성 |
| `code-reviewer` / `reviewer` | 정확성 버그 · 개선점 리뷰 |
| `tester` | 테스트 전략 · 케이스 설계 |
| `analyst` | 코드/데이터 분석 · 인사이트 도출 |

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
└── __main__.py        # CLI 진입점
```
