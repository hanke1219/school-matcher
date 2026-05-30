const TAGS = ["英語教育", "留学機会", "中高一貫"];
const SLOT_LABELS = { AM: "午前", PM: "午後", FULL: "全日" };
const SLOT_ORDER = { AM: 1, PM: 2, FULL: 3 };

const form = document.querySelector("#studentForm");
const hensachi = document.querySelector("#hensachi");
const hensachiValue = document.querySelector("#hensachiValue");
const homeAddress = document.querySelector("#homeAddress");
const tagOptions = document.querySelector("#tagOptions");
const examDateOptions = document.querySelector("#examDateOptions");
const tagTemplate = document.querySelector("#tagTemplate");
const resultTable = document.querySelector("#resultTable");
const cards = document.querySelector("#cards");
const resultSummary = document.querySelector("#resultSummary");
const shareButton = document.querySelector("#shareButton");
const refreshButton = document.querySelector("#refreshButton");
const refreshReport = document.querySelector("#refreshReport");
const selectedPlan = document.querySelector("#selectedPlan");
const conflictBox = document.querySelector("#conflictBox");
const planSummary = document.querySelector("#planSummary");
const copyPlanButton = document.querySelector("#copyPlanButton");

const selectedSessionIds = new Set();
let sessionIndex = new Map();
let latestResults = [];
let selectedExamDateFilter = new Set();
let deepReportCache = new Map();
let refreshReportLoaded = false;
let refreshReportVisible = false;
let noChangeTimer = null;

function setupTags() {
  TAGS.forEach((tag) => {
    const node = tagTemplate.content.cloneNode(true);
    const input = node.querySelector("input");
    const label = node.querySelector("span");
    input.value = tag;
    input.checked = true;
    label.textContent = tag;
    tagOptions.appendChild(node);
  });
}

function readStudent() {
  return {
    hensachi: Number(hensachi.value),
    home_address: homeAddress.value.trim(),
    tags: [...document.querySelectorAll("#tagOptions input:checked")].map((item) => item.value),
    expected_type: document.querySelector('input[name="schoolType"]:checked').value,
    exam_dates: [...selectedExamDateFilter],
  };
}

function createTag(text, className) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function createLinkTag(text, href, className) {
  if (!href) return createTag(text, className);
  const link = document.createElement("a");
  link.className = className;
  link.textContent = text;
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function formatDate(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
}

function formatDateShort(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function formatHensachi(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function slotLabel(slot) {
  return SLOT_LABELS[slot] || slot;
}

function statusClass(status = "") {
  if (status.includes("公式")) return "status-badge is-confirmed";
  if (status.includes("要") || status.includes("未定") || status.includes("参考")) return "status-badge is-pending";
  return "status-badge";
}

function formatOptionalDate(value) {
  return value && value !== "未定" ? value : "未定";
}

async function setupExamDateFilter() {
  const response = await fetch("/api/schools");
  const data = await response.json();
  const dates = [...new Set(data.schools.flatMap((school) => school.exam_sessions.map((session) => session.exam_date)))].sort();

  examDateOptions.replaceChildren();
  dates.forEach((date) => {
    const label = document.createElement("label");
    label.className = "chip date-chip";
    label.innerHTML = `<input type="checkbox" value="${date}" /><span>${formatDateShort(date)}</span>`;
    label.querySelector("input").addEventListener("change", (event) => {
      if (event.target.checked) {
        selectedExamDateFilter.add(date);
      } else {
        selectedExamDateFilter.delete(date);
      }
      updateResults();
    });
    examDateOptions.appendChild(label);
  });
}

function sessionsConflict(left, right) {
  if (left.exam_date !== right.exam_date) return false;
  return left.slot === right.slot || left.slot === "FULL" || right.slot === "FULL";
}

function getSelectedSessions() {
  return [...selectedSessionIds]
    .map((id) => sessionIndex.get(id))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.exam_date !== b.exam_date) return a.exam_date.localeCompare(b.exam_date);
      return (SLOT_ORDER[a.slot] || 9) - (SLOT_ORDER[b.slot] || 9);
    });
}

function findConflicts(sessions) {
  const conflicts = [];
  sessions.forEach((left, leftIndex) => {
    sessions.slice(leftIndex + 1).forEach((right) => {
      if (sessionsConflict(left, right)) {
        conflicts.push([left, right]);
      }
    });
  });
  return conflicts;
}

