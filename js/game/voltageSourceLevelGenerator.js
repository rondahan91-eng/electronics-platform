// ==========================================================================
// voltageSourceLevelGenerator.js - "מקורות מתח": מקור מתח אמיתי (כא"מ ε,
// התנגדות פנימית r) מחובר בטור לעומס חיצוני R המזין מכשיר שדורש מתח
// מינימלי כדי לפעול. המתח בפועל בהדקי המקור (V) תמיד נמוך מ-ε בגלל הנפילה
// על ההתנגדות הפנימית - זו התובנה המרכזית של הנושא: מקור מתח לא תמיד נותן
// את המתח הנקוב שלו בפועל.
//
// אב-טיפוס: שלב יחיד קבוע (לא פרוצדורלי עדיין) - להערכה לפני שממשיכים
// לתכנן טיירים נוספים, באותה רוח שבה נבנו 3 השלבים הראשונים של האסטרואידים.
// ==========================================================================
import { CONFIG } from '../config.js';

const roundTo = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

const LEVEL_DEFS = [
  { emf: 12, r: 1, R: 5, vMin: 9, deviceName: 'נורת LED' },
];

function generateForLocal(localId) {
  const def = LEVEL_DEFS[localId - 1];
  const current = def.emf / (def.R + def.r);
  const terminalV = roundTo(current * def.R, 5);

  return {
    title: `מקור בעומס #${localId}`,
    desc: `מקור מתח עם כא"מ ε=${def.emf}V והתנגדות פנימית r=${def.r}Ω מחובר בטור ל${def.deviceName} בעלת התנגדות R=${def.R}Ω, הדורשת מתח של לפחות ${def.vMin}V כדי לפעול כראוי. חשבו את המתח בפועל בהדקי המקור - הוא לא בהכרח שווה ל-ε!`,
    prompt: `מקור מתח: ε=${def.emf}V, התנגדות פנימית r=${def.r}Ω. עומס חיצוני בטור: R=${def.R}Ω. מהו המתח (V) בהדקי המקור כאשר הוא מחובר לעומס הזה?`,
    answer: terminalV,
    unit: 'V',
    emf: def.emf, r: def.r, R: def.R, vMin: def.vMin, deviceName: def.deviceName,
  };
}

const cache = new Map();
export function generateVoltageLevel(localId) {
  if (cache.has(localId)) return cache.get(localId);
  const g = generateForLocal(localId);

  const question = {
    prompt: g.prompt, unit: g.unit, answer: g.answer,
    hints: [
      'חוק אוהם למעגל שלם (מקור + עומס בטור): I = ε / (R + r)',
      'המתח בהדקי המקור הוא המתח הנופל על העומס החיצוני בלבד: V = I·R (לא ε!).',
      'ε תמיד גדול מ-V כשיש עומס, כי חלק מהמתח "נאבד" על ההתנגדות הפנימית: ε = V + I·r.',
    ],
    emf: g.emf, r: g.r, R: g.R, vMin: g.vMin,
  };
  // סף "התחממות יתר" - תשובה נמוכה *מדי* מרמזת על זרם גבוה מסוכן, אותו
  // דפוס בדיוק כמו בשאר הנושאים (crashThreshold/crashFloor).
  question.crashFloor = roundTo(question.answer * 0.35, 5);

  const level = {
    id: localId, title: g.title, description: g.desc,
    world: { emf: g.emf, r: g.r, R: g.R, vMin: g.vMin, deviceName: g.deviceName },
    question,
  };
  cache.set(localId, level);
  return level;
}

export function topicLevelCount() { return LEVEL_DEFS.length; }

// ---------------------------------------------------------------- הערכת תשובה
export function evaluateVoltageAnswer(level, val) {
  const q = level.question;
  const tolerance = Math.max(Math.abs(q.answer) * CONFIG.ANSWER_TOLERANCE_PCT, 1e-9);
  const correct = Math.abs(val - q.answer) <= tolerance;
  if (correct) return { outcome: 'correct', value: val };

  if (val > q.emf) {
    return {
      outcome: 'incorrect',
      value: val,
      message: `⚡ המתח בהדקים לעולם לא יכול לעלות על הכא"מ עצמו (ε=${q.emf}V) - חלק תמיד "נאבד" על ההתנגדות הפנימית. בדקו שוב את החישוב.`,
    };
  }
  if (val < q.crashFloor) {
    return {
      outcome: 'disqualified',
      value: val,
      message: `💥 <b>המקור התחמם יתר על המידה!</b> מתח נמוך כל כך אפשרי רק אם הזרם חורג בהרבה מהצפוי - המקור ניזוק. פוסלים את הניסיון - נסו שוב.`,
    };
  }
  return {
    outcome: 'incorrect',
    value: val,
    message: '🔋 לא מדויק - בדקו את חוק אוהם למעגל השלם (כולל ההתנגדות הפנימית) ונסו שוב.',
  };
}
