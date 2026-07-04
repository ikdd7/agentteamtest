const enabledInput = document.getElementById("enabled");
const keyStatus = document.getElementById("keyStatus");

chrome.storage.sync.get({ enabled: true, apiKey: "" }, (v) => {
  enabledInput.checked = v.enabled;
  if (v.apiKey) {
    keyStatus.textContent = "API 키 설정됨 ✓";
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