function indexSessions(results) {
  sessionIndex = new Map();
  results.forEach((item) => {
    item.school.exam_sessions.forEach((session) => {
      sessionIndex.set(session.id, {
        ...session,
        school_id: item.school.id,
        school_name: item.school.name,
        homepage_url: item.school.homepage_url,
      });
    });
  });
}

function renderTable(results) {
  resultTable.replaceChildren();
  results.forEach((item, index) => {
    const school = item.school;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><strong>${school.name}</strong><br><span class="meta">${school.nearest_station}｜${school.address}</span></td>
      <td>${formatHensachi(school.hensachi)}</td>
      <td>${school.type}</td>
      <td>${item.commute_minutes} 分</td>
      <td><span class="score-badge">${item.score}</span></td>
    `;
    resultTable.appendChild(tr);
  });
}

function renderScoreDetails(item) {
  const details = document.createElement("div");
  details.className = "score-details";
  details.hidden = true;

  const breakdown = document.createElement("div");
  breakdown.className = "breakdown";
  breakdown.append(
    createTag(`偏差値 ${item.breakdown.hensachi}`, "point"),
    createTag(`通学 ${item.breakdown.commute}`, "point"),
    createTag(`希望 ${item.breakdown.tags}`, "point"),
    createTag(`種別 ${item.breakdown.type}`, "point"),
  );

  const reasonList = document.createElement("div");
  reasonList.className = "reason-list";
  item.reasons.forEach((reason) => reasonList.appendChild(createTag(reason, "reason")));

  details.append(breakdown, reasonList);
  return details;
}

function renderExamSessions(school) {
  const wrapper = document.createElement("section");
  wrapper.className = "exam-block";

  const title = document.createElement("div");
  title.className = "exam-title";
  title.innerHTML = `<strong>入試日程・回次別偏差値</strong><span>${school.exam_sessions.length} 回次</span>`;

  const list = document.createElement("div");
  list.className = "exam-session-list";

  school.exam_sessions.forEach((session) => {
    const selected = selectedSessionIds.has(session.id);
    const dateFilteredOut = selectedExamDateFilter.size > 0 && !selectedExamDateFilter.has(session.exam_date);
    const fullSession = sessionIndex.get(session.id);
    const hasConflict = selected && getSelectedSessions().some((other) => other.id !== session.id && sessionsConflict(fullSession, other));

    const label = document.createElement("label");
    label.className = `exam-session${selected ? " is-selected" : ""}${hasConflict ? " is-conflict" : ""}${dateFilteredOut ? " is-dimmed" : ""}`;
    label.innerHTML = `
      <input type="checkbox" value="${session.id}" ${selected ? "checked" : ""} />
      <span class="exam-main">
        <strong>${formatDate(session.exam_date)} ${slotLabel(session.slot)}</strong>
        <span>${session.name}</span>
      </span>
      <span class="exam-score">80% ${session.sapix_girls_80 ?? session.hensachi} / 50% ${session.sapix_girls_50 ?? "-"}</span>
      <span class="exam-apply">
        出願 ${formatOptionalDate(session.application_start)} - ${formatOptionalDate(session.application_end)}
        ｜合格発表 ${formatOptionalDate(session.result_date)}
        ｜手続 ${formatOptionalDate(session.procedure_deadline)}
      </span>
    `;
    const status = document.createElement("span");
    status.className = statusClass(session.check_status);
    status.textContent = session.check_status || "確認中";
    label.appendChild(status);
    if (session.source_url) {
      const source = document.createElement("a");
      source.className = "exam-source";
      source.href = session.source_url;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = "要項";
      source.addEventListener("click", (event) => event.stopPropagation());
      label.appendChild(source);
    }
    label.querySelector("input").addEventListener("change", (event) => {
      if (event.target.checked) {
        selectedSessionIds.add(session.id);
      } else {
        selectedSessionIds.delete(session.id);
      }
      renderCards(latestResults);
      renderPlan();
    });
    list.appendChild(label);
  });

  wrapper.append(title, list);
  return wrapper;
}

function getDeepReportId(school) {
  return school.deep_report_id || school.reportId || "";
}

async function loadDeepReport(reportId) {
  if (!reportId) return null;
  if (deepReportCache.has(reportId)) return deepReportCache.get(reportId);

  const response = await fetch(`/static/data/reports/${reportId}.json`);
  if (!response.ok) throw new Error("深度报告读取失败");
  const report = await response.json();
  deepReportCache.set(reportId, report);
  return report;
}

function createListBlock(title, items, className = "report-list-block") {
  const section = document.createElement("section");
  section.className = className;
  const heading = document.createElement("h4");
  heading.textContent = title;
  const list = document.createElement("div");
  list.className = "mini-list";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "mini-item";
    if (typeof item === "string") {
      row.textContent = item;
    } else {
      row.innerHTML = `<strong>${item.title || item.label}</strong><span>${item.detail || item.reason}</span>`;
    }
    list.appendChild(row);
  });
  section.append(heading, list);
  return section;
}

function renderReportSummary(report) {
  const section = document.createElement("section");
  section.className = "deep-report-summary";
  section.innerHTML = `
    <div>
      <p class="eyebrow">Deep Report</p>
      <h4>${report.overallMatch?.label || "深度报告あり"}｜${report.overallMatch?.score || "-"} / 100</h4>
      <p>${report.summary}</p>
    </div>
  `;

  const pills = document.createElement("div");
  pills.className = "report-pill-row";
  report.fitStudentTypes?.slice(0, 3).forEach((item) => pills.appendChild(createTag(item.label, "report-pill")));
  if (report.risks?.[0]) pills.appendChild(createTag(`风险: ${report.risks[0].title}`, "report-pill is-risk"));
  section.appendChild(pills);
  return section;
}

function renderRatingCard(title, rating, summary, evidence = [], unknowns = []) {
  const card = document.createElement("section");
  card.className = "report-card-block";
  card.innerHTML = `
    <div class="report-card-head">
      <h4>${title}</h4>
      <span>${rating ?? "-"} / 5</span>
    </div>
    <p>${summary}</p>
  `;
  if (evidence.length) card.appendChild(createListBlock("确认到的依据", evidence.slice(0, 4), "report-sub-block"));
  if (unknowns.length) card.appendChild(createListBlock("仍需确认", unknowns.slice(0, 4), "report-sub-block is-pending"));
  return card;
}

function renderDeepReport(report) {
  const wrapper = document.createElement("section");
  wrapper.className = "deep-report";

  const hero = document.createElement("div");
  hero.className = "deep-report-hero";
  hero.innerHTML = `
    <p class="eyebrow">School Intelligence</p>
    <h3>${report.title}</h3>
    <p>${report.summary}</p>
    <div class="report-score-line">
      <strong>${report.overallMatch?.score || "-"} / 100</strong>
      <span>${report.overallMatch?.label || "評価中"}｜${report.familyDecisionAdvice?.categorySuggestion || "未分類"}</span>
    </div>
  `;

  const grid = document.createElement("div");
  grid.className = "report-grid";
  grid.append(
    createListBlock("适合的学生类型", report.fitStudentTypes || []),
    createListBlock("学校优势", report.strengths || []),
    createListBlock("风险点", report.risks || [], "report-list-block is-risk"),
    renderRatingCard(
      "英语教育评价",
      report.englishEducation?.rating,
      report.englishEducation?.summary || "",
      report.englishEducation?.evidence || [],
      report.englishEducation?.unknowns || [],
    ),
    renderRatingCard(
      "留学/升学路径评价",
      report.pathways?.studyAbroadRating,
      report.pathways?.summary || "",
      report.pathways?.evidence || [],
      report.pathways?.unknowns || [],
    ),
    createListBlock("午餐/便当信息", [report.lunch?.summary || "未确认"].concat(report.lunch?.checkpoints || []), "report-list-block is-pending"),
    createListBlock("参观时需要确认的问题", report.visitQuestions || [], "report-list-block is-question"),
    createListBlock("家庭决策建议", [report.familyDecisionAdvice?.summary || ""].concat(report.familyDecisionAdvice?.recommendedNextActions || []), "report-list-block is-advice"),
  );

  wrapper.append(hero, grid);
  return wrapper;
}

function activateCardTab(card, tabName) {
  card.querySelectorAll("[data-card-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.cardTab === tabName);
  });
  card.querySelectorAll("[data-card-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.cardPanel !== tabName;
  });
}

function createCardTabs(card, tabNames) {
  const tabs = document.createElement("div");
  tabs.className = "card-tabs";
  tabNames.forEach(([key, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.cardTab = key;
    button.textContent = label;
    button.addEventListener("click", () => activateCardTab(card, key));
    tabs.appendChild(button);
  });
  return tabs;
}

function createCardPanel(name, hidden = false) {
  const panel = document.createElement("section");
  panel.className = "card-panel";
  panel.dataset.cardPanel = name;
  panel.hidden = hidden;
  return panel;
}

async function attachDeepReport(school, summaryMount, reportPanel) {
  const reportId = getDeepReportId(school);
  if (!reportId) return;

  summaryMount.replaceChildren(createTag("深度报告读取中", "point"));
  reportPanel.replaceChildren(createTag("深度报告读取中", "point"));

  try {
    const report = await loadDeepReport(reportId);
    summaryMount.replaceChildren(renderReportSummary(report));
    reportPanel.replaceChildren(renderDeepReport(report));
  } catch (error) {
    summaryMount.replaceChildren(createTag(error.message, "reason"));
    reportPanel.replaceChildren(createTag(error.message, "reason"));
  }
}

function renderCards(results) {
  latestResults = results;
  indexSessions(results);
  cards.replaceChildren();

  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <strong>没有符合筛选条件的学校</strong>
      <span>可以减少一个需求标签，或把学校类型改为“不限”再试。</span>
    `;
    cards.appendChild(empty);
    renderPlan();
    return;
  }

  results.forEach((item, index) => {
    const school = item.school;
    const card = document.createElement("article");
    card.className = "school-card";

    const photo = document.createElement("img");
    photo.className = "school-photo";
    photo.src = school.photo_url;
    photo.alt = `${school.name} 学校写真`;
    photo.loading = "lazy";
    photo.addEventListener("error", () => {
      photo.classList.add("is-missing");
      photo.removeAttribute("src");
    });

    const head = document.createElement("div");
    head.className = "card-head";
    const titleBlock = document.createElement("div");
    titleBlock.innerHTML = `
      <p class="eyebrow">No. ${index + 1}</p>
      <h3>${school.name}</h3>
      <div class="meta">偏差値 ${formatHensachi(school.hensachi)}｜${school.type}｜${school.nearest_station}｜通学 ${item.commute_minutes} 分</div>
    `;

    const scoreButton = document.createElement("button");
    scoreButton.className = "score-badge score-button";
    scoreButton.type = "button";
    scoreButton.title = "点击查看匹配度判断逻辑";
    scoreButton.textContent = item.score;

    const scoreDetails = renderScoreDetails(item);
    scoreButton.addEventListener("click", () => {
      scoreDetails.hidden = !scoreDetails.hidden;
      scoreButton.classList.toggle("is-open", !scoreDetails.hidden);
    });
    head.append(titleBlock, scoreButton);

    const description = document.createElement("p");
    description.className = "description";
    description.textContent = school.description || school.notes;

    const actionRow = document.createElement("div");
    actionRow.className = "action-row";
    actionRow.innerHTML = `
      <a class="homepage-link" href="${school.homepage_url}" target="_blank" rel="noopener noreferrer">学校公式サイト</a>
      <span class="source-note">写真：学校公式サイト掲載画像</span>
    `;

    const tagList = document.createElement("div");
    tagList.className = "tag-list";
    school.tags.forEach((tag) => tagList.appendChild(createTag(tag, "tag")));

    const eventList = document.createElement("div");
    eventList.className = "event-list";
    school.events.forEach((event) => {
      const label = `${event.name}: ${event.date}｜予約開始: ${event.reservation_start}`;
      eventList.appendChild(createLinkTag(label, event.source_url, "event"));
    });

    const hasReport = Boolean(getDeepReportId(school));
    const tabs = createCardTabs(card, hasReport ? [["overview", "概要"], ["exams", "入試日程"], ["report", "深度报告"]] : [["overview", "概要"], ["exams", "入試日程"]]);

    const overviewPanel = createCardPanel("overview");
    const examPanel = createCardPanel("exams", true);
    const reportPanel = createCardPanel("report", true);
    const reportSummaryMount = document.createElement("div");
    reportSummaryMount.className = "report-summary-mount";

    overviewPanel.append(description, actionRow, tagList, eventList, reportSummaryMount);
    examPanel.appendChild(renderExamSessions(school));
    if (hasReport) attachDeepReport(school, reportSummaryMount, reportPanel);

    card.append(photo, head, scoreDetails, tabs, overviewPanel, examPanel);
    if (hasReport) card.appendChild(reportPanel);
    cards.appendChild(card);
    activateCardTab(card, "overview");
  });

  renderPlan();
}

function renderPlan() {
  const sessions = getSelectedSessions();
  const conflicts = findConflicts(sessions);
  const conflictIds = new Set(conflicts.flat().map((session) => session.id));
  const grouped = sessions.reduce((acc, session) => {
    if (!acc.has(session.exam_date)) acc.set(session.exam_date, []);
    acc.get(session.exam_date).push(session);
    return acc;
  }, new Map());

  planSummary.textContent = `${sessions.length} 件`;
  selectedPlan.replaceChildren();

  if (!sessions.length) {
    conflictBox.className = "conflict-box is-ok";
    conflictBox.textContent = "まだ日程は選択されていません。";
    return;
  }

  if (conflicts.length) {
    conflictBox.className = "conflict-box is-alert";
    conflictBox.innerHTML = `<strong>${conflicts.length} 件の時間帯重複があります。</strong><span>同じ日付・同じ午前/午後、または全日入試とは併願できません。</span>`;
  } else {
    conflictBox.className = "conflict-box is-ok";
    conflictBox.textContent = "時間帯の重複はありません。";
  }

  [...grouped.entries()].forEach(([date, daySessions]) => {
    const group = document.createElement("section");
    group.className = "plan-day";
    const title = document.createElement("h3");
    title.textContent = formatDate(date);
    group.appendChild(title);

    daySessions.forEach((session) => {
      const item = document.createElement("div");
      item.className = `plan-item${conflictIds.has(session.id) ? " is-conflict" : ""}`;
      item.innerHTML = `
        <div>
          <strong>${slotLabel(session.slot)}｜${session.school_name}</strong>
          <span>${session.name}｜偏差値 ${session.hensachi}</span>
          <small>合格発表 ${formatOptionalDate(session.result_date)}｜手続 ${formatOptionalDate(session.procedure_deadline)}</small>
        </div>
        <button type="button" title="削除">×</button>
      `;
      item.querySelector("button").addEventListener("click", () => {
        selectedSessionIds.delete(session.id);
        renderCards(latestResults);
        renderPlan();
      });
      group.appendChild(item);
    });
    selectedPlan.appendChild(group);
  });
}

function buildPlanText() {
  const sessions = getSelectedSessions();
  if (!sessions.length) return "併願カレンダーはまだ空です。";
  return sessions
    .map((session) => {
      return [
        `${formatDate(session.exam_date)} ${slotLabel(session.slot)}`,
        session.school_name,
        session.name,
        `偏差値 ${session.hensachi}`,
        `合格発表 ${formatOptionalDate(session.result_date)}`,
        `手続 ${formatOptionalDate(session.procedure_deadline)}`,
      ].join("｜");
    })
    .join("\n");
}

async function copyPlan() {
  const text = buildPlanText();
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    copyPlanButton.textContent = "已复制";
  } else {
    window.prompt("复制日程", text);
    copyPlanButton.textContent = "已生成";
  }
  setTimeout(() => {
    copyPlanButton.textContent = "复制日程";
  }, 1400);
}

