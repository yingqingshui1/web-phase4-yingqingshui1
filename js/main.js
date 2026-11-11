(() => {
  "use strict";

  const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
  const cards = Array.from(document.querySelectorAll("[data-category]"));
  const grid = document.querySelector("[data-work-grid]");
  const countLabel = document.querySelector("[data-visible-count]");
  const statusLabel = document.querySelector("[data-filter-status]");

  const filterNames = {
    all: "全部",
    tool: "工具",
    system: "系统"
  };

  if (filterButtons.length && grid) {
    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const filter = button.dataset.filter;
        let visible = 0;

        filterButtons.forEach((item) => {
          item.setAttribute("aria-pressed", String(item === button));
        });

        cards.forEach((card) => {
          const matches = filter === "all" || card.dataset.category === filter;
          card.hidden = !matches;
          if (matches) visible += 1;
        });

        grid.classList.toggle("is-filtering", filter !== "all");

        if (countLabel) {
          countLabel.textContent = String(visible).padStart(2, "0");
        }

        if (statusLabel) {
          statusLabel.textContent = filter === "all"
            ? `显示全部 ${visible} 个项目`
            : `已筛选：${filterNames[filter] || filter} · ${visible} 个项目`;
        }
      });
    });
  }

  const year = document.querySelector("[data-year]");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
})();
