const PAGE_SIZE = 10;
const CLASSIFY_BATCH_SIZE = 10;
const HOME_SECTION_PREVIEW = 5;

const state = {
  categories: [],
  emails: [],
  counts: {},
  activeCategory: null,
  pageByKey: {},
  rawEmails: [],
  pendingOverrides: {},
  selectedEmailIds: new Set(),
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
const homeSectionsEl = document.getElementById("home-sections");
const listEl = document.getElementById("email-list");
const errorBanner = document.getElementById("error-banner");
const countInfoBanner = document.getElementById("count-info-banner");
const progressEl = document.getElementById("classify-progress");
const progressFillEl = document.getElementById("classify-progress-fill");
const progressTextEl = document.getElementById("classify-progress-text");
const applyOverridesBtn = document.getElementById("apply-overrides-btn");
const pendingBadgeEl = document.getElementById("pending-badge");
const toastEl = document.getElementById("toast");
const bulkActionBar = document.getElementById("bulk-action-bar");
const bulkSelectedCount = document.getElementById("bulk-selected-count");
const bulkCategorySelect = document.getElementById("bulk-category-select");
const bulkApplyBtn = document.getElementById("bulk-apply-btn");
const bulkClearBtn = document.getElementById("bulk-clear-btn");

function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.classList.add("toast-show");
}

function hideToast() {
  toastEl.classList.remove("toast-show");
  toastEl.hidden = true;
}

function toggleSelect(emailId, cardEl) {
  if (state.selectedEmailIds.has(emailId)) {
    state.selectedEmailIds.delete(emailId);
  } else {
    state.selectedEmailIds.add(emailId);
  }
  if (cardEl) cardEl.classList.toggle("selected", state.selectedEmailIds.has(emailId));
  updateBulkBar();
}

function clearSelection() {
  state.selectedEmailIds.clear();
  updateBulkBar();
}

function updateBulkBar() {
  const count = state.selectedEmailIds.size;
  bulkActionBar.hidden = count === 0;
  bulkSelectedCount.textContent = `${count}개 선택됨`;
}

function applyBulkOverride() {
  const category = bulkCategorySelect.value;
  const count = state.selectedEmailIds.size;
  const catMeta = categoryMeta(category);
  for (const emailId of state.selectedEmailIds) {
    overrideCategory(emailId, category);
  }
  state.selectedEmailIds.clear();
  updateBulkBar();
  render();
  showToast(`${count}개 메일을 '${catMeta.label_ko}'(으)로 변경 예정 — '적용'을 눌러 반영하세요.`);
}

function updatePendingUI() {
  const count = Object.keys(state.pendingOverrides).length;
  applyOverridesBtn.disabled = count === 0;
  pendingBadgeEl.hidden = count === 0;
  pendingBadgeEl.textContent = String(count);
}

function showProgress(processed, total, done) {
  if (total === 0) {
    progressEl.hidden = true;
    return;
  }
  progressEl.hidden = false;
  const pct = Math.round((processed / total) * 100);
  progressFillEl.style.width = `${pct}%`;
  progressFillEl.classList.toggle("is-done", done);
  progressTextEl.textContent = done ? `분류 완료 (${total}건)` : `${processed}/${total}건 분류 중... (${pct}%)`;
}

function hideProgress() {
  progressEl.hidden = true;
}

function countByCategory(classified) {
  const counts = {};
  for (const item of classified) {
    counts[item.result.category] = (counts[item.result.category] || 0) + 1;
  }
  return counts;
}

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
  bulkCategorySelect.innerHTML = "";
  for (const cat of state.categories) {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.label_ko;
    bulkCategorySelect.appendChild(opt);
  }
}

