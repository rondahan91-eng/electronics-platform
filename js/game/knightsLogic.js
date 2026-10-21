// ==========================================================================
// knightsLogic.js - הלוגיקה הטהורה של "צדיקים ונוכלים": טבלת האמת, תנאי העקביות ובדיקות ארבעת השלבים.
// אין כאן DOM. כל התשובות מחושבות מהגדרת התרגיל (knightsData.js), לא קשיחות. השיטה היא כפי שנלמדה בכיתה:
//   שורה = השמה של אמת/שקר לכל המשתנים (vars), לפי הסדר "אמת לפני שקר".
//   הפסוק של דובר i = מה שהוא אמר, כנוסחה מעל המשתנים (למשל ¬x ∧ L).
//   תנאי העקביות של דובר i הוא פסוק "אם ורק אם":  (הדובר צדיק) ⟺ (מה שהוא אמר נכון), כלומר  x ⟺ (הפסוק).
//   ערך התנאי בשורה הוא אמת בדיוק כשהצדדים שווים. שורה עקבית (✓) רק אם תנאי העקביות של כל הדוברים אמת. בכל תרגיל שורה אחת בדיוק.
// ==========================================================================
import { EXERCISES } from './knightsData.js';

export const OPS = { and: '∧', or: '∨' };
export const NOT = '¬';
export const IFF = '⟺';
export const LP = '(';
export const RP = ')';

export function exerciseCount() { return EXERCISES.length; }
export function exercise(n) {
  const ex = EXERCISES[n - 1];
  if (!ex) throw new RangeError(`knights: תרגיל לא קיים (${n})`);
  return ex;
}

// ---------------------------------------------------------------- שמות ותצוגה
export function litText(lit) { return (lit[1] ? NOT : '') + lit[0]; }
export function sentenceText(s) { return `${litText(s.lits[0])} ${OPS[s.op]} ${litText(s.lits[1])}`; }
/** תנאי העקביות של משפט i כטקסט: "x ⟺ (¬x ∧ L)". */
export function conditionText(ex, i) { const s = ex.sentences[i]; return `${s.speaker} ${IFF} (${sentenceText(s)})`; }
/** סמלים כטקסט קריא: בלי רווח אחרי ¬ ואחרי "(" ובלי רווח לפני ")". */
export function tokensText(tokens) {
  let out = '';
  tokens.forEach((t, i) => {
    const prev = tokens[i - 1];
    if (i > 0 && prev !== NOT && prev !== LP && t !== RP) out += ' ';
    out += t;
  });
  return out;
}
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
/** כל שורה: { n, vals, S: [ערך הפסוק של כל דובר], said: [ערך המשתנה של כל דובר], cond: [ערך תנאי העקביות = (said ⟺ S)], consistent }. */
export function table(ex) {
  return rows(ex).map(r => {
    const S = ex.sentences.map(s => evalSentence(r.vals, s));
    const said = ex.sentences.map(s => !!r.vals[s.speaker]);
    const cond = S.map((v, i) => said[i] === v); // אם ורק אם: אמת כששני הצדדים שווים
    return { ...r, S, said, cond, ok: cond, consistent: cond.every(Boolean) };
  });
}
export function solutionRow(ex) {
  const good = table(ex).filter(r => r.consistent);
  if (good.length !== 1) throw new Error(`knights: בתרגיל ${ex.n} אין פתרון יחיד (${good.length})`);
  return good[0];
}

// ---------------------------------------------------------------- שלב 1: בניית תנאי העקביות (פסוק "אם ורק אם") מרצף סמלים
// סוגי סמלים: V משתנה, N שלילה ¬, O קשר ∧/∨, I אם ורק אם ⟺, L סוגר פותח, R סוגר סוגר.
const kindOf = (ex, t) => (ex.vars.includes(t) ? 'V' : t === NOT ? 'N' : (t === OPS.and || t === OPS.or) ? 'O' : t === IFF ? 'I' : t === LP ? 'L' : t === RP ? 'R' : '?');
const SENT_KINDS = ['VOV', 'NVOV', 'VONV', 'NVONV']; // חלק, קשר, חלק (לכל חלק שלילה אופציונלית)
const VALID_KINDS = [...SENT_KINDS.map(k => `VIL${k}R`), ...SENT_KINDS.map(k => `L${k}RIV`)]; // x ⟺ (פסוק)  או  (פסוק) ⟺ x
const NOIFF_KINDS = [...SENT_KINDS, ...SENT_KINDS.map(k => `L${k}R`)]; // פסוק בלי ⟺
const PAREN_KINDS = [...SENT_KINDS.map(k => `VI${k}`), ...SENT_KINDS.map(k => `${k}IV`)]; // ⟺ בלי סוגריים סביב הפסוק
const ALL_KINDS = [...VALID_KINDS, ...NOIFF_KINDS, ...PAREN_KINDS];

/** tokens: מחרוזות מתוך משתנים ו-¬ ∧ ∨ ⟺ ( ). מחזיר { ok, reason, ... }.
 *  reason: 'empty' (אין כלום), 'incomplete' (נגמר באמצע), 'noiff' (פסוק בלי ⟺), 'paren' (⟺ בלי סוגריים סביב הפסוק),
 *  'malformed' (סמל במקום לא נכון או סמלים עודפים). כשהמבנה תקין: { ok: true, side, who, op, lits }. */
