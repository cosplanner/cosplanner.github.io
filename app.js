(() => {
  "use strict";

  const planList = document.getElementById("planList");
  const planCount = document.getElementById("planCount");
  const updatedAt = document.getElementById("updatedAt");
  const searchToggle = document.getElementById("searchToggle");
  const searchPanel = document.getElementById("searchPanel");

  // 검색 기능은 사용하지 않음.
  if (searchToggle) searchToggle.style.display = "none";
  if (searchPanel) searchPanel.style.display = "none";
  const emptyState = document.getElementById("emptyState");
  const errorState = document.getElementById("errorState");
  const retryButton = document.getElementById("retryButton");
  const template = document.getElementById("planCardTemplate");

  const weekday = ["일", "월", "화", "수", "목", "금", "토"];
  let allPlans = [];
  let activeFilter = "all";

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR")
      .trim();
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value ?? ""));
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function parseDateOnly(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
    if (!m) return null;

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const date = new Date(year, month - 1, day, 12, 0, 0);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function formatShortDate(value) {
    const d = parseDateOnly(value);
    if (!d) return String(value ?? "");

    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");

    return `${yy}/${mm}/${dd} (${weekday[d.getDay()]})`;
  }

  function formatBadgeDate(value, eventName) {
    const d = parseDateOnly(value);
    if (!d) return String(eventName ?? "일정");

    const event = String(eventName ?? "").trim();
    return `${d.getMonth() + 1}월 ${event}(${weekday[d.getDay()]})`;
  }

  function formatGeneratedAt(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";

    return `업데이트 ${new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d)}`;
  }

  function relativeTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";

    const diffMs = Date.now() - d.getTime();
    const abs = Math.abs(diffMs);

    if (abs < 60_000) return "방금";
    if (abs < 3_600_000) return `${Math.floor(abs / 60_000)}분 전`;
    if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)}시간 전`;

    const days = Math.floor(abs / 86_400_000);
    return days < 14 ? `${days}일 전` : "";
  }

  function toneFor(text) {
    let hash = 0;

    for (const ch of String(text ?? "")) {
      hash = ((hash << 5) - hash + ch.codePointAt(0)) | 0;
    }

    return String(Math.abs(hash) % 5);
  }

  function filterKey(plan) {
    const d = parseDateOnly(plan.plan_date);
    const event = String(plan.event ?? "").trim();

    if (!d || !event) return "";

    return [
      d.getMonth() + 1,
      event,
      weekday[d.getDay()],
    ].join("|");
  }

  function filterLabel(plan) {
    const d = parseDateOnly(plan.plan_date);
    const event = String(plan.event ?? "").trim();

    if (!d || !event) return "기타";

    return `${d.getMonth() + 1}월 ${event}(${weekday[d.getDay()]})`;
  }

  function ensureFilterBar() {
    let filterBar = document.getElementById("planFilterBar");

    if (filterBar) {
      return filterBar;
    }

    filterBar = document.createElement("div");
    filterBar.id = "planFilterBar";
    filterBar.className = "plan-filter-bar";
    filterBar.setAttribute("aria-label", "플랜 필터");

    planList.parentNode.insertBefore(filterBar, planList);

    return filterBar;
  }

  function renderFilters() {
    const filterBar = ensureFilterBar();

    const items = [];
    const seen = new Set();

    for (const plan of allPlans) {
      const key = filterKey(plan);

      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);

      items.push({
        key,
        label: filterLabel(plan),
        date: parseDateOnly(plan.plan_date)?.getTime() ?? Number.MAX_SAFE_INTEGER,
      });
    }

    items.sort((a, b) => {
      if (a.date !== b.date) return a.date - b.date;
      return a.label.localeCompare(b.label, "ko-KR");
    });

    // 현재 데이터에 없어진 필터를 선택 중이었다면 전체로 복귀.
    if (
      activeFilter !== "all" &&
      !items.some((item) => item.key === activeFilter)
    ) {
      activeFilter = "all";
    }

    filterBar.replaceChildren();

    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className =
      "plan-filter-button" +
      (activeFilter === "all" ? " is-active" : "");
    allButton.textContent = "전체";
    allButton.addEventListener("click", () => {
      activeFilter = "all";
      renderFilters();
      render();
    });
    filterBar.appendChild(allButton);

    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "plan-filter-button" +
        (activeFilter === item.key ? " is-active" : "");
      button.textContent = item.label;
      button.dataset.filterKey = item.key;

      button.addEventListener("click", () => {
        activeFilter = item.key;
        renderFilters();
        render();
      });

      filterBar.appendChild(button);
    }

    filterBar.hidden = items.length === 0;
  }

  function sortPlans(plans) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return [...plans].sort((a, b) => {
      const da = parseDateOnly(a.plan_date);
      const db = parseDateOnly(b.plan_date);

      const ta = da ? da.getTime() : Number.MAX_SAFE_INTEGER;
      const tb = db ? db.getTime() : Number.MAX_SAFE_INTEGER;

      const aPast = ta < today.getTime();
      const bPast = tb < today.getTime();

      if (aPast !== bPast) return aPast ? 1 : -1;
      if (ta !== tb) return aPast ? tb - ta : ta - tb;

      return String(b.updated_at ?? "").localeCompare(
        String(a.updated_at ?? "")
      );
    });
  }

  function createPlanCard(plan, index) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".plan-card");

    card.style.animationDelay = `${Math.min(index, 8) * 18}ms`;

    const avatar = fragment.querySelector(".avatar");
    const avatarUrl = safeHttpUrl(plan.avatar_url);

    if (avatarUrl) {
      avatar.src = avatarUrl;
      avatar.alt = `${String(plan.author_name ?? "작성자")} 프로필`;

      avatar.addEventListener(
        "error",
        () => {
          avatar.removeAttribute("src");
          avatar.classList.add("avatar-fallback");
        },
        { once: true }
      );
    } else {
      avatar.classList.add("avatar-fallback");
    }

    fragment.querySelector(".author-name").textContent =
      String(plan.author_name ?? "알 수 없음");

    fragment.querySelector(".plan-relative-time").textContent =
      relativeTime(plan.updated_at);

    fragment.querySelector(".date-badge").textContent =
      formatBadgeDate(plan.plan_date, plan.event);

    // 두 번째(분홍/빨강 계열) 배지는 행사명이 아니라 장르명.
    const eventBadge = fragment.querySelector(".event-badge");
    const genre = String(plan.genre ?? "").trim();

    eventBadge.textContent = genre;

    if (genre) {
      eventBadge.hidden = false;
      eventBadge.style.display = "";
    } else {
      eventBadge.hidden = true;
      eventBadge.style.display = "none";
    }

    // 기존 data-tone을 쓰면 장르마다 색이 바뀌므로 제거.
    // 기본 CSS의 분홍/빨강 계열 배지를 그대로 사용.
    delete eventBadge.dataset.tone;

    // 핵심 수정:
    // "도로시" / "(세렌디피티)"로 나누지 않고
    // "도로시 : 세렌디피티"를 한 줄 제목으로 표시.
    const character = String(plan.character ?? "").trim();
    const costume = String(plan.costume ?? "").trim();

    fragment.querySelector(".character").textContent =
      costume ? `${character} : ${costume}` : character;

    // 기존 HTML 구조 호환용. 의상 단독 줄은 사용하지 않음.
    const costumeLine = fragment.querySelector(".costume");
    costumeLine.textContent = "";
    costumeLine.hidden = true;

    // 메모는 별도의 다음 줄.
    fragment.querySelector(".memo").textContent =
      String(plan.memo ?? "");

    const time = fragment.querySelector(".plan-date");
    time.textContent = formatShortDate(plan.plan_date);
    time.dateTime = String(plan.plan_date ?? "");

    return fragment;
  }

  function render() {
    const visiblePlans =
      activeFilter === "all"
        ? allPlans
        : allPlans.filter((plan) => filterKey(plan) === activeFilter);

    planList.replaceChildren();

    visiblePlans.forEach((plan, index) => {
      planList.appendChild(createPlanCard(plan, index));
    });

    planCount.textContent =
      activeFilter === "all"
        ? `${allPlans.length}개`
        : `${visiblePlans.length}개`;

    emptyState.hidden = visiblePlans.length !== 0;
    errorState.hidden = true;
  }

  async function loadPlans() {
    errorState.hidden = true;
    emptyState.hidden = true;
    updatedAt.textContent = "불러오는 중…";

    try {
      const response = await fetch(`./plans.json?v=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const plans = Array.isArray(data?.plans) ? data.plans : [];

      allPlans = sortPlans(plans);
      updatedAt.textContent =
        formatGeneratedAt(data?.generated_at) || "업데이트됨";

      renderFilters();
      render();
    } catch (error) {
      console.error("plans.json load failed:", error);

      allPlans = [];
      planList.replaceChildren();
      planCount.textContent = "0개";
      updatedAt.textContent = "불러오기 실패";
      emptyState.hidden = true;
      errorState.hidden = false;
    }
  }

  retryButton.addEventListener("click", loadPlans);

  loadPlans();
  window.setInterval(loadPlans, 120_000);
})();
