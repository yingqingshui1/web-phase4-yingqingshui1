(() => {
  "use strict";

  const config = window.APP_CONFIG || {};
  const isLocalHost = ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
  const apiBase = String(
    (isLocalHost ? config.LOCAL_API_BASE_URL : config.API_BASE_URL) || ""
  ).replace(/\/+$/, "");

  const apiBaseEl = document.querySelector("[data-api-base]");
  const apiStateEl = document.querySelector("[data-api-state]");
  const form = document.querySelector("[data-task-form]");
  const titleInput = document.querySelector("#task-title");
  const prioritySelect = document.querySelector("#task-priority");
  const titleError = document.querySelector("[data-title-error]");
  const submitButton = document.querySelector("[data-submit]");
  const submitLabel = document.querySelector("[data-submit-label]");
  const toast = document.querySelector("[data-toast]");
  const countEl = document.querySelector("[data-count]");
  const stateLabel = document.querySelector("[data-state-label]");
  const refreshButton = document.querySelector("[data-refresh]");
  const retryButton = document.querySelector("[data-retry]");
  const focusFormButton = document.querySelector("[data-focus-form]");
  const taskList = document.querySelector("[data-task-list]");
  const errorMessage = document.querySelector("[data-error-message]");
  const viewElements = Array.from(document.querySelectorAll("[data-view]"));

  const state = {
    items: [],
    loading: false,
    toastTimer: null
  };

  if (apiBaseEl) {
    apiBaseEl.textContent = apiBase || "未配置 API_BASE_URL";
  }

  function setView(name) {
    viewElements.forEach((element) => {
      element.hidden = element.dataset.view !== name;
    });
    if (taskList) {
      taskList.hidden = name !== "list";
    }
  }

  function setApiState(text, tone) {
    if (!apiStateEl) return;
    apiStateEl.textContent = text;
    if (tone) {
      apiStateEl.dataset.tone = tone;
    } else {
      delete apiStateEl.dataset.tone;
    }
  }

  function setStatus(text, tone) {
    if (!stateLabel) return;
    stateLabel.textContent = text;
    if (tone) {
      stateLabel.dataset.tone = tone;
    } else {
      delete stateLabel.dataset.tone;
    }
  }

  function setCount(value) {
    if (!countEl) return;
    countEl.textContent = value === null ? "--" : String(value);
  }

  function setBusy(busy) {
    if (refreshButton) refreshButton.disabled = busy;
  }

  function showToast(message, tone = "success") {
    if (!toast) return;
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.dataset.tone = tone;
    state.toastTimer = window.setTimeout(() => {
      toast.textContent = "";
      delete toast.dataset.tone;
    }, 3600);
  }

  function showTitleError(message) {
    if (!titleError || !titleInput) return;
    titleError.textContent = message;
    titleError.hidden = false;
    titleInput.setAttribute("aria-invalid", "true");
    titleInput.focus();
  }

  function clearTitleError() {
    if (!titleError || !titleInput) return;
    titleError.hidden = true;
    titleError.textContent = "";
    titleInput.removeAttribute("aria-invalid");
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "时间未知";
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  async function apiRequest(path, options = {}) {
    if (!apiBase) {
      throw new Error("未配置后端地址，请检查 js/config.js");
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    let response;

    try {
      const headers = options.body
        ? { "Content-Type": "application/json", ...(options.headers || {}) }
        : { ...(options.headers || {}) };
      response = await fetch(apiBase + path, {
        ...options,
        headers,
        cache: "no-store",
        signal: controller.signal
      });
    } catch (error) {
      window.clearTimeout(timer);
      if (error.name === "AbortError") {
        throw new Error("请求超时（8 秒）：后端可能没有启动。");
      }
      throw new Error(`无法连接 API：${error.message}`);
    }

    window.clearTimeout(timer);
    const raw = await response.text();
    let payload;

    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch (error) {
      throw new Error(`接口返回的不是 JSON（HTTP ${response.status}）`);
    }

    if (!response.ok || !payload || payload.code !== 0) {
      throw new Error((payload && payload.msg) || `请求失败（HTTP ${response.status}）`);
    }

    return payload.data;
  }

  function renderTasks() {
    if (!taskList) return;
    taskList.replaceChildren();

    state.items.forEach((task, index) => {
      const item = document.createElement("li");
      item.className = "task-item";

      const number = document.createElement("span");
      number.className = "task-item__index";
      number.textContent = String(index + 1).padStart(2, "0");

      const content = document.createElement("div");
      const title = document.createElement("h3");
      title.className = "task-item__title";
      title.textContent = task.title;

      const meta = document.createElement("p");
      meta.className = "task-item__meta";

      const priority = document.createElement("span");
      priority.className = `priority priority--${task.priority}`;
      priority.textContent = task.priority;

      const time = document.createElement("time");
      time.dateTime = task.created_at;
      time.textContent = formatTime(task.created_at);

      const status = document.createElement("span");
      status.textContent = task.completed ? "DONE" : "OPEN";

      meta.append(priority, status, time);
      content.append(title, meta);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-btn";
      remove.textContent = "删除";
      remove.setAttribute("aria-label", `删除任务：${task.title}`);
      remove.addEventListener("click", () => deleteTask(task, remove));

      item.append(number, content, remove);
      taskList.append(item);
    });
  }

  async function loadTasks() {
    if (state.loading) return;
    state.loading = true;
    setBusy(true);
    setCount(null);
    setStatus("LOADING", "");
    setApiState("CHECKING", "");
    setView("loading");

    try {
      const data = await apiRequest("/api/tasks");
      state.items = Array.isArray(data && data.items) ? data.items : [];
      setCount(state.items.length);
      setApiState("ONLINE", "online");

      if (state.items.length === 0) {
        if (taskList) taskList.replaceChildren();
        setStatus("EMPTY", "empty");
        setView("empty");
      } else {
        renderTasks();
        setStatus("READY", "ready");
        setView("list");
      }
    } catch (error) {
      state.items = [];
      if (taskList) taskList.replaceChildren();
      setCount(null);
      setApiState("OFFLINE", "offline");
      setStatus("ERROR", "error");
      if (errorMessage) errorMessage.textContent = error.message;
      setView("error");
    } finally {
      state.loading = false;
      setBusy(false);
    }
  }

  async function deleteTask(task, button) {
    if (button.dataset.confirm !== "true") {
      button.dataset.confirm = "true";
      button.textContent = "确认删除";
      window.setTimeout(() => {
        if (button.isConnected) {
          button.dataset.confirm = "false";
          button.textContent = "删除";
        }
      }, 2800);
      return;
    }

    button.disabled = true;
    button.textContent = "删除中…";

    try {
      await apiRequest(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
      showToast(`已删除：${task.title}`);
      await loadTasks();
    } catch (error) {
      button.disabled = false;
      button.dataset.confirm = "false";
      button.textContent = "删除";
      showToast(error.message, "error");
    }
  }

  if (form && titleInput && submitButton && submitLabel) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = titleInput.value.trim();

      if (!title) {
        showTitleError("请先写一个任务标题。");
        return;
      }
      if (title.length > 100) {
        showTitleError("标题最多 100 个字符。");
        return;
      }

      clearTitleError();
      submitButton.disabled = true;
      submitLabel.textContent = "正在写入…";

      try {
        await apiRequest("/api/tasks", {
          method: "POST",
          body: JSON.stringify({
            title,
            priority: prioritySelect ? prioritySelect.value : "medium"
          })
        });
        form.reset();
        if (prioritySelect) prioritySelect.value = "medium";
        showToast("已写入 SQLite，列表已刷新。");
        await loadTasks();
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        submitButton.disabled = false;
        submitLabel.textContent = "写入 SQLite";
      }
    });

    titleInput.addEventListener("input", clearTitleError);
  }

  if (refreshButton) refreshButton.addEventListener("click", loadTasks);
  if (retryButton) retryButton.addEventListener("click", loadTasks);
  if (focusFormButton) {
    focusFormButton.addEventListener("click", () => {
      if (titleInput) {
        titleInput.focus();
        titleInput.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  const year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());

  loadTasks();
})();
