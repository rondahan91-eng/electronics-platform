// ==========================================================================
// meshLevelGenerator.js - "שיטת זרמי החוגים" (סעיף 9.1 בתוכנית): 24 שלבים, אותם 24 תרגילים מספריים של חוברת התלמיד
// (שאלות 2.1-2.8, 3.1-3.8, 4.1-4.8). מעגל כללי אחד, בנוי משתי לולאות:
//   לולאה 1 (שמאל): מקור E₁ בטור עם R₁.   לולאה 2 (ימין): מקור E₂ בטור עם R₃.   R₂ הנגד המשותף (הענף החופף).
//   שני זרמי הלולאה I₁, I₂ בכיוון השעון. הזרם בענף המשותף I(R₂) = I₁ − I₂, חיובי כלפי מטה (בכיוון I₁).
// שלבים 1-3: נדרשים רק זרמי שני החוגים. משלב 4: גם הזרם בענף המשותף. כל זרם נבדק בשורה משלו
// (question.lines, ראו gameEngine.js), והשלב נפתר רק כשכל השורות אושרו. הפתרון עצמו נכתב בנפרד (במחברת).
// התשובות מחושבות מהנתונים בחשבון מדויק (כלל קרמר), לא קשיחות. הרמזים (5) מופיעים על גבי המעגל (meshRenderer.js).
// משוואות בתוך משפטים בעברית עטופות ב-<span dir="ltr"> (ltr): אחרת ה-bidi של הדפדפן מערבב את סדר הסימנים והגורמים.
// ==========================================================================
import { CONFIG } from '../config.js';

const TOPIC = 'mesh';

// [סעיף בחוברת, R1, R2, R3, E1, E2, rev]  rev: 0 = שני המקורות בכיוון הסבב, 1 = E1 הפוך, 2 = E2 הפוך
const DEFS = [
  ['2.1', 1, 3, 2, 12, 2, 0], ['2.2', 2, 2, 2, 10, 10, 0], ['2.3', 3, 1, 4, 14, 6, 0], ['2.4', 4, 1, 3, 7, 10, 0],
  ['2.5', 2, 4, 3, 14, 8, 0], ['2.6', 3, 2, 5, 22, 16, 0], ['2.7', 5, 2, 1, 6, 8, 0], ['2.8', 2, 1, 2, 16, 8, 0],
  ['3.1', 2, 1, 2, 6, 10, 2], ['3.2', 4, 1, 3, 6, 5, 1], ['3.3', 4, 3, 2, 17, 15, 0], ['3.4', 2, 2, 5, 14, 11, 0],
  ['3.5', 3, 2, 6, 26, 4, 0], ['3.6', 4, 3, 5, 26, 9, 0], ['3.7', 2, 1, 3, 1, 15, 1], ['3.8', 1, 2, 3, 13, 6, 0],
  ['4.1', 6, 4, 10, 42, 8, 0], ['4.2', 4, 5, 3, 44, 14, 2], ['4.3', 10, 6, 4, 62, 62, 1], ['4.4', 12, 8, 6, 56, 10, 0],
  ['4.5', 5, 15, 10, 45, 35, 0], ['4.6', 9, 3, 6, 42, 27, 2], ['4.7', 4, 12, 8, 28, 76, 1], ['4.8', 7, 5, 9, 52, 26, 0],
];

const FIRST_SHARED_LEVEL = 4; // משלב זה נדרש גם הזרם בענף המשותף
const sig = x => (Math.abs(x) < 1e-9 ? 0 : Number(Number(x).toPrecision(6)));
const num = x => String(sig(x)).replace('-', '−');
const ltr = s => `<span dir="ltr">${s}</span>`;
const pctOf = () => CONFIG.ANSWER_TOLERANCE_PCT;
const near = (x, t, pct = pctOf()) => Math.abs(x - t) <= Math.max(Math.abs(t) * pct, 1e-9);

