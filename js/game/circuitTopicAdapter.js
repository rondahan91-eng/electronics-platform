// ==========================================================================
// circuitTopicAdapter.js - עוטף את מנוע המעגלים הקיים (circuitEngine /
// circuitRenderer / levelGenerator) בחוזה ה-"נושא" הכללי שגם gameEngine.js
// וגם נושאים אחרים (למשל מטען/שדה) משתמשים בו. אין כאן שום שינוי בפיזיקה
// או בהתנהגות לעומת המימוש המקורי - רק העברת מיקום הקוד לחוזה משותף.
// ==========================================================================
import { renderCircuit, triggerBurnAnimation, clearBurnMarks } from './circuitRenderer.js';
import { findNode } from './circuitEngine.js';
import { CONFIG } from '../config.js';
import { fmtTime } from '../ui.js';

function evaluateCircuitAnswer(level, val) {
  const q = level.question;
  const target = q.targetId && level.circuitKind === 'tree' ? findNode(level.root, q.targetId) : null;

  // בדיקת עומס-יתר (הספק) - רלוונטית לשאלות זרם/מתח/הספק על נגד
  if (target && target.kind === 'r' && ['current', 'voltage', 'power'].includes(q.ask)) {
    let hypPower;
    if (q.ask === 'power') hypPower = val;
    else if (q.ask === 'current') hypPower = val * val * target.value;
    else hypPower = (val * val) / target.value;
    if (hypPower > target.maxPower) {
      const pRounded = Math.round(hypPower * 100) / 100;
      return {
        outcome: 'disqualified',
        message: `🔥 <b>${target.label} נשרף!</b> התשובה שהזנתם הייתה גורמת להספק של כ-${pRounded} W על רכיב שסובל עד ${target.maxPower} W בלבד. פוסלים את הניסיון - נסו שוב.`,
        disqualifyTargetId: target.id,
      };
    }
  }

  const tolerance = Math.max(Math.abs(q.answer) * CONFIG.ANSWER_TOLERANCE_PCT, 0.005);
  const correct = Math.abs(val - q.answer) <= tolerance;
  if (correct) return { outcome: 'correct' };
  return { outcome: 'incorrect', message: '⚡ לא מדויק. בדקו שוב את הנוסחה ונסו שוב.' };
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
  };
}
