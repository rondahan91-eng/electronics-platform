// ==========================================================================
// knightsLogic.js - הלוגיקה הטהורה של "צדיקים ונוכלים": טבלת האמת, חוק העקביות ובדיקות ארבעת השלבים.
// אין כאן DOM. כל התשובות מחושבות מהגדרת התרגיל (knightsData.js), לא קשיחות:
//   שורה = השמה של אמת/שקר לכל המשתנים (vars), לפי הסדר "אמת לפני שקר" (כמו בטבלאות המסמך).
//   קביעה S_i = ערך המשפט של הדובר i בהשמה. חוק העקביות: דובר אמין (משתנה = אמת) חייב לומר אמת, נוכל חייב לומר שקר,
//   כלומר המשתנה של הדובר שווה ל-S_i. שורה עקבית (✓) רק אם כל הדוברים עקביים בו־זמנית. בכל תרגיל שורה אחת בדיוק.
// ==========================================================================
import { EXERCISES } from './knightsData.js';

export const OPS = { and: '∧', or: '∨' };
export const NOT = '¬';

export function exerciseCount() { return EXERCISES.length; }
export function exercise(n) {
  const ex = EXERCISES[n - 1];
  if (!ex) throw new RangeError(`knights: תרגיל לא קיים (${n})`);
  return ex;
}

// ---------------------------------------------------------------- שמות ותצוגה
export function litText(lit) { return (lit[1] ? NOT : '') + lit[0]; }
export function sentenceText(s) { return `${litText(s.lits[0])} ${OPS[s.op]} ${litText(s.lits[1])}`; }
export function personOf(ex, v) { return ex.people.find(p => p.v === v) || null; }
export function factOf(ex, v) { return ex.facts.find(f => f.v === v) || null; }
/** שם עמודת הזהות/העובדה של משתנה בטבלה: "ו׳" לטכנאי, "נורית 4" לנורית. */
export function columnName(ex, v) {
  const p = personOf(ex, v); if (p) return p.name;
  const f = factOf(ex, v); if (f) return f.label;
  return v;
}
/** תיאור המשתנה כמו במסמך: "ו׳ אמין (צדיק)" / "נורית 4 דולקת". */
export function varMeaning(ex, v) {
  const p = personOf(ex, v);
  if (p) return `${p.name} ${p.gender === 'f' ? 'אמינה (צדיקה)' : 'אמין (צדיק)'}`;
  const f = factOf(ex, v);
  return f ? f.says : v;
}

// ---------------------------------------------------------------- טבלת אמת
export function rows(ex) {
  const n = ex.vars.length, out = [];
  for (let i = 0; i < (1 << n); i++) {
    const vals = {};
    ex.vars.forEach((v, k) => { vals[v] = !((i >> (n - 1 - k)) & 1); }); // המשתנה הראשון משתנה לאט, אמת לפני שקר
    out.push({ n: i + 1, vals });
  }
  return out;
}
export function evalLit(vals, lit) { return lit[1] ? !vals[lit[0]] : !!vals[lit[0]]; }
export function evalSentence(vals, s) {
  const a = evalLit(vals, s.lits[0]), b = evalLit(vals, s.lits[1]);
  return s.op === 'and' ? (a && b) : (a || b);
}
/** כל שורה עם הקביעות שלה ובדיקות העקביות: { n, vals, S: [..], said: [..], ok: [..], consistent }. */
export function table(ex) {
  return rows(ex).map(r => {
    const S = ex.sentences.map(s => evalSentence(r.vals, s));
    const said = ex.sentences.map(s => !!r.vals[s.speaker]);
    const ok = S.map((v, i) => v === said[i]);
    return { ...r, S, said, ok, consistent: ok.every(Boolean) };
  });
}
export function solutionRow(ex) {
  const good = table(ex).filter(r => r.consistent);
  if (good.length !== 1) throw new Error(`knights: בתרגיל ${ex.n} אין פתרון יחיד (${good.length})`);
  return good[0];
}

