// ==========================================================================
// curriculum.js - מרשם נושאי הלימוד (Topics) ותוכניות הלימודים לפי שכבת גיל.
// כל נושא הוא מודול תרגול עצמאי (מנוע פיזיקלי + מחולל שלבים + רינדור +
// לוגיקת הערכה משלו - ראו את חוזה הנושא ב-js/game/gameEngine.js).
// ==========================================================================
import { generateTopicLevel, topicLevelCount } from './game/levelGenerator.js';
import { wrapCircuitTopic } from './game/circuitTopicAdapter.js';
import {
  generateStaticChargeLevel, evaluateStaticChargeAnswer, topicLevelCount as staticChargeLevelCount,
} from './game/staticChargeLevelGenerator.js';
import { renderStaticCharge } from './game/staticChargeRenderer.js';
import {
  generateVoltageLevel, evaluateVoltageAnswer, topicLevelCount as voltageLevelCount,
} from './game/voltageSourceLevelGenerator.js';
import {
  renderVoltageSource, clearVoltageMarks, triggerVoltageDisqualifyAnimation, animateVoltageIncorrect,
} from './game/voltageSourceRenderer.js';
import {
  generateCurrentLevel, evaluateCurrentAnswer, topicLevelCount as currentLevelCount,
} from './game/currentLevelGenerator.js';
import {
  renderCurrent, clearCurrentMarks, triggerCurrentDisqualifyAnimation, animateCurrentIncorrect,
} from './game/currentRenderer.js';
import {
  generateDigitalNumbersLevel, evaluateDigitalNumbersAnswer, topicLevelCount as digitalNumbersLevelCount,
} from './game/digitalNumbersLevelGenerator.js';
import {
  renderDigitalNumbers, clearDigitalNumbersMarks, triggerDigitalNumbersDisqualifyAnimation, animateDigitalNumbersIncorrect,
} from './game/digitalNumbersRenderer.js';
import {
  generateLogicBasicsLevel, evaluateLogicBasicsAnswer, topicLevelCount as logicBasicsLevelCount,
} from './game/logicBasicsLevelGenerator.js';
import {
  renderLogicBasics, clearLogicBasicsMarks, animateLogicBasicsIncorrect,
} from './game/logicBasicsRenderer.js';
import { fmtTime } from './ui.js';
import { STATIC_CHARGE_FORMULAS } from './game/staticChargeFormulas.js';

/** מספר להצגה: מספרים קטנים/גדולים מאוד בכתיב מדעי (4×10⁻⁴), אחרת כמו שהוא. */
const SUP_DIGITS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
function fmtNum(x) {
  const sign = x < 0 ? '−' : '';
  const a = Math.abs(x);
  if (a !== 0 && (a < 0.01 || a >= 1e5)) {
    let exp = Math.floor(Math.log10(a));
    let mant = Number((a / 10 ** exp).toPrecision(3));
    if (mant >= 10) { mant = 1; exp += 1; }
    return `${sign}${mant}×10${String(exp).split('').map(c => SUP_DIGITS[c] || c).join('')}`;
  }
  return `${sign}${a}`;
}

/** הודעת הצלחה של 'static-charge-v2': משפט אחד, נגזר מהשלב (סימן הכוח / סוג האינטראקציה).
 * הערך עטוף ב-LTR כי gameEngine מזריק את ההודעה כ-HTML בתוך טקסט RTL. */
function staticChargeSuccessMessage(level) {
  const q = level.question, w = level.world;
  const val = `<span dir="ltr">${fmtNum(q.answer)} ${q.unit.trim()}</span>`;
  switch (w.unknown) {
    case 'force':
      return `✅ מדויק! הכוח הוא ${val} - ${w.interaction === 'attract'
        ? 'מטענים מנוגדים נמשכים, ולכן הכוח שלילי (משיכה)'
        : 'מטענים באותו סימן נדחים, ולכן הכוח חיובי (דחייה)'}.`;
    case 'force_new_distance': {
      const k = Math.round(1 / w.geometry.rNearRel);
      return `✅ מדויק! המרחק קטן פי ${k}, ולכן הכוח גדל פי ${k * k} ועומד על ${val}.`;
    }
    case 'electron_count':
      return `✅ מדויק! <span dir="ltr">${fmtNum(q.answer)}</span> אלקטרונים עברו מהשיער אל הבלון, והבלון נטען שלילית.`;
    case 'field':
      return `✅ מדויק! השדה החשמלי של הבלון במקום הזרם הוא ${val}, והוא מצביע אל הבלון השלילי.`;
    case 'source_charge':
      return `✅ מדויק! גודל מטען הסרגל הוא ${val}, והסרגל השלילי מושך אליו את הנייר.`;
    case 'distance':
      return `✅ מדויק! הבלון נמצא במרחק ${val} מהקיר, והכוח ביניהם הוא כוח משיכה.`;
    case 'min_source_charge':
      return `✅ מדויק! כשגודל מטען הסרגל הוא ${val} לפחות, הכוח החשמלי מגיע למשקל הנייר, ומעבר לזה הנייר מתרומם.`;
    case 'force_over_weight':
      return `✅ מדויק! הכוח החשמלי גדול פי ${q.answer} ממשקל הטיפה, ולכן הזרם מתכופף אל הבלון.`;
    default:
      return '✅ מדויק! פתרתם את השלב.';
  }
}