async function updateResults() {
  hensachiValue.textContent = hensachi.value;
  resultSummary.textContent = "计算中";

  const response = await fetch("/api/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(readStudent()),
  });

  if (!response.ok) {
    resultSummary.textContent = "计算失败";
    return;
  }

  const data = await response.json();
  renderTable(data.results);
  renderCards(data.results);
  resultSummary.textContent = `${data.results.length} / ${data.total_count} 所学校`;
}

async function sharePage() {
  const shareData = {
    title: "日本中学智能选校匹配",
    text: "输入孩子偏差值、通勤地点和核心需求，生成学校匹配度排序。",
    url: window.location.href,
  };

  if (navigator.share) {
    await navigator.share(shareData);
    return;
  }

  await navigator.clipboard.writeText(window.location.href);
  shareButton.textContent = "✓";
  setTimeout(() => {
    shareButton.textContent = "↗";
  }, 1400);
}

function createReportSection(title, items, renderItem, emptyText) {
  const section = document.createElement("section");
  section.className = "report-section";

  const heading = document.createElement("h3");
  heading.textContent = title;
  section.appendChild(heading);

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "report-empty";
    empty.textContent = emptyText;
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement("div");
  list.className = "report-list";
  items.slice(0, 12).forEach((item) => list.appendChild(renderItem(item)));
  section.appendChild(list);

  if (items.length > 12) {
    const more = document.createElement("p");
    more.className = "report-empty";
    more.textContent = `还有 ${items.length - 12} 条，后续可展开查看。`;
    section.appendChild(more);
  }

  return section;
}