// ---------------------------------------------------------------- שלב 1: בניית הפסוק מרצף סמלים
/** tokens: מערך מחרוזות מתוך ¬ ∧ ∨ ושמות משתנים. מחזיר { ok, reason } כש-reason: 'empty' | 'syntax' | 'op' | 'lits'. */
export function parseFormula(ex, tokens) {
  const isVar = t => ex.vars.includes(t);
  let i = 0;
  const lit = () => {
    let neg = 0;
    if (tokens[i] === NOT) { neg = 1; i++; }
    if (i < tokens.length && isVar(tokens[i])) { const v = tokens[i]; i++; return [v, neg]; }
    return null;
  };
  if (!tokens.length) return { ok: false, reason: 'empty' };
  const a = lit();
  if (!a) return { ok: false, reason: 'syntax' };
  if (i >= tokens.length) return { ok: false, reason: 'syntax', partial: [a] };
  const opTok = tokens[i];
  const op = opTok === OPS.and ? 'and' : opTok === OPS.or ? 'or' : null;
  if (!op) return { ok: false, reason: 'syntax' };
  i++;
  const b = lit();
  if (!b || i !== tokens.length) return { ok: false, reason: 'syntax' };
  return { ok: true, op, lits: [a, b] };
}
const litKey = l => `${l[1] ? '!' : ''}${l[0]}`;
/** בדיקת פסוק של משפט מס' idx: אותו קשר ואותם שני חלקים (הסדר ביניהם חופשי: ∧ ו-∨ קומוטטיביים). */
export function checkFormula(ex, idx, tokens) {
  const target = ex.sentences[idx];
  const p = parseFormula(ex, tokens);
  if (!p.ok) return { ok: false, reason: p.reason };
  const sameSet = [...p.lits.map(litKey)].sort().join('|') === [...target.lits.map(litKey)].sort().join('|');
  if (p.op === target.op && sameSet) return { ok: true };
  if (p.op !== target.op && sameSet) return { ok: false, reason: 'op' };
  return { ok: false, reason: 'lits' };
}

// ---------------------------------------------------------------- שלב 2: שיבוץ חלקים בעמודות
/** כל החלקים לשיבוץ: לכל משפט שני חלקים והמשפט כולו. col = העמודה הנכונה ('v:<משתנה>' או 'd:<אינדקס משפט>'). */
export function chips(ex) {
  const out = [];
  ex.sentences.forEach((s, i) => {
    s.lits.forEach((l, k) => out.push({ id: `s${i}p${k}`, text: litText(l), sentence: i, col: `v:${l[0]}`, kind: 'part' }));
    out.push({ id: `s${i}all`, text: sentenceText(s), sentence: i, col: `d:${i}`, kind: 'whole' });
  });
  return out;
}
/** כל עמודות הטבלה בסדר תצוגה: עמודות משתנים, ואחריהן עמודות קביעה. */
export function columns(ex) {
  return [
    ...ex.vars.map(v => ({ id: `v:${v}`, kind: 'var', v, name: columnName(ex, v) })),
    ...ex.sentences.map((s, i) => ({ id: `d:${i}`, kind: 'det', i, name: s.col })),
  ];
}
export function placeChip(ex, chipId, colId) {
  const c = chips(ex).find(x => x.id === chipId);
  if (!c) throw new Error('knights: חלק לא קיים ' + chipId);
  return c.col === colId;
}

// ---------------------------------------------------------------- שלבים 3 ו-4
/** answers: { [rowN]: [bool|null, ...] } - ערך הקביעה לכל משפט. מחזיר את השורות/המשפטים השגויים. */
export function checkDeterminations(ex, answers) {
  const bad = [];
  table(ex).forEach(r => r.S.forEach((v, i) => {
    const a = (answers[r.n] || [])[i];
    if (a !== v) bad.push({ row: r.n, sentence: i, empty: a === null || a === undefined });
  }));
  return bad;
}
/** marks: { [rowN]: true|false|null } - האם השורה עקבית (✓). מחזיר את השורות השגויות. */
export function checkConsistency(ex, marks) {
  const bad = [];
  table(ex).forEach(r => {
    const m = marks[r.n];
    if (m !== r.consistent) bad.push({ row: r.n, empty: m === null || m === undefined });
  });
  return bad;
}

/** בדיקה עצמית (לבדיקות ולאימות): ששורת המפתח של המסמך היא השורה העקבית היחידה, בכל התרגילים. */
export function selfCheck() {
  return EXERCISES.map(ex => {
    try { const s = solutionRow(ex); return { n: ex.n, ok: s.n === ex.keyRow, solutionRow: s.n, keyRow: ex.keyRow }; }
    catch (e) { return { n: ex.n, ok: false, error: e.message }; }
  });
}