function selectCategory(categoryId) {
  state.activeCategory = categoryId;
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
    const preview = items.slice(0, HOME_SECTION_PREVIEW);
    for (const item of preview) {
      section.appendChild(renderCard(item));
    }
    if (items.length > HOME_SECTION_PREVIEW) {
      const more = document.createElement("button");
      more.className = "section-more-btn";
      more.textContent = `전체 ${items.length}건 보기 →`;
      more.onclick = () => selectCategory(cat.id);
      section.appendChild(more);
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

  const preview = items.slice(0, HOME_SECTION_PREVIEW);
  for (const item of preview) {
    group.appendChild(renderMinorRow(item));
  }
  if (items.length > HOME_SECTION_PREVIEW) {
    const more = document.createElement("button");
    more.className = "section-more-btn";
    more.textContent = `전체 ${items.length}건 보기 →`;
    more.onclick = () => selectCategory(cat.id);
    group.appendChild(more);
  }
  return group;
}

function renderMinorRow(item) {
  const meta = categoryMeta(item.result.category);
  const row = document.createElement("div");
  row.className = "minor-row" + (state.selectedEmailIds.has(item.email.id) ? " selected" : "");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "email-checkbox";
  checkbox.checked = state.selectedEmailIds.has(item.email.id);
  checkbox.onchange = () => toggleSelect(item.email.id, row);
  row.appendChild(checkbox);

  const text = document.createElement("span");
  text.className = "minor-row-text";
  text.innerHTML = `<strong>${escapeHtml(item.email.subject)}</strong> · ${escapeHtml(item.email.sender)}`;
  row.appendChild(text);

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
  card.className = "email-card" + (state.selectedEmailIds.has(item.email.id) ? " selected" : "");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "email-checkbox";
  checkbox.checked = state.selectedEmailIds.has(item.email.id);
  checkbox.onchange = () => toggleSelect(item.email.id, card);

  const main = document.createElement("div");
  main.className = "email-main";
  main.innerHTML = `
    <p class="email-subject">${escapeHtml(item.email.subject)}</p>
    <p class="email-sender">${escapeHtml(item.email.sender)} · ${escapeHtml(item.email.date)}</p>
    <p class="email-snippet">${escapeHtml(item.email.snippet)}</p>
  `;

  const side = document.createElement("div");
  side.className = "email-side";

  const rule = document.createElement("span");
  rule.className = "matched-rule";
  rule.textContent = `근거: ${item.result.matched_rule} (${Math.round(item.result.confidence * 100)}%)`;
  side.appendChild(rule);

  card.appendChild(checkbox);
  card.appendChild(main);
  card.appendChild(side);
  return card;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// 정정 사항은 즉시 서버로 보내지 않고 로컬에 스테이징만 한다 (Story 4.1, AD-4).
// "적용" 버튼을 눌러야 applyPendingOverrides()가 실제로 반영한다.
function overrideCategory(emailId, category) {
  state.pendingOverrides[emailId] = category;
  updatePendingUI();
}

async function applyPendingOverrides() {
  const entries = Object.entries(state.pendingOverrides);
  if (entries.length === 0) return;

  showError(null);
  applyOverridesBtn.disabled = true;
  applyOverridesBtn.textContent = "적용 중...";
  try {
    for (const [emailId, category] of entries) {
      const res = await fetch(`/api/emails/${encodeURIComponent(emailId)}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `요청 실패 (${res.status})`);
      }
    }

    // source를 다시 조회하지 않고 이미 메모리에 있는 state.rawEmails를 재사용해 재분류는 1회만 실행한다 (AD-3/AD-4).
    const classified = await classifyRawInBatches(state.rawEmails);
    state.emails = classified;
    state.counts = countByCategory(classified);
    state.pageByKey = {};
    state.pendingOverrides = {};
    renderSummary();
    render();
    hideToast();
  } catch (err) {
    showError(err.message);
  } finally {
    applyOverridesBtn.textContent = "적용";
    updatePendingUI();
  }
}

async function fetchRawEmails(source, limit) {
  const params = new URLSearchParams({ source });
  if (limit !== null) params.set("limit", String(limit));
  const res = await fetch(`/api/emails/raw?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `요청 실패 (${res.status})`);
  }
  return res.json();
}

async function classifyBatch(emails) {
  const res = await fetch("/api/classify/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emails }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `요청 실패 (${res.status})`);
  }
  const data = await res.json();
  return data.emails;
}

// 이미 가져온 이메일 목록을 일정 단위(batch)로 나눠 POST /api/classify/batch를 N회 호출하며 진행률(%)을 갱신한다 (AD-3).
async function classifyRawInBatches(rawEmails) {
  const total = rawEmails.length;
  const classified = [];
  showProgress(0, total, false);

  for (let i = 0; i < total; i += CLASSIFY_BATCH_SIZE) {
    const chunk = rawEmails.slice(i, i + CLASSIFY_BATCH_SIZE);
    const chunkResult = await classifyBatch(chunk);
    classified.push(...chunkResult);
    showProgress(classified.length, total, false);
  }

  showProgress(total, total, true);
  return classified;
}

// GET /api/emails/raw를 1회만 호출해 배치 분류한다 (AD-3).
// rawEmails를 반환값으로 돌려줘 호출자가 _classifyRun 검사 이후에 state에 기록하게 한다.
async function runClassifyBatched(source, limit) {
  const rawEmails = await fetchRawEmails(source, limit);
  const classified = await classifyRawInBatches(rawEmails);
  return { rawEmails, classified };
}

// 드롭다운을 빠르게 바꾸면 runClassify()가 중복 실행된다. 세대 카운터로
// 더 오래된 요청의 결과를 무시해 경쟁 조건을 방지한다.
let _classifyRun = 0;

async function runClassify() {
  const run = ++_classifyRun;

  showError(null);
  hideToast();
  state.pendingOverrides = {};
  state.selectedEmailIds.clear();
  updatePendingUI();
  updateBulkBar();
  refreshBtn.disabled = true;
  refreshBtn.textContent = "분류 중...";
  try {
    const source = sourceSelect.value;
    const limit = limitSelect.value === "all" ? null : Number(limitSelect.value);
    let classified;
    let counts;
    let labelApplyFailures = 0;
    let pendingRawEmails;

    if (source === "gmail" && applyLabelsCheckbox.checked) {
      // Gmail 라벨 적용은 기존 단건 /api/classify 경로를 그대로 사용한다 (하위 호환 유지).
      hideProgress();
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, limit, apply_labels: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `요청 실패 (${res.status})`);
      }
      const data = await res.json();
      classified = data.emails;
      counts = data.counts;
      labelApplyFailures = data.label_apply_failures;
      // 라벨 적용 경로도 pendingRawEmails를 통해 guard 이후 갱신한다 (배치 경로와 동일 패턴).
      pendingRawEmails = classified.map((item) => item.email);
    } else {
      const result = await runClassifyBatched(source, limit);
      classified = result.classified;
      counts = countByCategory(classified);
      pendingRawEmails = result.rawEmails;
    }

    // 이 요청이 시작된 이후 더 새로운 요청이 생겼으면 결과를 버린다.
    if (run !== _classifyRun) return;

    if (pendingRawEmails !== undefined) state.rawEmails = pendingRawEmails;
    state.emails = classified;
    state.counts = counts;
    state.pageByKey = {};
    renderSummary();
    render();
    updateCountInfoBanner();
    if (labelApplyFailures) {
      showError(
        `분류는 완료됐지만 ${labelApplyFailures}건은 Gmail 라벨 적용에 실패했습니다. "분류 실행"을 다시 눌러 재시도해보세요.`
      );
    }
  } catch (err) {
    if (run !== _classifyRun) return;
    showError(err.message);
  } finally {
    if (run === _classifyRun) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "분류 실행";
    }
  }
}

