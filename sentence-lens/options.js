const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(
  { apiKey: "", model: "claude-opus-4-8", targetLang: "한국어" },
  (v) => {
    $("apiKey").value = v.apiKey;
    $("model").value = v.model;
    $("targetLang").value = v.targetLang;
  }
);

$("save").addEventListener("click", () => {
  chrome.storage.sync.set(
    {
      apiKey: $("apiKey").value.trim(),
      model: $("model").value,
      targetLang: $("targetLang").value
    },
    () => {
      $("status").textContent = "저장되었습니다 ✓";
      setTimeout(() => { $("status").textContent = ""; }, 2000);
    }
  );
});
