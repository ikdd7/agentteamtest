"""검증 러너 — 사이트 × 에이전트 프로파일을 드라이버로 주행해 점수를 낸다."""

from __future__ import annotations

from collections.abc import Callable

from .driver import Driver
from .funnel import SiteRun
from .scoring import SiteScore, score_sites

# 멀티에이전트 중립성: 여러 에이전트 프로파일(user-agent 등)로 동일 사이트를 측정한다.
DEFAULT_AGENTS = [
    "ChatGPT-Operator",
    "Gemini-Agent",
    "Perplexity-Shopping",
]


def run_validation(
    sites: list[dict],
    driver: Driver,
    agents: list[str] | None = None,
    on_event: Callable[[str, dict], None] | None = None,
) -> list[SiteScore]:
    """모든 사이트를 모든 에이전트로 주행하고 SiteScore 목록을 반환한다."""
    agents = agents or DEFAULT_AGENTS
    emit = on_event or (lambda k, i: None)
    runs: list[SiteRun] = []
    for site in sites:
        for agent in agents:
            emit("run_start", {"site": site["name"], "agent": agent})
            steps = driver.run(site, agent)
            run = SiteRun(site=site["name"], agent=agent, steps=steps)
            runs.append(run)
            emit("run_done", {"site": site["name"], "agent": agent,
                              "outcome": run.outcome, "reach": run.reachability})
    return score_sites(runs)
