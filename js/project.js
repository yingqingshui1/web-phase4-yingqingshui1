(() => {
  "use strict";

  const year = document.querySelector("[data-year]");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  const statusBox = document.querySelector("[data-build-status]");
  const statusText = document.querySelector("[data-status-text]");

  if (statusBox && statusText) {
    fetch("data/status.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        statusBox.dataset.state = data.status === "online" ? "online" : "error";
        statusText.textContent = data.status === "online"
          ? `在线 · BUILD ${data.build}`
          : "构建状态异常";
        statusBox.title = data.message || "";
      })
      .catch(() => {
        statusBox.dataset.state = "error";
        statusText.textContent = "状态读取失败 · 页面内容仍可用";
      });
  }

  const copyButtons = Array.from(document.querySelectorAll("[data-copy]"));

  const legacyCopy = (text) => {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "-999px";
    document.body.appendChild(field);
    field.focus();
    field.select();
    field.setSelectionRange(0, field.value.length);

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }

    field.remove();
    return copied;
  };

  copyButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const targetId = button.dataset.copy;
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;

      const text = target.textContent.trim();
      let copied = false;

      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch (error) {
          copied = false;
        }
      }

      if (!copied) {
        copied = legacyCopy(text);
      }

      if (!copied) {
        const range = document.createRange();
        range.selectNodeContents(target);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }

      const original = button.textContent;
      button.textContent = copied ? "已复制" : "已选中，按 Ctrl+C";
      button.setAttribute("aria-label", copied ? "已复制命令" : "命令已选中，请按 Ctrl+C 复制");
      button.classList.toggle("is-copied", copied);

      window.setTimeout(() => {
        button.textContent = original;
        button.setAttribute("aria-label", "复制命令");
        button.classList.remove("is-copied");
      }, 1800);
    });
  });
})();
