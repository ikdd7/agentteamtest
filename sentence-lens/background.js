// Sentence Lens — background service worker
// content.js 가 보낸 문장을 Claude API 로 분석해서 돌려준다.

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-4-8";

// 구조화된 JSON 출력 스키마 — 응답이 항상 이 형태임을 API 가 보장한다.
const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["translation", "sentence_type", "structure", "grammar_points", "words"],
  properties: {
    translation: {
      type: "string",
      description: "문장 전체의 자연스러운 번역"
    },
    sentence_type: {
      type: "string",
      description: "문장의 종류·시제·태 요약 (예: 현재완료 수동태 평서문)"
    },
    structure: {
      type: "array",
      description: "문장을 의미 단위로 잘라 각 구간의 문법적 역할을 설명",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chunk", "role", "explanation"],
        properties: {
          chunk: { type: "string", description: "원문에서 그대로 가져온 구간" },
          role: { type: "string", description: "문법적 역할 (주어, 동사, 목적어, 관계절, 부사구 등)" },
          explanation: { type: "string", description: "이 구간에 대한 한 줄 설명" }
        }
      }
    },
    grammar_points: {
      type: "array",
      description: "이 문장을 이해하는 데 핵심이 되는 문법 포인트",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["point", "explanation"],
        properties: {
          point: { type: "string", description: "문법 포인트 이름" },
          explanation: { type: "string", description: "학습자를 위한 설명" }
        }
      }
    },
    words: {
      type: "array",
      description: "학습 가치가 있는 단어·숙어 (쉬운 기능어는 제외)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["word", "pos", "meaning", "note"],
        properties: {
          word: { type: "string", description: "단어 또는 숙어 원형" },
          pos: { type: "string", description: "품사" },
          meaning: { type: "string", description: "이 문맥에서의 뜻" },
          note: { type: "string", description: "뉘앙스·용법 메모 (없으면 빈 문자열)" }
        }
      }
    }
  }
};

function buildSystemPrompt(targetLang) {
  return [
    `당신은 외국어 학습자를 돕는 언어 교사입니다. 사용자가 웹서핑 중 이해하지 못한 문장을 보내면 분석해 줍니다.`,
    `- 번역과 모든 설명은 ${targetLang}로 작성합니다.`,
    `- 원문 언어는 자동으로 판별합니다. 원문이 이미 ${targetLang}인 경우에도 문장구조와 어휘를 학습자 관점에서 분석합니다.`,
    `- structure 는 문장을 의미 단위로 순서대로 자르고, chunk 는 원문 표기를 그대로 유지합니다.`,
    `- words 에는 학습 가치가 있는 단어·숙어만 담고, 관사나 기초 전치사 같은 쉬운 기능어는 제외합니다.`
  ].join("\n");
}

async function analyzeSentence(sentence, pageContext) {
  const settings = await chrome.storage.sync.get({
    apiKey: "",
    model: DEFAULT_MODEL,
    targetLang: "한국어"
  });

  if (!settings.apiKey) {
    throw new Error("API 키가 설정되지 않았습니다. 확장 프로그램 아이콘 → 설정에서 Anthropic API 키를 입력해주세요.");
  }

  const contextLine = pageContext && pageContext.title
    ? `\n\n(참고: 이 문장은 "${pageContext.title}" 페이지에서 가져왔습니다.)`
    : "";

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(settings.targetLang || "한국어"),
      output_config: {
        format: { type: "json_schema", schema: ANALYSIS_SCHEMA }
      },
      messages: [
        {
          role: "user",
          content: `다음 문장을 분석해주세요:\n\n${sentence}${contextLine}`
        }
      ]
    })
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json();
      detail = err?.error?.message || "";
    } catch (_) { /* 본문이 JSON 이 아닐 수 있음 */ }

    if (res.status === 401) throw new Error("API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해주세요.");
    if (res.status === 429) throw new Error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
    if (res.status >= 500) throw new Error("Anthropic 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.");
    throw new Error(`분석 요청 실패 (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const data = await res.json();

  if (data.stop_reason === "refusal") {
    throw new Error("이 문장은 안전상의 이유로 분석할 수 없습니다.");
  }
  if (data.stop_reason === "max_tokens") {
    throw new Error("문장이 너무 길어 분석이 잘렸습니다. 더 짧은 문장으로 시도해주세요.");
  }

  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("API 응답에서 분석 결과를 찾지 못했습니다.");

  return JSON.parse(textBlock.text);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "analyze") {
    analyzeSentence(msg.sentence, msg.pageContext)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true; // 비동기 응답
  }
});
