const enabledInput = document.getElementById("enabled");
const keyStatus = document.getElementById("keyStatus");

chrome.storage.sync.get({ enabled: true, apiKey: "", deeplKey: "" }, (v) => {
  enabledInput.checked = v.enabled;
  if (v.apiKey) {
    keyStatus.textContent = "Claude 전체 분석 사용 중 ✓";
    keyStatus.className = "key ok";
  } else if (v.deeplKey) {
    keyStatus.textContent = "DeepL 무료 번역 사용 중 ✓ (상세 분석은 Anthropic 키 필요)";
    keyStatus.className = "key ok";
  } else {
    keyStatus.textContent = "API 키가 없습니다 — 설정에서 입력해주세요";
    keyStatus.className = "key missing";
  }
});

enabledInput.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: enabledInput.checked });
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
