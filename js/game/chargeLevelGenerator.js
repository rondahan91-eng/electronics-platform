// ==========================================================================
// chargeLevelGenerator.js - יוצר את 15 שלבי נושא "מטען, כוח ושדה חשמלי"
// בצורה פרוצדורלית ודטרמיניסטית (RNG עם seed קבוע - אותו localId תמיד מייצר
// אותו שלב). 3 טיירים: היכרות (1-5) / מכשולים דו-ממדיים (6-10) / דיוק (11-15).
// ==========================================================================
import { UC, CM, coulombForceMagnitude, electricField, netForce } from './electroEngine.js';
import { CONFIG } from '../config.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const roundTo = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

const Q_POOL = [1, 2, 3, 4, 5, 6, 8, 10];               // גדלי מטען "יפים" (µC)
const R_POOL = [5, 10, 15, 20, 25, 30];                 // מרחקים "יפים" (ס"מ)
const OBST_X_POOL = [15, 20, 25, 30, 40];               // היסט אופקי (ס"מ) לשלבי מכשולים
const OBST_Y_POOL = [10, 15, 20, 25];                   // היסט אנכי (ס"מ) לשלבי מכשולים
export const TEST_Q_UC = 1; // מטען הבוחן (הדיסקית) - קבוע וידוע לאורך כל המשחק

export const START = { x: 0, y: -35 }; // ס"מ - נקודת פתיחה של הדיסקית
export const GOAL = { x: 0, y: 35 };   // ס"מ - השער/היעד

function pickSignedQ(rng) {
  const mag = pick(rng, Q_POOL);
  return rng() > 0.5 ? mag : -mag;
}

/**
 * יעד ההצלחה הפיזיקלי בפועל: אם המטען דוחה (ממוקם *מתחת* להתחלה, כלל
 * הסימנים שמיושם למעלה) - שום דבר לא חוסם את הדרך והדיסקית אכן ממשיכה עד
 * השער. אם המטען מושך (ממוקם *בין* ההתחלה לשער) - הדיסקית נמשכת אליו
 * ונעצרת שם; היא לעולם לא ממשיכה "מעליו" עד השער בפועל, אחרת זו לא תהיה
 * משיכה אמיתית. chargeY הוא הגובה של המטען (או של שורת המטענים הסימטרית).
 */
function successTargetFor(chargeY) {
  return chargeY < START.y ? GOAL : { x: START.x, y: chargeY };
}

const HINTS = {
  force: ['חוק קולון: F = kC·|q1·q2| / r²', 'kC ≈ 9×10⁹ N·m²/C². זכרו להמיר מיקרו-קולון לקולון (×10⁻⁶) וס"מ למטר (×10⁻²) לפני ההצבה.'],
  field: ['שדה חשמלי של מטען בודד: E = kC·|q| / r²', 'השדה אינו תלוי במטען הבוחן - הוא תכונה של המרחב סביב המטען המקור.'],
  resultant: ['חשבו את הכוח מכל מטען בנפרד (חוק קולון), ואז סכמו וקטורית (בנפרד לכל ציר x ו-y).', 'גודל הכוח השקול: |F| = √(Fx² + Fy²)'],
  distance: ['הפכו את נוסחת קולון: r = √(kC·|q1·q2| / F)', 'ודאו שהכוח הנתון וגדלי המטענים כבר ביחידות SI (ניוטון וקולון) לפני ההצבה.'],
};

// ---------- טייר 1: היכרות - מטען בודד, על אותו ציר בין ההתחלה ליעד ----------
// המיקום נקבע לפי סימן המטען כך שהכוח האמיתי על הדיסקית תמיד יצביע לכיוון
// היעד: מטען דוחה (סימן זהה לבוחן החיובי) ממוקם *מתחת* לנקודת ההתחלה (הרחק
// מהיעד, כך שהדחייה דוחפת כלפי מעלה); מטען מושך ממוקם *מעל* ההתחלה, בין
// ההתחלה ליעד (כך שהמשיכה מושכת כלפי מעלה).
function genIntro(sub, rng) {
  const ask = sub % 2 === 0 ? 'force' : 'field';
  const rCm = pick(rng, R_POOL);
  const q2 = pickSignedQ(rng);
  const chargeY = q2 > 0 ? START.y - rCm : START.y + rCm;
  const chargePos = { x: START.x, y: chargeY };
  const charges = [{ q: q2, x: chargePos.x, y: chargePos.y, label: 'Q1' }];

  let answer, prompt, unit;
  if (ask === 'force') {
    answer = roundTo(coulombForceMagnitude(TEST_Q_UC * UC, q2 * UC, rCm * CM), 5);
    prompt = `מטען Q1=${q2}µC נמצא במרחק ${rCm} ס"מ מהדיסקית הטעונה (q=+${TEST_Q_UC}µC). מהו גודל הכוח (F) הפועל על הדיסקית?`;
    unit = 'N';
  } else {
    answer = roundTo(electricField(q2 * UC, rCm * CM), 4);
    prompt = `מטען Q1=${q2}µC נמצא במרחק ${rCm} ס"מ מנקודת הדיסקית. מהו גודל השדה החשמלי (E) באותה נקודה?`;
    unit = 'N/C';
  }
  return {
    ask, charges, answer, unit, prompt,
    title: `שער היכרות #${sub + 1}`,
    desc: 'הדיסקית הטעונה ניצבת מול מטען בודד. חשבו את הכוח או השדה הפועלים עליה כדי להוביל אותה אל השער.',
    successTarget: successTargetFor(chargeY),
  };
}