/** פתרון מערכת שתי משוואות הלולאה: a·I1 + k·R2·I2 = e1, k·R2·I1 + c·I2 = e2  (k = −1 תקין, k = +1 הטעות הנפוצה). */
function solve(R1, R2, R3, e1, e2, k = -1) {
  const a = R1 + R2, c = R2 + R3;
  const det = a * c - R2 * R2;
  return { I1: (e1 * c - k * R2 * e2) / det, I2: (a * e2 - k * R2 * e1) / det, det };
}

// ---------------------------------------------------------------- הסברים
const DESC_BASE = 'בשיטת זרמי החוגים מגדירים לכל לולאה זרם עזר, כאן בכיוון השעון, וכותבים לכל לולאה משוואה לפי חוק המתחים. '
  + 'R₂ משותף לשתי הלולאות, ולכן בכל משוואה מופיע גם זרם הלולאה השכנה, בסימן מינוס. '
  + 'את הפתרון כותבים בנפרד, במחברת. כאן מזינים את התוצאה בכל שורה ומקבלים אישור לכל זרם בנפרד.';
const DESC_SHARED = ` הזרם האמיתי בענף המשותף הוא ההפרש בין שני זרמי הלולאה: ${ltr('I(R₂) = I₁ − I₂')}. התוצאה חיובית כשהזרם זורם כלפי מטה, בכיוון I₁, ושלילית כשהוא זורם כלפי מעלה, בכיוון I₂.`;

// ---------------------------------------------------------------- הודעות למלכודות
const M_SIGN = 'נראה שהתעלמתם מהקוטביות ההפוכה: מקור שמחובר נגד כיוון הסבב נכנס למשוואה עם סימן מינוס.';
const M_COUPLE = `בנגד המשותף זרם הלולאה השכנה נכנס עם סימן מינוס: ${ltr('−R₂·I₂')} במשוואה הראשונה ו-${ltr('−R₂·I₁')} בשנייה. הסימן אצלכם שגוי.`;
const M_ALONE_1 = 'התעלמתם מהלולאה השכנה. R₂ משותף לשתי הלולאות, ולכן זרם הלולאה השנייה, I₂, נכנס גם למשוואה של לולאה 1.';
const M_ALONE_2 = 'התעלמתם מהלולאה השכנה. R₂ משותף לשתי הלולאות, ולכן זרם הלולאה הראשונה, I₁, נכנס גם למשוואה של לולאה 2.';
const SIGN_I = 'הגודל נכון, אבל הסימן הפוך. זרם לולאה שלילי פירושו שהזרם זורם בפועל נגד כיוון השעון שנבחר.';
const SIGN_R2 = 'הגודל נכון, אבל הסימן הפוך. חיובי פירושו כלפי מטה, בכיוון I₁, ושלילי כלפי מעלה, בכיוון I₂.';

