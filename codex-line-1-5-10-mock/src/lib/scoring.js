export const SLOT_LABELS = { AM: "午前", PM: "午後", FULL: "全日" };

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function scoreHensachi(studentHensachi, schoolHensachi) {
  const gap = Number(schoolHensachi) - Number(studentHensachi);
  if (gap >= -5 && gap <= 3) return 100;
  if (gap > 3) return clamp(100 - (gap - 3) * 12, 0, 100);
  return clamp(100 - (Math.abs(gap) - 5) * 8, 45, 100);
}

export function scoreCommute(minutes) {
  const value = Number(minutes);
  if (value <= 30) return 100;
  if (value <= 90) return clamp(100 - ((value - 30) / 5) * 7, 20, 100);
  return 10;
}

export function calculateDecisionScore(school, weights, studentHensachi = 58) {
  const base = school.scores || {};
  const normalized = {
    childPreference: ((base.childPreference ?? 3) / 5) * 100,
    englishEducation: ((base.englishEducation ?? 3) / 5) * 100,
    pathway: ((base.pathway ?? 3) / 5) * 100,
    atmosphere: ((base.atmosphere ?? 3) / 5) * 100,
    hensachi: scoreHensachi(studentHensachi, school.hensachiAverage80),
    commute: scoreCommute(school.commuteMinutes),
  };

  const totalWeight = Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0);
  const score = Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + (normalized[key] || 0) * Number(weight || 0);
  }, 0) / totalWeight;

  return Math.round(score);
}

export function categoryLabel(category) {
  return category && category !== "未分類" ? category : "未分類";
}
