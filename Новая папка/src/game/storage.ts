export type ScoreRow = {
  id: string;
  name: string;
  score: number;
  level: number;
  kills: number;
  date: number;
};

const KEY = 'hivebreaker.scores.v1';
const MAX = 10;

export function getScores(): ScoreRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw) as ScoreRow[];
    if (!Array.isArray(rows)) return [];
    return rows.sort((a, b) => b.score - a.score).slice(0, MAX);
  } catch {
    return [];
  }
}

function save(rows: ScoreRow[]) {
  try { localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX))); } catch { /* ignore */ }
}

export function addScore(row: Omit<ScoreRow, 'id' | 'date'>): ScoreRow {
  const full: ScoreRow = {
    ...row,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: Date.now(),
  };
  const rows = getScores();
  rows.push(full);
  rows.sort((a, b) => b.score - a.score);
  save(rows);
  return full;
}

export function updateScore(id: string, patch: Partial<ScoreRow>) {
  const rows = getScores();
  const i = rows.findIndex((r) => r.id === id);
  if (i >= 0) {
    rows[i] = { ...rows[i], ...patch };
    save(rows);
  }
}
