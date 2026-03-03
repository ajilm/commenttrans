(() => {
  let targetLang = navigator.language.split("-")[0];
  let enabled = true;
  const queue = [];
  let processing = false;

  chrome.storage.local.get(["enabled", "targetLang"], (result) => {
    if (result.enabled !== undefined) enabled = result.enabled;
    if (result.targetLang) targetLang = result.targetLang;
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) enabled = changes.enabled.newValue;
    if (changes.targetLang) {
      targetLang = changes.targetLang.newValue;
      retranslateAll();
    }
  });

  function retranslateAll() {
    queue.length = 0;
    document.querySelectorAll("#content-text[data-translated]").forEach((el) => {
      delete el.dataset.translated;
      el.classList.remove("yt-translated-comment");
      el.title = "";
      queue.push(el);
    });
    if (queue.length > 0) processQueue();
  }

  async function processQueue() {
    if (processing) return;
    processing = true;
    while (queue.length > 0) {
      const el = queue.shift();
      if (!el.isConnected || el.dataset.translated) continue;
      await translateElement(el);
      await delay(100);
    }
    processing = false;
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function translateElement(el) {
    const text = el.innerText.trim();
    if (!text) return;

    try {
      const url =
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" +
        encodeURIComponent(targetLang) +
        "&dt=t&q=" +
        encodeURIComponent(text);

      const res = await fetch(url);
      if (!res.ok) return;

      const data = await res.json();
      const detectedLang = data[2];
      if (detectedLang === targetLang) {
        el.dataset.translated = "skipped";
        return;
      }

      const translated = data[0].map((seg) => seg[0]).join("");
      if (translated) {
        el.innerText = translated;
        el.dataset.translated = "true";
        el.classList.add("yt-translated-comment");
        el.title = "Translated from " + detectedLang;
      }
    } catch (e) {
      // silently skip failed translations
    }
  }

  function handleMutations(mutations) {
    if (!enabled) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const comments = node.querySelectorAll
          ? node.querySelectorAll("#content-text:not([data-translated])")
          : [];
        if (node.id === "content-text" && !node.dataset.translated) {
          queue.push(node);
        }
        comments.forEach((el) => queue.push(el));
      }
    }
    if (queue.length > 0) processQueue();
  }

  const observer = new MutationObserver(handleMutations);
  observer.observe(document.body, { childList: true, subtree: true });
})();