export function parseCondition(ex, tokens) {
  if (!tokens.length) return { ok: false, reason: 'empty' };
  const kinds = tokens.map(t => kindOf(ex, t)).join('');
  if (VALID_KINDS.includes(kinds)) {
    const iff = tokens.indexOf(IFF);
    const left = tokens[0] !== LP; // x ⟺ (...) : המשתנה משמאל
    const who = left ? tokens[0] : tokens[tokens.length - 1];
    const inner = left ? tokens.slice(iff + 2, tokens.length - 1) : tokens.slice(1, iff - 1);
    const lit = (arr) => (arr[0] === NOT ? [arr[1], 1] : [arr[0], 0]);
    const opIdx = inner.findIndex(t => t === OPS.and || t === OPS.or);
    return { ok: true, side: left ? 'left' : 'right', who, op: inner[opIdx] === OPS.and ? 'and' : 'or', lits: [lit(inner.slice(0, opIdx)), lit(inner.slice(opIdx + 1))] };
  }
  if (NOIFF_KINDS.includes(kinds)) return { ok: false, reason: 'noiff' };
  if (PAREN_KINDS.includes(kinds)) return { ok: false, reason: 'paren' };
  if (ALL_KINDS.some(k => k.startsWith(kinds) && k.length > kinds.length)) return { ok: false, reason: 'incomplete' };
  return { ok: false, reason: 'malformed' };
}
const litKey = l => `${l[1] ? '!' : ''}${l[0]}`;
/** בדיקת תנאי העקביות של משפט מס' idx: המשתנה של הדובר בצד אחד של ⟺, ובצד השני הפסוק בסוגריים, באותו קשר ובאותם שני חלקים
 *  (הסדר בין החלקים חופשי: ∧ ו-∨ קומוטטיביים, וגם ⟺ סימטרי, לכן אפשר לכתוב את הפסוק מימין או משמאל). reason נוסף: 'who' | 'op' | 'lits'. */
export function checkCondition(ex, idx, tokens) {
  const target = ex.sentences[idx];
  const p = parseCondition(ex, tokens);
  if (!p.ok) return { ok: false, reason: p.reason };
  if (p.who !== target.speaker) return { ok: false, reason: 'who' };
  const sameSet = p.lits.map(litKey).sort().join('|') === target.lits.map(litKey).sort().join('|');
  if (p.op === target.op && sameSet) return { ok: true };
  if (p.op !== target.op && sameSet) return { ok: false, reason: 'op' };
  return { ok: false, reason: 'lits' };
}

// ---------------------------------------------------------------- שלב 2: שיבוץ חלקי התנאי בעמודות
/** כל החלקים לשיבוץ: לכל משפט שני חלקים (עמודת המשתנה שלהם), הפסוק כולו (עמודת הפסוק של הדובר) ותנאי העקביות כולו (עמודת התנאי של הדובר).
 *  col = העמודה הנכונה: 'v:<משתנה>' | 's:<אינדקס משפט>' | 'c:<אינדקס משפט>'. */
export function chips(ex) {
  const out = [];
  ex.sentences.forEach((s, i) => {
    s.lits.forEach((l, k) => out.push({ id: `s${i}p${k}`, text: litText(l), sentence: i, col: `v:${l[0]}`, kind: 'part' }));
    out.push({ id: `s${i}s`, text: sentenceText(s), sentence: i, col: `s:${i}`, kind: 'sent' });
    out.push({ id: `s${i}c`, text: conditionText(ex, i), sentence: i, col: `c:${i}`, kind: 'cond' });
  });
  return out;
}
/** כל עמודות הטבלה בסדר תצוגה: עמודות המשתנים, ואחריהן לכל דובר עמודת הפסוק ועמודת התנאי (כמו בטבלה שבשיעור). */
export function columns(ex) {
  const many = ex.sentences.length > 1;
  const who = i => { const p = personOf(ex, ex.sentences[i].speaker); return p ? p.name : ''; };
  return [
    ...ex.vars.map(v => ({ id: `v:${v}`, kind: 'var', v, name: columnName(ex, v) })),
    ...ex.sentences.flatMap((s, i) => [
      { id: `s:${i}`, kind: 'sent', i, name: many ? `הפסוק של ${who(i)}` : 'הפסוק' },
      { id: `c:${i}`, kind: 'cond', i, name: many ? `תנאי ${who(i)}` : 'תנאי העקביות' },
    ]),
  ];
}
export function placeChip(ex, chipId, colId) {
  const c = chips(ex).find(x => x.id === chipId);
  if (!c) throw new Error('knights: חלק לא קיים ' + chipId);
  return c.col === colId;
}

// ---------------------------------------------------------------- שלבים 3 ו-4
/** שלב 3. answers: { [rowN]: [bool|null, ...] } - ערך הפסוק של כל דובר בשורה. מחזיר את השורות/המשפטים השגויים. */
export function checkDeterminations(ex, answers) {
  const bad = [];
  table(ex).forEach(r => r.S.forEach((v, i) => {
    const a = (answers[r.n] || [])[i];
    if (a !== v) bad.push({ row: r.n, sentence: i, empty: a === null || a === undefined });
  }));
  return bad;
}
/** שלב 4א. answers: { [rowN]: [bool|null, ...] } - ערך תנאי העקביות (x ⟺ הפסוק) של כל דובר בשורה: ✓ = אמת, ✗ = שקר. מחזיר את השגויים. */
export function checkConditions(ex, answers) {
  const bad = [];
  table(ex).forEach(r => r.cond.forEach((v, i) => {
    const a = (answers[r.n] || [])[i];
    if (a !== v) bad.push({ row: r.n, sentence: i, empty: a === null || a === undefined });
  }));
  return bad;
}
/** שלב 4ב (רק כשיש שני דוברים). marks: { [rowN]: true|false|null } - האם השורה עקבית (✓): כל התנאים אמת. מחזיר את השורות השגויות. */
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
