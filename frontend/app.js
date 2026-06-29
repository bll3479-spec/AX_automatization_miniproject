const state = {
  categories: [],
  emails: [],
  counts: {},
  activeCategory: null,
};

const sourceSelect = document.getElementById("source-select");
const applyLabelsCheckbox = document.getElementById("apply-labels-checkbox");
const refreshBtn = document.getElementById("refresh-btn");
const summaryEl = document.getElementById("summary");
const tabsEl = document.getElementById("category-tabs");
const homeSectionsEl = document.getElementById("home-sections");
const listEl = document.getElementById("email-list");
const errorBanner = document.getElementById("error-banner");

function categoryMeta(categoryId) {
  return state.categories.find((c) => c.id === categoryId) || { label_ko: categoryId, color: "#6b7280" };
}

function showError(message) {
  if (!message) {
    errorBanner.hidden = true;
    return;
  }
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

async function loadCategories() {
  const res = await fetch("/api/categories");
  state.categories = await res.json();
}

function renderSummary() {
  summaryEl.innerHTML = "";
  const total = Object.values(state.counts).reduce((a, b) => a + b, 0);
  const totalChip = document.createElement("span");
  totalChip.className = "summary-chip";
  totalChip.style.background = "#1f2937";
  totalChip.textContent = `전체 ${total}건`;
  summaryEl.appendChild(totalChip);

  for (const cat of state.categories) {
    const count = state.counts[cat.id] || 0;
    const chip = document.createElement("span");
    chip.className = "summary-chip";
    chip.style.background = cat.color;
    chip.textContent = `${cat.label_ko} ${count}`;
    summaryEl.appendChild(chip);
  }
}

function renderTabs() {
  tabsEl.innerHTML = "";
  const allTab = document.createElement("button");
  allTab.className = "tab" + (state.activeCategory === null ? " active" : "");
  allTab.textContent = "전체";
  allTab.onclick = () => {
    state.activeCategory = null;
    renderTabs();
    render();
  };
  tabsEl.appendChild(allTab);

  for (const cat of state.categories) {
    const tab = document.createElement("button");
    tab.className = "tab" + (state.activeCategory === cat.id ? " active" : "");
    tab.textContent = cat.label_ko;
    tab.onclick = () => {
      state.activeCategory = cat.id;
      renderTabs();
      render();
    };
    tabsEl.appendChild(tab);
  }
}

function render() {
  if (state.activeCategory === null) {
    homeSectionsEl.hidden = false;
    listEl.hidden = true;
    renderHome();
  } else {
    homeSectionsEl.hidden = true;
    listEl.hidden = false;
    renderList();
  }
}

function renderHome() {
  homeSectionsEl.innerHTML = "";

  const mainCats = state.categories.filter((c) => c.is_main);
  const minorCats = state.categories.filter((c) => !c.is_main);

  const sectionsWrap = document.createElement("div");
  sectionsWrap.className = "main-sections";
  for (const cat of mainCats) {
    sectionsWrap.appendChild(renderMainSection(cat));
  }
  homeSectionsEl.appendChild(sectionsWrap);
  homeSectionsEl.appendChild(renderMinorSummary(minorCats));
}

function renderMainSection(cat) {
  const items = state.emails.filter((item) => item.result.category === cat.id);

  const section = document.createElement("section");
  section.className = "main-section-card";

  const header = document.createElement("div");
  header.className = "main-section-header";
  header.style.borderColor = cat.color;
  header.innerHTML = `
    <span class="main-section-title" style="color:${cat.color}">${escapeHtml(cat.label_ko)}</span>
    <span class="main-section-count">${items.length}건</span>
  `;
  section.appendChild(header);

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "표시할 이메일이 없습니다.";
    section.appendChild(empty);
  } else {
    for (const item of items) {
      section.appendChild(renderCard(item));
    }
  }
  return section;
}

