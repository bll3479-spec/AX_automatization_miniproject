const PAGE_SIZE = 20;

const state = {
  categories: [],
  emails: [],
  counts: {},
  activeCategory: null,
  pageByKey: {},
};

function getPage(key, totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const page = Math.min(state.pageByKey[key] || 1, totalPages);
  return { page, totalPages };
}

function setPage(key, page) {
  state.pageByKey[key] = page;
  render();
}

function paginate(items, key) {
  const { page, totalPages } = getPage(key, items.length);
  const start = (page - 1) * PAGE_SIZE;
  return { pageItems: items.slice(start, start + PAGE_SIZE), page, totalPages };
}

function renderPager(key, totalPages, currentPage) {
  if (totalPages <= 1) return null;

  const pager = document.createElement("div");
  pager.className = "pager";

  const prev = document.createElement("button");
  prev.className = "pager-btn";
  prev.textContent = "이전";
  prev.disabled = currentPage === 1;
  prev.onclick = () => setPage(key, currentPage - 1);
  pager.appendChild(prev);

  for (let p = 1; p <= totalPages; p++) {
    const btn = document.createElement("button");
    btn.className = "pager-btn" + (p === currentPage ? " active" : "");
    btn.textContent = String(p);
    btn.onclick = () => setPage(key, p);
    pager.appendChild(btn);
  }

  const next = document.createElement("button");
  next.className = "pager-btn";
  next.textContent = "다음";
  next.disabled = currentPage === totalPages;
  next.onclick = () => setPage(key, currentPage + 1);
  pager.appendChild(next);

  return pager;
}

const sourceSelect = document.getElementById("source-select");
const limitSelect = document.getElementById("limit-select");
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

function selectCategory(categoryId) {
  state.activeCategory = categoryId;
  renderTabs();
  renderSummary();
  render();
}

function renderSummary() {
  summaryEl.innerHTML = "";
  const total = Object.values(state.counts).reduce((a, b) => a + b, 0);
  const totalChip = document.createElement("button");
  totalChip.type = "button";
  totalChip.className = "summary-chip" + (state.activeCategory === null ? " active" : "");
  totalChip.style.background = "#1f2937";
  totalChip.textContent = `전체 ${total}건`;
  totalChip.onclick = () => selectCategory(null);
  summaryEl.appendChild(totalChip);

  for (const cat of state.categories) {
    const count = state.counts[cat.id] || 0;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "summary-chip" + (state.activeCategory === cat.id ? " active" : "");
    chip.style.background = cat.color;
    chip.textContent = `${cat.label_ko} ${count}`;
    chip.onclick = () => selectCategory(cat.id);
    summaryEl.appendChild(chip);
  }
}

function renderTabs() {
  tabsEl.innerHTML = "";
  const allTab = document.createElement("button");
  allTab.className = "tab" + (state.activeCategory === null ? " active" : "");
  allTab.textContent = "전체";
  allTab.onclick = () => selectCategory(null);
  tabsEl.appendChild(allTab);

  for (const cat of state.categories) {
    const tab = document.createElement("button");
    tab.className = "tab" + (state.activeCategory === cat.id ? " active" : "");
    tab.textContent = cat.label_ko;
    tab.onclick = () => selectCategory(cat.id);
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
    const { pageItems, page, totalPages } = paginate(items, cat.id);
    for (const item of pageItems) {
      section.appendChild(renderCard(item));
    }
    const pager = renderPager(cat.id, totalPages, page);
    if (pager) section.appendChild(pager);
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

  const totalCount = state.emails.filter((item) =>
    minorCats.some((c) => c.id === item.result.category)
  ).length;

  if (totalCount === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "표시할 이메일이 없습니다.";
    wrap.appendChild(empty);
    return wrap;
  }

  for (const cat of minorCats) {
    wrap.appendChild(renderMinorCategoryGroup(cat));
  }
  return wrap;
}

function renderMinorCategoryGroup(cat) {
  const items = state.emails.filter((item) => item.result.category === cat.id);
  const group = document.createElement("div");
  group.className = "minor-group";
  if (items.length === 0) return group;

  const header = document.createElement("div");
  header.className = "minor-group-header";
  header.innerHTML = `<span style="color:${cat.color}">${escapeHtml(cat.label_ko)}</span><span class="minor-group-count">${items.length}건</span>`;
  group.appendChild(header);

  const { pageItems, page, totalPages } = paginate(items, cat.id);
  for (const item of pageItems) {
    group.appendChild(renderMinorRow(item));
  }
  const pager = renderPager(cat.id, totalPages, page);
  if (pager) group.appendChild(pager);
  return group;
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

  const key = state.activeCategory ?? "_all";
  const { pageItems, page, totalPages } = paginate(visible, key);
  for (const item of pageItems) {
    listEl.appendChild(renderCard(item));
  }
  const pager = renderPager(key, totalPages, page);
  if (pager) listEl.appendChild(pager);
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
        limit: limitSelect.value === "all" ? null : Number(limitSelect.value),
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
    state.pageByKey = {};
    renderSummary();
    render();
    if (data.label_apply_failures) {
      showError(
        `분류는 완료됐지만 ${data.label_apply_failures}건은 Gmail 라벨 적용에 실패했습니다. "분류 실행"을 다시 눌러 재시도해보세요.`
      );
    }
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

limitSelect.addEventListener("change", runClassify);

refreshBtn.addEventListener("click", runClassify);

(async function init() {
  applyLabelsCheckbox.disabled = true;
  await loadCategories();
  renderTabs();
  renderSummary();
  await runClassify();
})();