function buildLevel(localId) {
  const def = DEFS[localId - 1];
  if (!def) throw new RangeError(`${TOPIC}: שלב לא קיים (${localId})`);
  const [ref, R1, R2, R3, E1, E2, rev] = def;
  const rev1 = rev === 1, rev2 = rev === 2;
  const e1 = rev1 ? -E1 : E1, e2 = rev2 ? -E2 : E2;
  const { I1, I2 } = solve(R1, R2, R3, e1, e2);
  const IR2 = I1 - I2;
  const withShared = localId >= FIRST_SHARED_LEVEL;

  // ---- מלכודות: כל אחת היא ערך שטעות מסוימת נותנת בפועל. ערך שקרוב לתשובה (עד 5%) לא נכלל: הוא היה מקבל
  // הודעה ספציפית שאינה נכונה לתלמיד שרק עיגל לא מדויק.
  const wrongK = solve(R1, R2, R3, e1, e2, +1);                  // סימן שגוי לאיבר הצימוד
  const noSign = (rev1 || rev2) ? solve(R1, R2, R3, E1, E2) : null; // התעלמות מהקוטביות ההפוכה
  const makeTraps = (ans, cands, cap = 4) => {
    const out = [];
    for (const t of cands) {
      const v = sig(t.v);
      if (!isFinite(v) || near(v, ans, 0.05) || (ans !== 0 && near(v, -ans, 0.05))) continue;
      if (out.some(o => near(v, o.value) || near(o.value, v))) continue;
      out.push({ value: v, message: t.msg });
      if (out.length === cap) break;
    }
    return out;
  };

  const trapsI1 = makeTraps(I1, [
    { v: I2, msg: 'זה זרם הלולאה השנייה (I₂). I₁ הוא זרם הלולאה השמאלית.' },
    ...(noSign ? [{ v: noSign.I1, msg: M_SIGN }] : []),
    { v: wrongK.I1, msg: M_COUPLE },
    { v: e1 / (R1 + R2), msg: M_ALONE_1 },
  ]);
  const trapsI2 = makeTraps(I2, [
    { v: I1, msg: 'זה זרם הלולאה הראשונה (I₁). I₂ הוא זרם הלולאה הימנית.' },
    ...(noSign ? [{ v: noSign.I2, msg: M_SIGN }] : []),
    { v: wrongK.I2, msg: M_COUPLE },
    { v: e2 / (R2 + R3), msg: M_ALONE_2 },
  ]);
  const trapsIR2 = makeTraps(IR2, [
    { v: I1 + I2, msg: 'הזרם בענף המשותף הוא ההפרש בין זרמי הלולאה, I₁ − I₂, ולא הסכום שלהם.' },
    { v: I1, msg: 'זה זרם לולאה 1 עצמו. בענף המשותף עוברים שני זרמי לולאה בכיוונים מנוגדים, וזרם הענף הוא ההפרש ביניהם.' },
    { v: I2, msg: 'זה זרם לולאה 2 עצמו. בענף המשותף עוברים שני זרמי לולאה בכיוונים מנוגדים, וזרם הענף הוא ההפרש ביניהם.' },
    ...(noSign ? [{ v: noSign.I1 - noSign.I2, msg: M_SIGN }] : []),
    { v: wrongK.I1 - wrongK.I2, msg: M_COUPLE },
  ], 5);

  const lines = [
    { key: 'I1', label: 'I₁ · זרם לולאה 1 (השמאלית)', unit: 'A', answer: sig(I1), traps: trapsI1, signMessage: SIGN_I },
    { key: 'I2', label: 'I₂ · זרם לולאה 2 (הימנית)', unit: 'A', answer: sig(I2), traps: trapsI2, signMessage: SIGN_I },
  ];
  if (withShared) lines.push({ key: 'IR2', label: 'I(R₂) · הזרם בענף המשותף (חיובי כלפי מטה)', unit: 'A', answer: sig(IR2), traps: trapsIR2, signMessage: SIGN_R2 });

  // ---- רמזים: 5 מדרגות. הציור והמשוואות מופיעים על גבי המעגל (overlay), והטקסט כאן הוא ההסבר הנלווה
  const sym1 = `(R₁ + R₂)·I₁ − R₂·I₂ = ${rev1 ? '−' : ''}E₁`;
  const sym2 = `−R₂·I₁ + (R₂ + R₃)·I₂ = ${rev2 ? '−' : ''}E₂`;
  const num1 = `(${R1} + ${R2})·I₁ − ${R2}·I₂ = ${rev1 ? '−' : ''}${E1}`;
  const num2 = `−${R2}·I₁ + (${R2} + ${R3})·I₂ = ${rev2 ? '−' : ''}${E2}`;
  const D = (R1 + R2) * (R2 + R3) - R2 * R2;
  const N1 = e1 * (R2 + R3) + R2 * e2;
  const step = `${D}·I₁ = ${num(N1)}`;
  const hints = [
    'על המעגל מסורטטים שני זרמי הלולאה, שניהם בכיוון השעון: I₁ בלולאה השמאלית ו-I₂ בלולאה הימנית. סרטטו אותם גם במחברת.',
    `משוואת הלולאה הראשונה, בסימנים בלבד, נכתבה בתוך הלולאה: ${ltr(sym1)}. היא באה מחוק המתחים לאורך הלולאה.${rev1 ? ' E₁ מחובר נגד כיוון הסבב, ולכן הוא מופיע עם מינוס.' : ''}`,
    `משוואת הלולאה השנייה, בסימנים בלבד, נכתבה בתוך הלולאה: ${ltr(sym2)}.${rev2 ? ' E₂ מחובר נגד כיוון הסבב, ולכן הוא מופיע עם מינוס.' : ''}`,
    `אותן משוואות עם הערכים נכתבו על המעגל: ${ltr(num1)} ו-${ltr(num2)}.`,
    `מחסלים את I₂: מכפילים את המשוואה הראשונה ב-${ltr('(R₂ + R₃)')} ואת השנייה ב-${ltr('R₂')}, ומחברים. מקבלים משוואה בנעלם אחד: ${ltr(step)}. אחרי שמוצאים את I₁ מציבים אותו באחת המשוואות כדי למצוא את I₂.`,
  ];

  const sourceNote = rev1 ? ' מקור E₁ מחובר בכיוון הפוך לכיוון הסבב של לולאה 1.'
    : rev2 ? ' מקור E₂ מחובר בכיוון הפוך לכיוון הסבב של לולאה 2.' : '';
  const story = 'מעגל בנוי משתי לולאות: בלולאה 1 המקור E₁ והנגד R₁, בלולאה 2 המקור E₂ והנגד R₃, ו-R₂ משותף לשתיהן. שני זרמי הלולאה בכיוון השעון.' + sourceNote;
  const ask = withShared
    ? 'מצאו את זרמי הלולאה I₁ ו-I₂, ואת הזרם בענף המשותף. הזרם בענף המשותף חיובי כשהוא זורם כלפי מטה, ושלילי כשהוא זורם כלפי מעלה.'
    : 'מצאו את זרמי הלולאה I₁ ו-I₂.';

  return {
    id: localId, topicId: TOPIC,
    title: `זרמי חוגים #${localId}`,
    description: DESC_BASE + (withShared ? DESC_SHARED : ''),
    source: { voltage: Math.max(E1, E2), freqHz: 0 },
    mesh: {
      ref, R1, R2, R3, E1, E2, rev1, rev2,                 // ערכי SI (אוהם, וולט)
      I1: sig(I1), I2: sig(I2), IR2: sig(IR2),            // זרמים מסומנים (אמפר) - לאנימציה ולבדיקות
      withShared,
      overlay: { symbolic: [sym1, sym2], numeric: [num1, num2], step },
    },
    question: {
      prompt: `${story}<br>${ask}`,
      data: [
        { label: 'התנגדות R₁', value: `${R1} Ω` }, { label: 'התנגדות R₂ (משותפת)', value: `${R2} Ω` }, { label: 'התנגדות R₃', value: `${R3} Ω` },
        { label: 'מקור E₁', value: `${E1} V` }, { label: 'מקור E₂', value: `${E2} V` },
      ],
      unit: 'A', answer: sig(I1), lines, hints,
    },
  };
}

