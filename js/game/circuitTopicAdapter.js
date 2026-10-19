// ==========================================================================
// circuitTopicAdapter.js - עוטף את מנוע המעגלים הקיים (circuitEngine /
// circuitRenderer / levelGenerator) בחוזה ה-"נושא" הכללי שגם gameEngine.js
// וגם נושאים אחרים (למשל מטען/שדה) משתמשים בו. הפיזיקה לא השתנתה; ההערכה היא
// ביחס של 3% בלבד (בלי רצפה מוחלטת), ושלבים עם level.noBurn (שלבי המרת היחידות
// ב-levelGenerator.js) מדלגים על בדיקת העומס ומקבלים תשובה ביחידה question.unit.
// ==========================================================================
import { renderCircuit, triggerBurnAnimation, clearBurnMarks } from './circuitRenderer.js';
import { findNode } from './circuitEngine.js';
import { CONFIG } from '../config.js';
import { fmtTime } from '../ui.js';

const GENERIC_INCORRECT = '⚡ לא מדויק. בדקו שוב את הנוסחה ונסו שוב.';
const MAGNITUDE_MSG = 'התבקש גודל, ולכן התשובה חיובית. הערך שלכם נכון, בלי המינוס.';

// הערכה יחסית בלבד (3%, בלי רצפה מוחלטת): תשובה קטנה כמו 0.008 חייבת להיות קרובה אליה באמת.
const near = (x, target) => Math.abs(x - target) <= Math.abs(target) * CONFIG.ANSWER_TOLERANCE_PCT;

function evaluateCircuitAnswer(level, val) {
  const q = level.question;
  const target = q.targetId && level.circuitKind === 'tree' ? findNode(level.root, q.targetId) : null;

  // בדיקת עומס-יתר (הספק) - רלוונטית לשאלות זרם/מתח/הספק על נגד.
  // שלבים עם level.noBurn (שלבי המרת היחידות) מדלגים עליה לגמרי. הערך שהוקלד הוא ביחידה המבוקשת (mA, mW...),
  // לכן ממירים אותו ל-SI לפי question.scale לפני חישוב ההספק ההיפותטי (בלי scale: 1, כלומר ללא שינוי).
  if (!level.noBurn && target && target.kind === 'r' && ['current', 'voltage', 'power'].includes(q.ask)) {
    const valSI = val * (q.scale || 1);
    let hypPower;
    if (q.ask === 'power') hypPower = valSI;
    else if (q.ask === 'current') hypPower = valSI * valSI * target.value;
    else hypPower = (valSI * valSI) / target.value;
    if (hypPower > target.maxPower) {
      const pRounded = Math.round(hypPower * 100) / 100;
      return {
        outcome: 'disqualified',
        message: `🔥 <b>${target.label} נשרף!</b> התשובה שהזנתם הייתה גורמת להספק של כ-${pRounded} W על רכיב שסובל עד ${target.maxPower} W בלבד. פוסלים את הניסיון - נסו שוב.`,
        disqualifyTargetId: target.id,
      };
    }
  }

  if (near(val, q.answer)) return { outcome: 'correct' };
  // שלבים עם question.traps (שלבי המרת היחידות) מסבירים את הטעות הנפוצה; בלי traps - ההודעה הכללית
  const trap = Array.isArray(q.traps) ? q.traps.find(t => near(val, t.value)) : null;
  if (trap) return { outcome: 'incorrect', message: trap.message };
  // התבקש גודל והוקלד הערך הנכון עם מינוס. רק כשהתשובה חיובית: בשלבי המגבר האינברטי (בוס) התשובה עצמה שלילית (-20, -10).
  if (q.answer > 0 && val !== 0 && near(val, -q.answer)) return { outcome: 'incorrect', message: MAGNITUDE_MSG };
  return { outcome: 'incorrect', message: GENERIC_INCORRECT };
}

function clearCircuitDisqualifyMarks(stageEl) {
  clearBurnMarks(stageEl);
}

function triggerCircuitDisqualifyAnimation(stageEl, level, result) {
  triggerBurnAnimation(stageEl, result.disqualifyTargetId);
}

function circuitSuccessMessage(level, elapsedSeconds) {
  return `✅ מצוין! המעגל נסגר והזרם זורם בהצלחה (זמן פתרון: ${fmtTime(elapsedSeconds)}).`;
}

/** עוטף אובייקט נושא בסיסי (id/title/subtitle/color/totalLevels/generateLevel) בחוזה המלא. */
export function wrapCircuitTopic(base) {
  return {
    ...base,
    render: renderCircuit,
    evaluateAnswer: evaluateCircuitAnswer,
    clearDisqualifyMarks: clearCircuitDisqualifyMarks,
    triggerDisqualifyAnimation: triggerCircuitDisqualifyAnimation,
    successMessage: circuitSuccessMessage,
    // מספר, רווח, יחידה ("6 mA", "0.0214 A"): כך נכתבות יחידות SI, וכך מוצגות גם התשובות בפרקי ה-DC האחרים
    formatAnswer: level => `${level.question.answer} ${level.question.unit}`,
  };
}