function renderMinorSummary(minorCats) {
  const wrap = document.createElement("section");
  wrap.className = "minor-summary";

  const title = document.createElement("h2");
  title.className = "minor-summary-title";
  title.textContent = "기타 알림";
  wrap.appendChild(title);

  const items = state.emails.filter((item) =>
    minorCats.some((c) => c.id === item.result.category)
  );

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "표시할 이메일이 없습니다.";
    wrap.appendChild(empty);
    return wrap;
  }

  for (const item of items) {
    wrap.appendChild(renderMinorRow(item));
  }
  return wrap;
}

function renderMinorRow(item) {
  const meta = categoryMeta(item.result.category);
  const row = document.createElement("div");
  row.className = "minor-row";

  const tag = document.createElement("span");
  tag.className = "tag tag-sm";
  tag.style.background = meta.color;
  tag.textContent = meta.label_ko;
  row.appendChild(tag);

  const text = document.createElement("span");
  text.className = "minor-row-text";
  text.innerHTML = `<strong>${escapeHtml(item.email.subject)}</strong> · ${escapeHtml(item.email.sender)}`;
  row.appendChild(text);

  const overrideSelect = document.createElement("select");
  overrideSelect.className = "override-select override-select-sm";
  for (const cat of state.categories) {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.label_ko;
    opt.selected = cat.id === item.result.category;
    overrideSelect.appendChild(opt);
  }
  overrideSelect.onchange = async (e) => {
    await overrideCategory(item.email.id, e.target.value);
  };
  row.appendChild(overrideSelect);

  return row;
}

function renderList() {
  listEl.innerHTML = "";
  const visible = state.emails.filter(
    (item) => state.activeCategory === null || item.result.category === state.activeCategory
  );

  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "표시할 이메일이 없습니다.";
    listEl.appendChild(empty);
    return;
  }

  for (const item of visible) {
    listEl.appendChild(renderCard(item));
  }
}

function renderCard(item) {
  const meta = categoryMeta(item.result.category);

  const card = document.createElement("div");
  card.className = "email-card";

  const main = document.createElement("div");
  main.className = "email-main";
  main.innerHTML = `
    <p class="email-subject">${escapeHtml(item.email.subject)}</p>
    <p class="email-sender">${escapeHtml(item.email.sender)} · ${escapeHtml(item.email.date)}</p>
    <p class="email-snippet">${escapeHtml(item.email.snippet)}</p>
  `;

  const side = document.createElement("div");
  side.className = "email-side";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.style.background = meta.color;
  tag.textContent = meta.label_ko;
  side.appendChild(tag);

  const rule = document.createElement("span");
  rule.className = "matched-rule";
  rule.textContent = `근거: ${item.result.matched_rule} (${Math.round(item.result.confidence * 100)}%)`;
  side.appendChild(rule);

  const overrideSelect = document.createElement("select");
  overrideSelect.className = "override-select";
  for (const cat of state.categories) {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.label_ko;
    opt.selected = cat.id === item.result.category;
    overrideSelect.appendChild(opt);
  }
  overrideSelect.onchange = async (e) => {
    await overrideCategory(item.email.id, e.target.value);
  };
  side.appendChild(overrideSelect);

  card.appendChild(main);
  card.appendChild(side);
  return card;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

async function overrideCategory(emailId, category) {
  await fetch(`/api/emails/${encodeURIComponent(emailId)}/override`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category }),
  });
  await runClassify();
}

async function runClassify() {
  showError(null);
  refreshBtn.disabled = true;
  refreshBtn.textContent = "분류 중...";
  try {
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: sourceSelect.value,
        limit: 20,
        apply_labels: applyLabelsCheckbox.checked,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `요청 실패 (${res.status})`);
    }
    const data = await res.json();
    state.emails = data.emails;
    state.counts = data.counts;
    renderSummary();
    render();
  } catch (err) {
    showError(err.message);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "분류 실행";
  }
}

sourceSelect.addEventListener("change", () => {
  applyLabelsCheckbox.disabled = sourceSelect.value !== "gmail";
  if (sourceSelect.value !== "gmail") {
    applyLabelsCheckbox.checked = false;
  }
});

refreshBtn.addEventListener("click", runClassify);

(async function init() {
  applyLabelsCheckbox.disabled = true;
  await loadCategories();
  renderTabs();
  renderSummary();
  await runClassify();
})();