const cache = new Map();
export function generateMeshLevel(localId) {
  if (!cache.has(localId)) cache.set(localId, buildLevel(localId));
  return cache.get(localId);
}
export function meshLevelCount() { return DEFS.length; }

// ---------------------------------------------------------------- הערכת שורה (זרם אחד)
const GENERIC = 'לא מדויק. בדקו את המשוואות ואת הפתרון שכתבתם בנפרד, ונסו שוב.';
export function evaluateMeshLine(level, key, val) {
  const line = level.question.lines.find(l => l.key === key);
  if (!line) throw new Error('mesh: שורה לא קיימת ' + key);
  if (near(val, line.answer)) return { outcome: 'correct', value: val };
  const trap = line.traps.find(t => near(val, t.value));
  if (trap) return { outcome: 'incorrect', value: val, message: trap.message };
  if (line.answer !== 0 && near(val, -line.answer)) return { outcome: 'incorrect', value: val, message: line.signMessage };
  return { outcome: 'incorrect', value: val, message: GENERIC };
}

export function formatMeshAnswer(level) {
  const parts = level.question.lines.map(l => `${l.key === 'IR2' ? 'I(R₂)' : l.key === 'I1' ? 'I₁' : 'I₂'} = ${num(l.answer)} A`);
  return parts.join(' · ');
}
