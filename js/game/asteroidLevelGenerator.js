// ==========================================================================
// asteroidLevelGenerator.js - "ניווט בין אסטרואידים טעונים": ספינת החלל
// (מטען קבוע q1) טסה כלפי מעלה במסלול ישר; אסטרואיד/ים טעונים במיקומים
// דו-ממדיים (x,y בס"מ, יחסית לספינה) מפעילים עליה כוח. התלמיד/ה מחשב/ת את
// רכיב הכוח האופקי (Fx) שעל מנועי הספינה להפעיל כדי לאזן את ההשפעה
// המשולבת ולהישאר במסלול - כולל סימן (חיובי=ימינה, שלילי=שמאלה).
//
// טייר 1 (1-3): אסטרואיד בודד תמיד ישירות בצד המסלול (y=0) - מבוא לחוק
// קולון עם סימן, בלי צורך בפירוק וקטורי.
// טייר 2 (4+): כמה אסטרואידים במיקומים שרירותיים - עקרון הסופרפוזיציה
// האמיתי (משתמש ב-netForce הווקטורי מ-electroEngine.js, ששימש בעבר רק
// בנושא הישן chargeLevelGenerator.js).
//
// תובנה מבנית (חלה על שני הטיירים): "answer" תמיד מייצג את הכוח שעל
// המנועים להפעיל (לא את הכוח הגולמי שהאסטרואידים מפעילים) - כלומר
// answer = -Fx_שקול. זו הסיבה שברגע שמזינים ערך val, השארית `val - answer`
// היא בדיוק הכוח השקול העולמי שנשאר על הספינה, בלי צורך בשום הבחנת מקרים
// בין טייר אחד לכמה מקורות - אותה נוסחה בדיוק לכל הטיירים.
// ==========================================================================
import { UC, CM, netForce } from './electroEngine.js';
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
const roundTo = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

export const SHIP_Q_UC = 1; // מטען הספינה - קבוע וידוע לאורך כל המשחק

/** מחשב את הכוח שעל המנועים להפעיל (הופכי לרכיב ה-x השקול) מרשימת אסטרואידים חתומים. */
function requiredEngineForceX(asteroids) {
  const sources = asteroids.map(a => ({ q: a.q * UC, x: a.x * CM, y: a.y * CM }));
  const result = netForce(sources, SHIP_Q_UC * UC, { x: 0, y: 0 });
  return -result.fx;
}

// טייר 1 - קושי עולה (מרחק קטן יותר / מטען גדול יותר / זמן קצר יותר).
const TIER1_DEFS = [
  { r: 30, qAbs: 4, timeLimitSeconds: 16 },
  { r: 20, qAbs: 6, timeLimitSeconds: 13 },
  { r: 12, qAbs: 9, timeLimitSeconds: 10 },
];

const TIER1_HINTS = [
  'חוק קולון עם סימן: F = kC·q1·q2 / r² - הציבו את המטענים כולל הסימן שלהם, בלי ערך מוחלט.',
  'קונבנציית סימנים: תוצאה חיובית = דחייה (מטענים באותו סימן), תוצאה שלילית = משיכה (מטענים מנוגדים).',
  'kC ≈ 9×10⁹ N·m²/C². זכרו להמיר מיקרו-קולון לקולון (×10⁻⁶) וס"מ למטר (×10⁻²) לפני ההצבה.',
];

function genTier1(sub, rng) {
  const def = TIER1_DEFS[sub];
  const sign = rng() > 0.5 ? 1 : -1;
  const q2 = sign * def.qAbs;
  const asteroids = [{ q: q2, x: def.r, y: 0 }];
  const forceRounded = roundTo(requiredEngineForceX(asteroids), 5);
  const kind = sign > 0 ? 'דוחה' : 'מושך';

  return {
    title: `מעבר אסטרואיד #${sub + 1}`,
    desc: `ספינת החלל שלך (מטען q1=+${SHIP_Q_UC}µC) טסה כלפי מעלה במסלול ישר. אסטרואיד ${kind} טעון במרחק r מהמסלול מפעיל עליה כוח צדדי. חשבו את הכוח עם סימן - מחשב הניווט יפעיל את הכוח הנגדי המדויק בהתאם.`,
    prompt: `האסטרואיד טעון במטען Q=${q2}µC, במרחק r=${def.r} ס"מ מהספינה הטעונה (q1=+${SHIP_Q_UC}µC). מהו הכוח F שהאסטרואיד מפעיל על הספינה, כולל סימן? (חיובי = דחייה, שלילי = משיכה).`,
    answer: forceRounded,
    unit: 'N',
    asteroids,
    hints: TIER1_HINTS,
    timeLimitSeconds: def.timeLimitSeconds,
  };
}

// טייר 2 - כמה אסטרואידים במיקומים דו-ממדיים שרירותיים (ס"מ, יחסית לספינה
// שבנקודה (0,0)). x חיובי = ימינה, y חיובי = כלפי מעלה (בכיוון הטיסה).
const TIER2_DEFS = [
  {
    asteroids: [{ qAbs: 5, x: -25, y: 18 }, { qAbs: 7, x: 30, y: -12 }],
    timeLimitSeconds: 25,
  },
];

