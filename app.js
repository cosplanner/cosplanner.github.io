(() => {
  "use strict";

  const planList = document.getElementById("planList");
  const planCount = document.getElementById("planCount");
  const updatedAt = document.getElementById("updatedAt");
  const searchToggle = document.getElementById("searchToggle");
  const searchPanel = document.getElementById("searchPanel");
  const searchInput = document.getElementById("searchInput");
  const emptyState = document.getElementById("emptyState");
  const errorState = document.getElementById("errorState");
  const retryButton = document.getElementById("retryButton");
  const template = document.getElementById("planCardTemplate");

  const weekday = ["일", "월", "화", "수", "목", "금", "토"];
  let allPlans = [];

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

  function formatBadgeDate(value) {
    const d = parseDateOnly(value);
    if (!d) return "일정";

    return `${d.getMonth() + 1}월 · ${weekday[d.getDay()]}요일`;
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

  function searchText(plan) {
    return normalize([
      plan.author_name,
      plan.plan_date,
      plan.event,
      plan.character,
      plan.costume,
      plan.memo,
    ].join(" "));
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
      formatBadgeDate(plan.plan_date);

    const eventBadge = fragment.querySelector(".event-badge");
    eventBadge.textContent = String(plan.event ?? "");
    eventBadge.dataset.tone = toneFor(plan.event);

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
    const q = normalize(searchInput.value);

    const filtered = q
      ? allPlans.filter((plan) => searchText(plan).includes(q))
      : allPlans;

    planList.replaceChildren();

    filtered.forEach((plan, index) => {
      planList.appendChild(createPlanCard(plan, index));
    });

    planCount.textContent = `${filtered.length}개`;
    emptyState.hidden = filtered.length !== 0;
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

  searchToggle.addEventListener("click", () => {
    const willOpen = searchPanel.hidden;
    searchPanel.hidden = !willOpen;

    if (willOpen) {
      requestAnimationFrame(() => searchInput.focus());
    } else {
      searchInput.value = "";
      render();
    }
  });

  searchInput.addEventListener("input", render);
  retryButton.addEventListener("click", loadPlans);

  loadPlans();
  window.setInterval(loadPlans, 120_000);
})();