function renderSourceItem(item) {
  const row = document.createElement("a");
  row.className = `report-item${item.changed ? " is-changed" : ""}${!item.ok ? " is-error" : ""}`;
  row.href = item.url;
  row.target = "_blank";
  row.rel = "noopener noreferrer";
  const keywords = item.keywords?.length ? `｜发现：${item.keywords.join("、")}` : "";
  const manual = item.manual_review ? "｜需要打开确认" : "";
  row.innerHTML = `
    <strong>${item.school_name}｜${item.source_type}</strong>
    <span>${item.status}${manual}${keywords}</span>
    <small>${item.title || item.error || item.url}</small>
  `;
  return row;
}

function renderRefreshReport(report) {
  refreshReport.hidden = false;
  refreshReport.replaceChildren();

  const head = document.createElement("div");
  head.className = "report-head";
  head.innerHTML = `
    <div>
      <p class="eyebrow">Refresh Report</p>
      <h2>入試日程检查</h2>
      <span>${new Date(report.checked_at).toLocaleString("ja-JP")}｜${report.note}</span>
    </div>
  `;

  const stats = document.createElement("div");
  stats.className = "report-stats";
  stats.append(
    createTag(`检查 ${report.source_count} 个入試来源`, "point"),
    createTag(`发现变化 ${report.changed_count}`, "reason"),
  );

  refreshReport.append(
    head,
    stats,
    createReportSection("有变化的入試日程页面", report.items, renderSourceItem, "没有发现变化。"),
  );
}

