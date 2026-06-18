/* 평가 대상 샘플 "사진"들.
 * 실제 인물 사진은 권리/윤리 문제가 있어 프로토타입에선 무드 풍경/오브제 위주.
 * picsum.photos(저작권 프리)를 쓰되, 오프라인이면 그라데이션으로 대체된다(app.js).
 */
const SAMPLE_PHOTOS = [
  { id: 'p1',  seed: 'cafe',     caption: '햇살 드는 창가 카페' },
  { id: 'p2',  seed: 'street',   caption: '비 온 뒤 골목' },
  { id: 'p3',  seed: 'vintage',  caption: '빈티지 필름 감성' },
  { id: 'p4',  seed: 'minimal',  caption: '미니멀 화이트룸' },
  { id: 'p5',  seed: 'sea',      caption: '흐린 날 바다' },
  { id: 'p6',  seed: 'flower',   caption: '책상 위 마른 꽃' },
  { id: 'p7',  seed: 'city',     caption: '야경 도시 산책' },
  { id: 'p8',  seed: 'desk',     caption: '집중 모드 데스크' },
  { id: 'p9',  seed: 'forest',   caption: '아침 숲길' },
  { id: 'p10', seed: 'coffee',   caption: '라떼 한 잔의 여유' },
  { id: 'p11', seed: 'book',     caption: '주말의 독서' },
  { id: 'p12', seed: 'sunset',   caption: '노을 지는 옥상' },
];

/* 무드 태그 — 전부 긍정/중립만 (부정 표현 없음: 독성 회피 가드레일) */
const MOOD_TAGS = {
  분위기: ['청량한', '시크한', '따뜻한', '빈티지', '미니멀', '힙한', '러블리', '차분한'],
  스타일: ['코디 느좋', '색감 깡패', '구도 좋음', '포즈 자연스러움'],
  종합:   ['프사각', '소개팅각', '인스타 메인각'],
};

/* AI 개선 코칭 — 실행가능·긍정만 */
const AI_COACH = [
  '조명이 한 톤만 따뜻하면 무드가 한 단계 올라가요.',
  '여백을 조금 더 주면 미니멀 감성이 살아요.',
  '채도를 살짝 낮추면 빈티지 무드가 진해져요.',
  '시선을 살짝 옆으로 두면 자연스러움이 +α.',
  '배경을 한 톤 정리하면 피사체가 더 또렷해져요.',
  '대비를 조금만 높이면 시크함이 강해져요.',
];