function updateCountInfoBanner() {
  const isGmail = sourceSelect.value === "gmail";
  if (!isGmail || state.emails.length === 0) {
    countInfoBanner.hidden = true;
    return;
  }
  const appCount = state.emails.length;
  countInfoBanner.hidden = false;
  countInfoBanner.innerHTML =
    `<span class="info-icon">ℹ️</span>` +
    `자봐는 <span class="info-nums">${appCount}건</span>의 개별 메일을 읽었습니다. ` +
    `Gmail 받은편지함 숫자(대화 기준)와 다를 수 있어요 — ` +
    `하나의 대화에 메일이 여러 개면 자봐는 각각 따로 셉니다.`;
}

sourceSelect.addEventListener("change", () => {
  applyLabelsCheckbox.disabled = sourceSelect.value !== "gmail";
  if (sourceSelect.value !== "gmail") {
    applyLabelsCheckbox.checked = false;
    countInfoBanner.hidden = true;
  }
  runClassify();
});

limitSelect.addEventListener("change", runClassify);

refreshBtn.addEventListener("click", runClassify);

applyOverridesBtn.addEventListener("click", applyPendingOverrides);

bulkApplyBtn.addEventListener("click", applyBulkOverride);
bulkClearBtn.addEventListener("click", () => { clearSelection(); render(); });

(async function init() {
  applyLabelsCheckbox.disabled = true;
  await loadCategories();
  renderSummary();
  await runClassify();
})();