async function refreshOfficialSources() {
  if (refreshReportLoaded) {
    refreshReportVisible = !refreshReportVisible;
    refreshReport.hidden = !refreshReportVisible;
    refreshButton.textContent = refreshReportVisible ? "收起" : "打开";
    return;
  }

  if (noChangeTimer) {
    clearTimeout(noChangeTimer);
    noChangeTimer = null;
  }
  refreshButton.disabled = true;
  refreshButton.textContent = "检查中";
  refreshReport.hidden = false;
  refreshReport.className = "refresh-report is-loading";
  refreshReport.innerHTML = "<strong>入試日程检查中...</strong><span>只检查未发布/待确认学校，不会修改数据库。</span>";

  try {
    const response = await fetch("/api/refresh-report", { method: "POST" });
    if (!response.ok) throw new Error("检查接口返回错误");
    const report = await response.json();
    if (!report.items.length) {
      refreshReport.hidden = true;
      refreshReport.replaceChildren();
      refreshButton.textContent = "无变化";
      noChangeTimer = setTimeout(() => {
        if (!refreshReportLoaded) refreshButton.textContent = "更新";
        noChangeTimer = null;
      }, 1400);
      return;
    }
    refreshReport.className = "refresh-report";
    renderRefreshReport(report);
    refreshReportLoaded = true;
    refreshReportVisible = true;
    refreshButton.textContent = "收起";
  } catch (error) {
    refreshReport.className = "refresh-report is-error";
    refreshReport.innerHTML = `<strong>检查失败</strong><span>${error.message}</span>`;
    refreshReportLoaded = true;
    refreshReportVisible = true;
    refreshButton.textContent = "收起";
  } finally {
    refreshButton.disabled = false;
    if (!refreshReportLoaded && refreshButton.textContent === "检查中") {
      refreshButton.textContent = "更新";
    }
  }
}

async function init() {
  setupTags();
  await setupExamDateFilter();
  form.addEventListener("input", updateResults);
  shareButton.addEventListener("click", sharePage);
  copyPlanButton.addEventListener("click", copyPlan);
  refreshButton.addEventListener("click", refreshOfficialSources);
  updateResults();
}

init();