export const TOPICS = {
  'static-charge-v2': {
    id: 'static-charge-v2',
    title: 'מטען, כוח ושדה חשמלי',
    subtitle: 'ניסויי חשמל סטטי פשוטים: סרגל ונייר, בלון וקיר, בלון וזרם מים',
    color: '#ffcc33',
    totalLevels: staticChargeLevelCount(),
    generateLevel: (localId) => generateStaticChargeLevel(localId),
    render: renderStaticCharge,
    evaluateAnswer: evaluateStaticChargeAnswer,
    successMessage: staticChargeSuccessMessage,
    formulas: STATIC_CHARGE_FORMULAS,
    progression: 'בלי המרות → המרת נתון אחד → המרת תשובה → המרת כמה נתונים',
    // יחידה במילה עברית (אלקטרונים / פעמים): המספר נקרא ראשון, ואחריו המילה
    formatAnswer: level => {
      const unit = level.question.unit.trim();
      const num = fmtNum(level.question.answer);
      return /[\u0590-\u05FF]/.test(unit)
        ? `<span dir="rtl"><bdi dir="ltr">${num}</bdi> ${unit}</span>`
        : `${num} ${unit}`;
    },
    // אין clearDisqualifyMarks / triggerDisqualifyAnimation / animateIncorrect /
    // onLevelMount - אין פסילה ואין שעון עוצר בנושא הזה (ראו staticChargeLevelGenerator.js);
    // תשובה שגויה = ריטוט ברירת המחדל של gameEngine.js.
  },
  'voltage-sources': {
    id: 'voltage-sources',
    title: 'מקורות מתח',
    subtitle: 'כא"מ, התנגדות פנימית והמתח האמיתי בהדקים',
    color: '#39ff8f',
    totalLevels: voltageLevelCount(),
    generateLevel: (localId) => generateVoltageLevel(localId),
    render: renderVoltageSource,
    evaluateAnswer: evaluateVoltageAnswer,
    clearDisqualifyMarks: clearVoltageMarks,
    triggerDisqualifyAnimation: triggerVoltageDisqualifyAnimation,
    animateIncorrect: animateVoltageIncorrect,
    successMessage: (level, elapsedSeconds) =>
      `✅ מדויק! המתח בהדקים אכן ${level.question.answer}V - ${level.question.answer >= level.world.vMin ? 'מספיק כדי להדליק את המכשיר בהצלחה' : 'המכשיר עדיין לא מקבל מספיק מתח כדי לפעול, למרות שחישבתם נכון'} (זמן: ${fmtTime(elapsedSeconds)}).`,
  },
  'electric-current': {
    id: 'electric-current',
    title: 'זרם חשמלי',
    subtitle: 'קצב זרימת המטען דרך חתך התיל - I = Q/t',
    color: '#ffb454',
    totalLevels: currentLevelCount(),
    generateLevel: (localId) => generateCurrentLevel(localId),
    render: renderCurrent,
    evaluateAnswer: evaluateCurrentAnswer,
    clearDisqualifyMarks: clearCurrentMarks,
    triggerDisqualifyAnimation: triggerCurrentDisqualifyAnimation,
    animateIncorrect: animateCurrentIncorrect,
    successMessage: (level, elapsedSeconds) => {
      const q = level.question;
      if (q.type === 'direction') {
        return `✅ מדויק! זרם של ${Math.abs(q.answer)}A בכיוון ${q.currentDir === 'AtoB' ? 'A → B' : 'B → A'} - קצב וכיוון הזרימה הנכונים בדיוק (זמן: ${fmtTime(elapsedSeconds)}).`;
      }
      if (q.find === 'Q') {
        return `✅ מדויק! מטען כולל של ${q.answer}C עבר דרך החתך - בדיוק לפי Q=I·t (זמן: ${fmtTime(elapsedSeconds)}).`;
      }
      if (q.find === 't') {
        return `✅ מדויק! לקח ${q.answer} שניות - בדיוק לפי t=Q/I (זמן: ${fmtTime(elapsedSeconds)}).`;
      }
      return `✅ מדויק! זרם של ${q.answer}A - קצב זרימת המטען הנכון בדיוק (זמן: ${fmtTime(elapsedSeconds)}).`;
    },
  },
  'digital-numbers': {
    id: 'digital-numbers',
    title: 'שיטות ספירה',
    subtitle: 'מעשרוני לבינארי, הקסדצימלי ו-BCD - קריאה וכתיבה על גבי רגיסטר דיגיטלי חי',
    color: '#4f6df5',
    totalLevels: digitalNumbersLevelCount(),
    generateLevel: (localId) => generateDigitalNumbersLevel(localId),
    render: renderDigitalNumbers,
    evaluateAnswer: evaluateDigitalNumbersAnswer,
    clearDisqualifyMarks: clearDigitalNumbersMarks,
    triggerDisqualifyAnimation: triggerDigitalNumbersDisqualifyAnimation,
    animateIncorrect: animateDigitalNumbersIncorrect,
    answerTools: false, // מספרים שלמים קטנים: אין צורך בכתיב מדעי/שברים
  },
  'logic-basics': {
    id: 'logic-basics',
    title: 'מושגי יסוד בלוגיקה',
    subtitle: 'פסוק, אמת ושקר, וטבלת האמת הראשונה שלכם - הכל בשפה טבעית, בלי סמלים ובלי שערים לוגיים עדיין',
    color: '#9d4edd',
    totalLevels: logicBasicsLevelCount(),
    generateLevel: (localId) => generateLogicBasicsLevel(localId),
    render: renderLogicBasics,
    evaluateAnswer: evaluateLogicBasicsAnswer,
    clearDisqualifyMarks: clearLogicBasicsMarks,
    animateIncorrect: animateLogicBasicsIncorrect,
    answerTools: false, // ספירות ומספרים שלמים קטנים: בלי סרגל כתיב מדעי
    // אין triggerDisqualifyAnimation - הטופיק הזה לא מייצר אף פעם
    // outcome:'disqualified' (ראו logicBasicsLevelGenerator.js), והשדה
    // אופציונלי לחלוטין לפי gameEngine.js.
  },
  basic: wrapCircuitTopic({
    id: 'basic',
    title: 'טירונות חשמלית',
    subtitle: 'חוק אוהם, מעגלים טוריים ומקביליים בסיסיים',
    color: '#00e5ff',
    totalLevels: topicLevelCount('basic'),
    generateLevel: (localId) => generateTopicLevel('basic', localId),
  }),
  advanced: wrapCircuitTopic({
    id: 'advanced',
    title: 'התנגדות מתקדמת',
    subtitle: 'מעגלים מעורבים, צמתים מרובים וחלוקת זרמים',
    color: '#7c4dff',
    totalLevels: topicLevelCount('advanced'),
    generateLevel: (localId) => generateTopicLevel('advanced', localId),
  }),
  ac: wrapCircuitTopic({
    id: 'ac',
    title: 'זרם חילופין',
    subtitle: 'עכבה, קבלים ומתח אפקטיבי (Veff)',
    color: '#ff4dd8',
    totalLevels: topicLevelCount('ac'),
    generateLevel: (localId) => generateTopicLevel('ac', localId),
  }),
  boss: wrapCircuitTopic({
    id: 'boss',
    title: 'שלבי בוס - רמת בגרות',
    subtitle: 'רשתות נגדים מורכבות ומגברי שרת',
    color: '#ff3d3d',
    totalLevels: topicLevelCount('boss'),
    generateLevel: (localId) => generateTopicLevel('boss', localId),
  }),
};

/** כל מזהי הנושאים במאגר, בסדר הוראה קנוני (סדר הפרקים בתוכנית הלימודים). */
export const ALL_TOPIC_IDS = Object.keys(TOPICS);

/**
 * תוכנית הלימודים *ברירת המחדל* לכל שכבת גיל - משמשת רק לזריעת נתונים
 * ראשונית (dev-mode / יצירת גיליון Grades חדש). לאחר מכן השיבוץ בפועל הוא
 * נתון עריך שנשמר לכל שכבה (topicIds) ומנוהל דרך פאנל הניהול.
 */
export const DEFAULT_CURRICULA = {
  'י': ['static-charge-v2', 'voltage-sources', 'electric-current', 'basic', 'advanced', 'ac', 'boss'],
  'יא': [], // אין עדיין אף topic בנוי לתוכן כיתה י"א (ראו syllabus.js - הכל "קר").
};

export function allGrades() {
  return Object.keys(DEFAULT_CURRICULA);
}
