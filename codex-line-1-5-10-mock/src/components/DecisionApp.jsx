import { useEffect, useMemo, useState } from "react";
import { SLOT_LABELS, calculateDecisionScore, categoryLabel } from "../lib/scoring.js";

const CATEGORIES = ["第一志望", "挑战校", "适正校", "安全校", "保留观察", "不考虑", "未分類"];
const STORAGE_KEY = "school-matcher-family-state-v1";

function loadFamilyState() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveFamilyState(state) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function scoreTone(score) {
  if (score >= 82) return "excellent";
  if (score >= 70) return "good";
  if (score >= 58) return "watch";
  return "muted";
}

function FieldScore({ label, value }) {
  return (
    <div className="field-score">
      <span>{label}</span>
      <strong>{value ?? "未"}</strong>
    </div>
  );
}

function SchoolCard({ school, score, selected, familyState, onSelect, onPatchFamily }) {
  const family = familyState[school.id] || {};
  const category = family.aspirationCategory || school.aspirationCategory;

  return (
    <article className={`school-card ${selected ? "is-selected" : ""}`} onClick={() => onSelect(school.id)}>
      <img src={school.photoUrl} alt={`${school.nameJa} 写真`} loading="lazy" />
      <div className="school-card-body">
        <div className="school-card-head">
          <div>
            <p className="eyebrow">School / 学校</p>
            <h3>{school.nameJa}</h3>
            <p>{school.nameZh}</p>
          </div>
          <div className={`score-pill ${scoreTone(score)}`}>{score}</div>
        </div>

        <p className="school-description">{school.description}</p>

        <div className="tag-row">
          {school.tags.slice(0, 5).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>

        <div className="mini-metrics">
          <FieldScore label="偏差値" value={school.hensachiAverage80} />
          <FieldScore label="通学" value={`${school.commuteMinutes}分`} />
          <FieldScore label="英語" value={school.scores.englishEducation} />
          <FieldScore label="留学" value={school.scores.pathway} />
        </div>

        <div className="card-controls" onClick={(event) => event.stopPropagation()}>
          <label>
            志望校分類
            <select
              value={category}
              onChange={(event) => onPatchFamily(school.id, { aspirationCategory: event.target.value })}
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </article>
  );
}

function DetailPanel({ school, report, family, onPatchFamily }) {
  if (!school) return null;

  const lunchText = school.lunch.hasCafeteria === null ? "未確認" : school.lunch.hasCafeteria ? "食堂あり" : "食堂なし";
  const bentoText = school.lunch.requiresBento === null ? "未確認" : school.lunch.requiresBento ? "弁当必要" : "弁当必須ではない";

  return (
    <section className="detail-panel">
      <div className="detail-hero">
        <div>
          <p className="eyebrow">Decision Detail / 志望校判断</p>
          <h2>{school.nameJa}</h2>
          <p>{school.address} / {school.nearestStation}</p>
        </div>
        <a className="ghost-link" href={school.homepageUrl} target="_blank" rel="noreferrer">
          公式サイト
        </a>
      </div>

      <div className="detail-grid">
        <section className="info-card">
          <h3>基本情報</h3>
          <dl>
            <div><dt>学校类型</dt><dd>{school.type}</dd></div>
            <div><dt>通学</dt><dd>{school.commuteMinutes} 分 / 越谷レイクタウン起点</dd></div>
            <div><dt>偏差値</dt><dd>{school.hensachiAverage80} / {school.hensachiBasis}</dd></div>
            <div><dt>志望校分類</dt><dd>{categoryLabel(family.aspirationCategory || school.aspirationCategory)}</dd></div>
          </dl>
        </section>

        <section className="info-card">
          <h3>午餐 / 便当</h3>
          <dl>
            <div><dt>食堂</dt><dd>{lunchText}</dd></div>
            <div><dt>便当</dt><dd>{bentoText}</dd></div>
            <div><dt>满意度</dt><dd>{school.lunch.satisfaction ?? "未评分"}</dd></div>
          </dl>
          <p>{school.lunch.note}</p>
        </section>

        <section className="info-card">
          <h3>留学・進学</h3>
          <dl>
            <div><dt>海外留学</dt><dd>{school.pathways.hasStudyAbroadPath ? "あり" : "未確認"}</dd></div>
            <div><dt>海外大学</dt><dd>{school.pathways.hasOverseasUniversityPath ? "あり" : "未確認"}</dd></div>
            <div><dt>国内大学支援</dt><dd>{school.pathways.domesticUniversitySupport}</dd></div>
          </dl>
        </section>

        <section className="info-card family-card">
          <h3>家庭评分</h3>
          <label>
            孩子意愿
            <input
              type="range"
              min="1"
              max="5"
              value={family.childPreference ?? school.scores.childPreference}
              onChange={(event) => onPatchFamily(school.id, { childPreference: Number(event.target.value) })}
            />
          </label>
          <label>
            学校氛围
            <input
              type="range"
              min="1"
              max="5"
              value={family.atmosphere ?? school.scores.atmosphere}
              onChange={(event) => onPatchFamily(school.id, { atmosphere: Number(event.target.value) })}
            />
          </label>
        </section>
      </div>

      <section className="info-card wide">
        <h3>入試日程</h3>
        <div className="exam-list">
          {school.examSessions.map((session) => (
            <div key={session.id} className="exam-item">
              <strong>{session.examDate} / {SLOT_LABELS[session.slot] || session.slot}</strong>
              <span>{session.name}</span>
              <small>80% {session.sapixGirls80} / 出願 {session.applicationStart} - {session.applicationEnd}</small>
            </div>
          ))}
        </div>
      </section>

      {report && (
        <section className="report-panel">
          <div className="report-title">
            <p className="eyebrow">Deep Report / 深度报告</p>
            <h3>{report.title}</h3>
            <span>{report.overallMatch?.label} / {report.overallMatch?.score}</span>
          </div>
          <p>{report.summary}</p>
          <div className="report-columns">
            <ReportList title="适合的学生类型" items={report.fitStudentTypes} />
            <ReportList title="学校优势" items={report.strengths} />
            <ReportList title="风险点" items={report.risks} risk />
            <ReportList title="参观确认问题" items={report.visitQuestions} />
          </div>
        </section>
      )}

      <section className="info-card wide">
        <h3>参观记录与家庭备注</h3>
        <div className="note-grid">
          <label>
            家长备注
            <textarea
              value={family.parentNote || ""}
              placeholder="例：说明会后补充、通学实测感受、费用确认..."
              onChange={(event) => onPatchFamily(school.id, { parentNote: event.target.value })}
            />
          </label>
          <label>
            孩子反馈
            <textarea
              value={family.childFeedback || ""}
              placeholder="例：校园感觉、老师印象、是否愿意再去..."
              onChange={(event) => onPatchFamily(school.id, { childFeedback: event.target.value })}
            />
          </label>
        </div>
      </section>
    </section>
  );
}

function ReportList({ title, items = [], risk = false }) {
  return (
    <section className={`report-mini ${risk ? "is-risk" : ""}`}>
      <h4>{title}</h4>
      {items.slice(0, 6).map((item, index) => (
        <div key={index}>
          <strong>{item.title || item.label || item}</strong>
          {(item.detail || item.reason) && <span>{item.detail || item.reason}</span>}
        </div>
      ))}
    </section>
  );
}

export default function DecisionApp({ schools, weights, reports }) {
  const [query, setQuery] = useState("");
  const [studentHensachi, setStudentHensachi] = useState(58);
  const [activeTag, setActiveTag] = useState("すべて");
  const [selectedId, setSelectedId] = useState(schools[0]?.id);
  const [familyState, setFamilyState] = useState({});

  useEffect(() => {
    setFamilyState(loadFamilyState());
  }, []);

  function patchFamily(id, patch) {
    setFamilyState((current) => {
      const next = { ...current, [id]: { ...(current[id] || {}), ...patch } };
      saveFamilyState(next);
      return next;
    });
  }

  const allTags = useMemo(() => ["すべて", ...Array.from(new Set(schools.flatMap((school) => school.tags))).sort()], [schools]);

  const rankedSchools = useMemo(() => {
    return schools
      .map((school) => {
        const family = familyState[school.id] || {};
        const merged = {
          ...school,
          scores: {
            ...school.scores,
            childPreference: family.childPreference ?? school.scores.childPreference,
            atmosphere: family.atmosphere ?? school.scores.atmosphere,
          },
        };
        return {
          school: merged,
          score: calculateDecisionScore(merged, weights, studentHensachi),
        };
      })
      .filter(({ school }) => {
        const text = `${school.nameJa} ${school.nameZh} ${school.tags.join(" ")}`.toLowerCase();
        const matchesQuery = text.includes(query.toLowerCase());
        const matchesTag = activeTag === "すべて" || school.tags.includes(activeTag);
        return matchesQuery && matchesTag;
      })
      .sort((a, b) => b.score - a.score);
  }, [schools, weights, studentHensachi, query, activeTag, familyState]);

  const selected = rankedSchools.find(({ school }) => school.id === selectedId)?.school || rankedSchools[0]?.school;
  const selectedReport = selected?.reportId ? reports[selected.reportId] : null;

  return (
    <main className="garden-shell">
      <section className="hero-section">
        <div>
          <p className="eyebrow">School Garden / 志望校の庭</p>
          <h1>日本中学参观与志望校决策助手</h1>
          <p>
            学校列表、深度报告、家庭评分、午餐/便当、留学路径和综合匹配度，集中在一个适合手机查看的静态网站里。
          </p>
        </div>
        <div className="hero-stats">
          <div><strong>{schools.length}</strong><span>目标校</span></div>
          <div><strong>{rankedSchools[0]?.score ?? "-"}</strong><span>最高匹配</span></div>
          <div><strong>{Object.keys(reports).length}</strong><span>深度报告</span></div>
        </div>
      </section>

      <section className="garden-grid">
        <aside className="control-card">
          <p className="eyebrow">Filter / 条件</p>
          <label>
            孩子当前偏差值
            <input type="range" min="40" max="75" value={studentHensachi} onChange={(event) => setStudentHensachi(Number(event.target.value))} />
            <strong>{studentHensachi}</strong>
          </label>
          <label>
            学校搜索
            <input value={query} placeholder="学校名 / 标签" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="tag-filter">
            {allTags.map((tag) => (
              <button key={tag} className={activeTag === tag ? "is-active" : ""} onClick={() => setActiveTag(tag)}>
                {tag}
              </button>
            ))}
          </div>
        </aside>

        <section className="dashboard-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Ranking / 総合順</p>
              <h2>综合匹配度排序</h2>
            </div>
            <span>{rankedSchools.length} 校</span>
          </div>
          <div className="school-list">
            {rankedSchools.map(({ school, score }) => (
              <SchoolCard
                key={school.id}
                school={school}
                score={score}
                selected={selected?.id === school.id}
                familyState={familyState}
                onSelect={setSelectedId}
                onPatchFamily={patchFamily}
              />
            ))}
          </div>
        </section>
      </section>

      <DetailPanel school={selected} report={selectedReport} family={familyState[selected?.id] || {}} onPatchFamily={patchFamily} />
    </main>
  );
}