const TIER2_HINTS = [
  'חשבו את הכוח מכל אסטרואיד בנפרד לפי חוק קולון, ופרקו אותו לרכיבים x,y לפי הזווית האמיתית של המיקום שלו.',
  'סכמו את רכיבי ה-x בלבד משני האסטרואידים (עקרון הסופרפוזיציה) - זהו הכוח השקול (Fx) הפועל על הספינה.',
  'הכוח שעל המנועים להפעיל הוא ההופכי (במינוס) לכוח השקול שחישבתם - זה מה שמאזן ומחזיר למסלול הישר.',
];

function genTier2(sub, rng) {
  const def = TIER2_DEFS[sub];
  const asteroids = def.asteroids.map(a => ({
    q: (rng() > 0.5 ? 1 : -1) * a.qAbs, x: a.x, y: a.y,
  }));
  const forceRounded = roundTo(requiredEngineForceX(asteroids), 5);
  const list = asteroids.map((a, i) => `Q${i + 1}=${a.q > 0 ? '+' : ''}${a.q}µC ב-(${a.x},${a.y}) ס"מ`).join(', ');

  return {
    title: `שדה אסטרואידים #${sub + 1}`,
    desc: `ספינת החלל שלך (מטען q1=+${SHIP_Q_UC}µC) טסה כלפי מעלה במסלול ישר. שני אסטרואידים טעונים מפעילים עליה יחד כוח משולב. חשבו את רכיב הכוח האופקי השקול (עקרון הסופרפוזיציה) עם סימן.`,
    prompt: `שני אסטרואידים קבועים פועלים יחד על הספינה הטעונה (q1=+${SHIP_Q_UC}µC) שבנקודה (0,0): ${list}. מהו הכוח (הרכיב האופקי Fx, עם סימן) שעל מנועי הספינה להפעיל כדי לאזן את ההשפעה המשולבת ולהישאר במסלול הישר? (חיובי = דחיפה ימינה, שלילי = דחיפה שמאלה).`,
    answer: forceRounded,
    unit: 'N',
    asteroids,
    hints: TIER2_HINTS,
    timeLimitSeconds: def.timeLimitSeconds,
  };
}

function generateForLocal(localId, rng) {
  if (localId <= TIER1_DEFS.length) return genTier1(localId - 1, rng);
  return genTier2(localId - TIER1_DEFS.length - 1, rng);
}

const cache = new Map();
export function generateAsteroidLevel(localId) {
  if (cache.has(localId)) return cache.get(localId);
  const rng = mulberry32(9137 * localId + 4211);
  const g = generateForLocal(localId, rng);

  const question = {
    prompt: g.prompt, unit: g.unit, answer: g.answer, hints: g.hints,
    trueForceN: g.answer, // שם ישן שנשמר לתאימות פנימית - זהה תמיד ל-answer
  };
  // סף "התחממות יתר" - מרווח ביטחון רנדומלי על *גודל* הכוח (בלי קשר לסימן),
  // באותו דפוס כמו maxPower במעגלים וכמו crashThreshold בנושא הישן.
  const margin = 0.4 + rng() * 0.35;
  question.crashThreshold = roundTo(Math.abs(question.trueForceN) / margin, 5);

  const level = {
    id: localId, title: g.title, description: g.desc,
    world: { shipQUC: SHIP_Q_UC, asteroids: g.asteroids },
    timeLimitSeconds: g.timeLimitSeconds,
    question,
  };
  cache.set(localId, level);
  return level;
}

export function topicLevelCount() { return TIER1_DEFS.length + TIER2_DEFS.length; }

// ---------------------------------------------------------------- הערכת תשובה
export function evaluateAsteroidAnswer(level, val) {
  const q = level.question;
  const tolerance = Math.max(Math.abs(q.answer) * CONFIG.ANSWER_TOLERANCE_PCT, 1e-9);
  const correct = Math.abs(val - q.answer) <= tolerance;
  if (correct) return { outcome: 'correct', value: val };

  if (Math.abs(val) > q.crashThreshold) {
    return {
      outcome: 'disqualified',
      value: val,
      message: `💥 <b>התחממות יתר במנוע!</b> גודל הכוח שהזנתם (כ-${roundTo(Math.abs(val), 3)}N) חזק מדי - המנוע נכשל (הסף: ${q.crashThreshold}N). פוסלים את הניסיון - נסו שוב.`,
    };
  }

  const wrongSign = val !== 0 && Math.sign(val) !== Math.sign(q.answer);
  const multi = level.world.asteroids.length > 1;
  const message = wrongSign
    ? (multi
      ? '🧭 בדקו שוב את הסימן - ודאו שסיכמתם נכון את רכיבי ה-x משני האסטרואידים (כיוון + גודל של כל אחד). המנוע הפעיל כוח בכיוון ההפוך והחמיר את הסטייה.'
      : '🧭 בדקו שוב את הסימן - האם המטענים דוחים (כוח חיובי) או מושכים (כוח שלילי) זה את זה? המנוע הפעיל כוח בכיוון ההפוך והחמיר את הסטייה.')
    : '🚀 לא מדויק מספיק - הספינה סוטה מהמסלול הבטוח. בדקו שוב את החישוב.';
  return { outcome: 'incorrect', message, value: val };
}