// ---------- טייר 2: מכשולים - שני מטענים במיקומים דו-ממדיים שונים ----------
// שני המטענים מוצבים בהצבה סימטרית משני צידי ציר ה-y (אותו סימן, אותו גודל,
// אותו גובה) - כך שרכיבי ה-x של שני הכוחות מתבטלים בדיוק (סופרפוזיציה
// אמיתית, דו-ממדית), ורק רכיב ה-y נשאר. הגובה נבחר לפי אותו כלל סימן כמו
// בטייר 1, כך שהכוח השקול האמיתי תמיד יצביע לכיוון היעד.
function genObstacle(sub, rng) {
  const sign = rng() > 0.5 ? 1 : -1;
  const mag = pick(rng, Q_POOL);
  const q1 = sign * mag, q2 = sign * mag;
  const xOff = pick(rng, OBST_X_POOL);
  const yOff = pick(rng, OBST_Y_POOL);
  const chargeY = sign > 0 ? START.y - yOff : START.y + yOff;
  const pos1 = { x: xOff, y: chargeY };
  const pos2 = { x: -xOff, y: chargeY };
  const charges = [
    { q: q1, x: pos1.x, y: pos1.y, label: 'Q1' },
    { q: q2, x: pos2.x, y: pos2.y, label: 'Q2' },
  ];
  const sources = charges.map(c => ({ q: c.q * UC, x: c.x * CM, y: c.y * CM }));
  const testPosM = { x: START.x * CM, y: START.y * CM };
  const result = netForce(sources, TEST_Q_UC * UC, testPosM);
  const answer = roundTo(result.magnitude, 5);

  return {
    ask: 'resultant', charges, answer, unit: 'N',
    prompt: `שני מטענים קבועים (Q1=${q1}µC ב-(${pos1.x},${pos1.y}) ס"מ, Q2=${q2}µC ב-(${pos2.x},${pos2.y}) ס"מ) פועלים יחד על הדיסקית הטעונה שבנקודה (${START.x},${START.y}). מהו גודל הכוח השקול (F) הפועל עליה?`,
    title: `מעקף מכשולים #${sub + 1}`,
    desc: 'שני מטענים קבועים משפיעים יחד על הדיסקית. חשבו את הכוח השקול (הווקטורי, עקרון הסופרפוזיציה) כדי לדעת אם היא תעבור את המכשול בבטחה.',
    successTarget: successTargetFor(chargeY),
  };
}

