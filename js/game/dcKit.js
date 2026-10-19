// ==========================================================================
// dcKit.js - ערכת בנייה משותפת לשלבי התרגול של מעגלי DC (פרקים 4, 6, 8 ועוד): נתונים כשורות נפרדות,
// ציור מעגל (circuitRenderer) בלי ערכים בציור, חישוב מדויק, מלכודות, הערכה ביחס של 3%.
// אותו מבנה כמו staticChargeLevelGenerator.js (פרק 1): כל שלב הוא הגדרה (def), התשובה והמלכודות
// מחושבות מהנתונים עצמם ולא קשיחות.
//
// ---------------------------------------------------------------- הגדרת שלב (def)
//   title, desc        כותרת והסבר מתקפל (desc + NOTE.* בסוף, ראו למטה)
//   story, ask         משפט פתיחה קצר (בלי מספרים) ושאלה. prompt = story + <br> + ask
//   unit, scale        יחידת התשובה, ו-scale = כמה יחידות SI יש ביחידה המבוקשת (mA: 1e-3, kΩ: 1e3, ברירת מחדל 1).
//                      answer = compute(ctx) / scale
//   data               [datum(...)] - כל נתון בשורה משלו. ערך SI נגזר מהמספר המוצג.
//   hidden             ערכי SI שמשמשים רק לציור/לפתרון ולא מוצגים: { R1: 4, E: v => v.V }  (פונקציה מקבלת את v)
//   circuit            עץ המעגל: ['S','R1',['P','R2','R3']]  (S = טור, P = מקביל, מחרוזת = נגד לפי שמו). מקור המתח = v.E
//   leafText           {R3: 'I₃ = ?'}  טקסט מותאם לרכיב בציור (ברירת מחדל: שם הנגד, בלי ערך)
//   compute(ctx)       התשובה ב-SI (ראו ctx למטה)
//   traps              [{ f: (ctx, a) => ערך-שגוי (ביחידת התשובה), msg: 'מה הטעות' }]
//   hints              שלושה רמזים: נוסחה / מה לעשות / "בדקו בדרך" עם ערכי ביניים. מערך, או פונקציה (ctx, answer) => מערך
//                      (מומלץ: כך המספרים נגזרים מהנתונים). חילוק בקומות: ⟦מונה⁄מכנה⟧; fmtNum מעצב מספר לטקסט.
//   meaning            משפט סיום קצר שמתווסף להודעת ההצלחה (אופציונלי; מחרוזת או פונקציה (ctx, answer) => מחרוזת)
// ctx = { v, root, n(label), I(label), V(label), P(label), R(label), Itot, Rtot, Vtot, Ptot, E, scale }
//   (I/V/P/R ביחידות SI; ערכים מוחלטים). v = כל ערכי ה-SI לפי מפתח (data + hidden).
// ==========================================================================
import { R, Series, Parallel, solveCircuit, collectLeaves } from './circuitEngine.js';
import { renderCircuit } from './circuitRenderer.js';
import { CONFIG } from '../config.js';

/** עיגול ל-6 ספרות משמעותיות - מנקה רעש נקודה צפה. */
export const sig = x => Number(Number(x).toPrecision(6));

/**
 * שורת נתון: הערך המוצג ("40 mA") וערך ה-SI שנגזר ממנו (0.04).
 * datum('I', 'הזרם I', 40, 'mA', -3)  ->  value '40 mA', si 0.04.   opts.factor: מכפיל שאינו חזקת 10 (דקה: 60, שעה: 3600).
 */
export function datum(key, label, shown, unit, exp10 = 0, opts = {}) {
  const neg = shown < 0;
  const factor = opts.factor || 1;
  return { key, label, value: `${neg ? '−' : ''}${Math.abs(shown)} ${unit}`, si: sig(Number(`${shown}e${exp10}`) * factor) };
}

// הערות "מדרגת המרות" שמתווספות להסבר המתקפל (בלי מספרים, ובלי לומר איזה נתון להמיר - זה תפקיד הרמזים).
export const NOTE = {
  c0: ' בשלב הזה כל הנתונים כבר ביחידות SI והתשובה מבוקשת ביחידת SI, ולכן אין צורך בהמרות.',
  d1: ' בשלב הזה אחד הנתונים אינו ביחידת SI.',
  a: ' בשלב הזה כל הנתונים ב-SI. שימו לב ליחידה שבה מבוקשת התשובה.',
  dm: ' בשלב הזה כמה מהנתונים אינם ביחידת SI.',
};

// ---------------------------------------------------------------- בניית המעגל
function buildTree(spec, v) {
  if (typeof spec === 'string') {
    if (!(spec in v)) throw new Error(`dcKit: חסר ערך לנגד ${spec}`);
    const node = R(v[spec]);
    node.label = spec;
    return node;
  }
  const [kind, ...kids] = spec;
  const children = kids.map(k => buildTree(k, v));
  if (kind === 'S') return Series(...children);
  if (kind === 'P') return Parallel(...children);
  throw new Error('dcKit: סוג צומת לא מוכר ' + kind);
}

