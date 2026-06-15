"""빈 시장 후보 레지스트리 (리서치 확정 데이터).

각 후보의 10개 지표 점수(0~10)는 2026-06 딥다이브 리서치 결과다.
점수를 갱신(=재조사)하려면 이 파일의 숫자만 바꾸면 되고, 스케줄러가
다음 실행 때 새 총점·랭킹을 반영한다. 외부 JSON(--scores)으로 덮어쓸 수도 있다.

scores 키는 community.metrics.METRIC_KEYS 와 일치해야 한다.
"""

from __future__ import annotations

# 점수 순서: pain, population, search, identity, asymmetry,
#            stigma, whitespace, engine, monetization, ops
CANDIDATES: list[dict] = [
    {
        "key": "divorced_parent",
        "name": "양육 돌싱(비데이팅)",
        "type": "관계/정서",
        "scores": [9, 6, 7, 8, 9, 9, 9, 7, 7, 4],
        "note": "검색이 재혼·소개팅 앱으로 점령됨. 양육·재산분할·'아이에게 설명' 비데이팅 정보 커뮤는 공백. 운영(데이팅 유입 차단)이 최대 난관.",
        "sources": [
            "https://www.ilyo.co.kr/?ac=article_view&entry_id=142384",
            "https://www.dailysecu.com/news/articleView.html?idxno=37860",
        ],
    },
    {
        "key": "pregnancy_loss",
        "name": "임신상실 애도(유산·사산·중단)",
        "type": "정서",
        "scores": [10, 6, 6, 8, 8, 10, 8, 6, 4, 3],
        "note": "절실함·익명욕구 최고. 전용 커뮤 부재로 거대 맘카페에 산재(2차 고통). 임신중단=법적·정서 운영 리스크 최고.",
        "sources": [
            "https://www.seoul.co.kr/news/plan/2020/10/19/20201019001053",
            "https://www.82cook.com/entiz/read.php?num=2042934",
        ],
    },
    {
        "key": "menopause",
        "name": "갱년기(여성/남성 중년건강)",
        "type": "건강",
        "scores": [8, 9, 7, 5, 8, 7, 8, 6, 8, 6],
        "note": "거대·지속 모집단 + 또래 커뮤 공백 + 호르몬제·영양제 수익화 자연. 리스크 낮아 현실적 실행 1순위. 정체성 결집이 약점.",
        "sources": [
            "https://www.82cook.com/entiz/read.php?bn=15&num=1962932",
            "https://trost.co.kr/community/jayuu/114994833",
        ],
    },
    {
        "key": "caregiver",
        "name": "간병 보호자(영케어러·끼인세대)",
        "type": "정서",
        "scores": [9, 7, 6, 6, 8, 8, 9, 4, 6, 6],
        "note": "경쟁 공백 최대(자생 커뮤 부재). 단 자가발전 동력 약하고 콜드스타트 어려움. '공백=수요없음' 위험 검증 필요.",
        "sources": [
            "https://www.82cook.com/entiz/read.php?bn=15&num=3708750",
            "https://www.asiae.co.kr/article/2026012312045162376",
        ],
    },
    {
        "key": "petloss",
        "name": "펫로스(반려동물 사별)",
        "type": "정서",
        "scores": [9, 9, 9, 7, 6, 5, 3, 9, 9, 7],
        "note": "절실함·모집단·수익화·자가발전 최강이나 강사모·포포즈·추모앱이 선점한 레드오션. 차별화 없이는 진입 위험.",
        "sources": [
            "https://www.businesskorea.co.kr/news/articleView.html?idxno=254627",
            "https://www.82cook.com/entiz/read.php?num=3824529",
        ],
    },
    {
        "key": "elective_medical",
        "name": "단발성 고관여 의료(치아·라식)",
        "type": "의료",
        "scores": [6, 7, 9, 3, 10, 5, 6, 8, 8, 3],
        "note": "정보비대칭·검색량 최고이나 단발성 리텐션↓. 디시 갤 점유 + 의료광고법 56조가 수익화 직접 제약.",
        "sources": [
            "https://gall.dcinside.com/mgallery/board/view/?id=dental&no=34789",
            "https://casenote.kr/법령/의료법/제56조",
        ],
    },
    {
        "key": "running",
        "name": "러닝",
        "type": "취미",
        "scores": [8, 9, 9, 9, 7, 2, 1, 7, 8, 6],
        "note": "인구 폭발·정체성 강하나 스트라바·런데이·디시 러닝갤이 기록·소셜·거래 엔진을 소유(경쟁공백 거의 0).",
        "sources": [
            "https://m.dcinside.com/board/running/877223",
            "https://v.daum.net/v/20250918070600267",
        ],
    },
    {
        "key": "coffee",
        "name": "커피/홈카페",
        "type": "취미",
        "scores": [7, 8, 8, 6, 8, 2, 2, 9, 8, 7],
        "note": "자가발전·수익화 강하나 커갤+블랙워터이슈가 거래+DB+커뮤니티를 이미 통합(레드오션).",
        "sources": [
            "https://bwissue.com/",
            "https://gall.dcinside.com/mgallery/board/view/?id=coffee&no=448527",
        ],
    },
    {
        "key": "houseplant",
        "name": "반려식물(식집사)",
        "type": "취미",
        "scores": [6, 7, 6, 6, 8, 2, 3, 7, 6, 4],
        "note": "식갤+그루우 선점 + 식테크 거품 붕괴 + CITES 규제 리스크.",
        "sources": [
            "https://m.dcinside.com/board/tree/908276",
            "https://www.sisajournal.com/news/articleView.html?idxno=272760",
        ],
    },
]