// ---------- טייר 3: דיוק - נתון כוח נדרש, יש לחשב מרחק ----------
// Q2 (המטען שיש להציב) אינו מוצג מראש - זו בדיוק התשובה שהתלמיד/ה מחשבים.
// מיקומו האמיתי (לצורך אנימציית ההצלחה בלבד) נקבע לפי אותו כלל סימן כמו
// בטייר 1: מטען דוחה מתחת להתחלה, מטען מושך מעליה - כך שהכוח האמיתי תמיד
// יצביע לכיוון היעד. מטען הבוחן עצמו קבוע תמיד על q=+TEST_Q_UCµC (כמו שמוצג
// על הדיסקית עצמה בכל שלב אחר), לא גודל אקראי.
function genPrecision(sub, rng) {
  const q2Sign = rng() > 0.5 ? 1 : -1;
  const q2 = q2Sign * pick(rng, Q_POOL);
  const rCm = pick(rng, R_POOL);
  const trueForce = coulombForceMagnitude(TEST_Q_UC * UC, q2 * UC, rCm * CM);
  const forceRounded = roundTo(trueForce, 5);
  const chargeY = q2 > 0 ? START.y - rCm : START.y + rCm;
  const hiddenCharges = [{ q: q2, x: START.x, y: chargeY, label: 'Q2' }];

  return {
    ask: 'distance', charges: [], hiddenCharges, q1UC: TEST_Q_UC, q2UC: q2, answer: rCm, unit: 'ס"מ',
    prompt: `כדי לפרוץ את המחסום נדרש כוח של F=${forceRounded}N בין מטען Q2=${q2}µC לבין הדיסקית הטעונה (q=+${TEST_Q_UC}µC). באיזה מרחק (r) יש להציב את Q2?`,
    title: `דיוק קטלני #${sub + 1}`,
    desc: 'נתון הכוח הנדרש לפריצת המחסום. חשבו את המרחק המדויק להצבת המטען - יותר מדי קרוב והדיסקית תתרסק, יותר מדי רחוק והיא לא תגיע.',
    trueForceOverride: forceRounded,
    successTarget: successTargetFor(chargeY),
  };
}

function generateForLocal(localId, rng) {
  if (localId <= 5) return genIntro(localId - 1, rng);
  if (localId <= 10) return genObstacle(localId - 6, rng);
  return genPrecision(localId - 11, rng);
}

const cache = new Map();
export function generateChargeLevel(localId) {
  if (cache.has(localId)) return cache.get(localId);
  const rng = mulberry32(7351 * localId + 54321);
  const g = generateForLocal(localId, rng);

  const question = {
    ask: g.ask, prompt: g.prompt, unit: g.unit, answer: g.answer, hints: HINTS[g.ask] || [],
  };
  if (g.ask === 'distance') {
    question.q1UC = g.q1UC;
    question.q2UC = g.q2UC;
    question.trueForceN = g.trueForceOverride;
  } else if (g.ask !== 'field') {
    question.trueForceN = g.answer;
  }
  // סף "התרסקות" - מרווח ביטחון רנדומלי, באותו דפוס כמו maxPower במעגלים
  if (question.trueForceN != null) {
    const margin = 0.4 + rng() * 0.35;
    question.crashThreshold = roundTo(question.trueForceN / margin, 5);
  }

  const level = {
    id: localId, title: g.title, description: g.desc,
    world: {
      start: START, goal: GOAL, charges: g.charges, hiddenCharges: g.hiddenCharges || [],
      successTarget: g.successTarget || GOAL,
    },
    testChargeUC: TEST_Q_UC,
    question,
  };
  cache.set(localId, level);
  return level;
}

export function topicLevelCount() { return 15; }

// ---------------------------------------------------------------- הערכת תשובה
export function evaluateChargeAnswer(level, val) {
  const q = level.question;
  const tolerance = Math.max(Math.abs(q.answer) * CONFIG.ANSWER_TOLERANCE_PCT, q.ask === 'distance' ? 0.2 : 1e-9);
  const correct = Math.abs(val - q.answer) <= tolerance;

  if (q.ask === 'field') {
    if (correct) return { outcome: 'correct' };
    return { outcome: 'incorrect', message: '⚡ לא מדויק. בדקו שוב את נוסחת השדה החשמלי.' };
  }
  if (correct) return { outcome: 'correct' };

  // "כוח היפותטי" שהתשובה הזו הייתה גורמת לו במציאות, לצורך סיווג התוצאה
  let hypF;
  if (q.ask === 'distance') {
    const rM = Math.max(Math.abs(val), 1e-6) * CM;
    hypF = coulombForceMagnitude(q.q1UC * UC, q.q2UC * UC, rM);
  } else {
    hypF = Math.abs(val);
  }

  if (hypF > q.crashThreshold) {
    return {
      outcome: 'disqualified',
      message: `💥 <b>הדיסקית התרסקה!</b> התשובה שהזנתם הייתה גורמת לכוח של כ-${roundTo(hypF, 3)}N - חזק מדי לעמוד בו (הסף: ${q.crashThreshold}N). פוסלים את הניסיון - נסו שוב.`,
    };
  }
  const variant = hypF < q.trueForceN ? 'weak' : 'strong';
  const message = variant === 'weak'
    ? '🔋 חלש מדי - הדיסקית לא הגיעה ליעד. בדקו שוב את החישוב.'
    : '⚡ לא מדויק - קרוב, אך לא מספיק. בדקו שוב את החישוב.';
  return { outcome: 'incorrect', message, variant };
}