function makeCtx(root, v, scale) {
  const byLabel = {};
  collectLeaves(root).forEach(l => { byLabel[l.label] = l; });
  const n = label => {
    if (!byLabel[label]) throw new Error('dcKit: אין נגד בשם ' + label);
    return byLabel[label];
  };
  const Itot = root.current.abs();
  return {
    v, root, scale, n,
    I: label => n(label).current.abs(),
    V: label => n(label).voltageDrop.abs(),
    R: label => n(label).value,
    P: label => n(label).current.abs() ** 2 * n(label).value,
    Itot,
    Rtot: root._Z.abs(),
    Vtot: v.E,
    Ptot: v.E * Itot,
    E: v.E,
  };
}

const cache = new Map();

/** בונה (או שולף מהמטמון) את שלב מספר localId (1..N) מתוך רשימת ההגדרות. */
export function buildDcLevel(topicId, defs, localId) {
  const key = `${topicId}:${localId}`;
  if (cache.has(key)) return cache.get(key);
  const def = defs[localId - 1];
  if (!def) throw new RangeError(`${topicId}: שלב לא קיים (${localId})`);

  const scale = def.scale || 1;
  const v = {};
  def.data.forEach(d => { v[d.key] = d.si; });
  Object.entries(def.hidden || {}).forEach(([k, val]) => { v[k] = sig(typeof val === 'function' ? val(v) : val); });

  const { root } = solveCircuit(buildTree(def.circuit, v), v.E, 0);
  const ctx = makeCtx(root, v, scale);
  const answer = sig(def.compute(ctx) / scale);
  const traps = (def.traps || []).map(t => ({ value: sig(t.f(ctx, answer)), message: t.msg }));
  // רמזים והמשמעות יכולים להיות פונקציה של (ctx, answer): כך המספרים שבטקסט נגזרים מהנתונים ולא יכולים להתפזר
  const hints = typeof def.hints === 'function' ? def.hints(ctx, answer) : def.hints;
  const meaning = typeof def.meaning === 'function' ? def.meaning(ctx, answer) : (def.meaning || '');

  const level = {
    id: localId, topicId, title: def.title, description: def.desc,
    circuitKind: 'tree', isAC: false,
    source: { voltage: v.E, freqHz: 0 },
    root, leaves: collectLeaves(root),
    display: { values: false, sourceText: def.sourceText || 'E', leafText: def.leafText || {} },
    spec: def.circuit, values: v,           // לבדיקות ולייצוא: מבנה המעגל וכל ערכי ה-SI (כולל המוסתרים)
    question: {
      prompt: `${def.story}<br>${def.ask}`,
      data: def.data.map(({ label, value }) => ({ label, value })),
      unit: def.unit, answer, hints, traps, meaning,
    },
  };
  cache.set(key, level);
  return level;
}

// ---------------------------------------------------------------- הערכת תשובה
const GENERIC_MSG = 'לא מדויק. בדקו את הנוסחה, את ההצבה ואת היחידות, ונסו שוב.';
const MAGNITUDE_MSG = 'התבקש גודל, ולכן התשובה חיובית. הערך שלכם נכון, בלי המינוס.';

export function evaluateDcAnswer(level, val) {
  const q = level.question;
  const pct = CONFIG.ANSWER_TOLERANCE_PCT;
  const near = (x, target) => Math.abs(x - target) <= Math.abs(target) * pct;

  if (near(val, q.answer)) return { outcome: 'correct', value: val };
  const trap = q.traps.find(t => near(val, t.value));
  if (trap) return { outcome: 'incorrect', value: val, message: trap.message };
  if (val !== 0 && near(val, -q.answer)) return { outcome: 'incorrect', value: val, message: MAGNITUDE_MSG };
  return { outcome: 'incorrect', value: val, message: GENERIC_MSG };
}

// ---------------------------------------------------------------- תצוגה
const SUP_DIGITS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
/** מספר לתצוגה: כתיב מדעי (×10ⁿ) לקטן מ-0.01 או גדול מ-100000, אחרת מספר רגיל. */
export function fmtNum(x) {
  const sign = x < 0 ? '−' : '';
  const a = Math.abs(x);
  if (a !== 0 && (a < 0.01 || a >= 1e5)) {
    let exp = Math.floor(Math.log10(a));
    let mant = Number((a / 10 ** exp).toPrecision(3));
    if (mant >= 10) { mant = 1; exp += 1; }
    return `${sign}${mant}×10${String(exp).split('').map(c => SUP_DIGITS[c] || c).join('')}`;
  }
  return `${sign}${Number(a.toPrecision(6))}`;
}

export function formatDcAnswer(level) {
  return `${fmtNum(level.question.answer)} ${level.question.unit}`;
}

export function dcSuccessMessage(level) {
  const q = level.question;
  const val = `<span dir="ltr">${fmtNum(q.answer)} ${q.unit}</span>`;
  return `✅ מדויק! התשובה היא ${val}.${q.meaning ? ' ' + q.meaning : ''}`;
}

/**
 * עוטף הגדרת נושא בסיסית (id/title/subtitle/color/totalLevels/generateLevel + formulas/progression)
 * בחוזה המלא: ציור המעגל המשותף, הערכה ביחס, הודעת הצלחה. אין "פסילה" בנושאים האלה.
 */
export function makeDcTopic(base) {
  return {
    ...base,
    render: renderCircuit,
    evaluateAnswer: evaluateDcAnswer,
    successMessage: dcSuccessMessage,
    formatAnswer: formatDcAnswer,
  };
}

