// ==========================================================================
// curriculum.js - מרשם נושאי הלימוד (Topics) ותוכניות הלימודים לפי שכבת גיל.
// כל נושא הוא מודול תרגול עצמאי (מנוע פיזיקלי + מחולל שלבים + רינדור +
// לוגיקת הערכה משלו - ראו את חוזה הנושא ב-js/game/gameEngine.js).
// ==========================================================================
import { generateTopicLevel, topicLevelCount } from './game/levelGenerator.js';
import { wrapCircuitTopic } from './game/circuitTopicAdapter.js';
import { generateAsteroidLevel, evaluateAsteroidAnswer, topicLevelCount as asteroidLevelCount } from './game/asteroidLevelGenerator.js';
import {
  renderAsteroid, clearAsteroidMarks, triggerAsteroidDisqualifyAnimation,
  animateAsteroidIncorrect, mountAsteroidStopwatch,
} from './game/asteroidRenderer.js';
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
import { fmtTime } from './ui.js';

export const TOPICS = {
  'charge-field': {
    id: 'charge-field',
    title: 'מטען, כוח ושדה חשמלי',
    subtitle: 'ניווט בין אסטרואידים טעונים - חוק קולון בפעולה',
    color: '#ffcc33',
    totalLevels: asteroidLevelCount(),
    generateLevel: (localId) => generateAsteroidLevel(localId),
    render: renderAsteroid,
    evaluateAnswer: evaluateAsteroidAnswer,
    clearDisqualifyMarks: clearAsteroidMarks,
    triggerDisqualifyAnimation: triggerAsteroidDisqualifyAnimation,
    animateIncorrect: animateAsteroidIncorrect,
    onLevelMount: mountAsteroidStopwatch,
    successMessage: (level, elapsedSeconds) =>
      `✅ מעולה! איזנתם את הכוח בול - הספינה חלפה על פני האסטרואיד במסלול יציב (זמן: ${fmtTime(elapsedSeconds)}).`,
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
  'י': ['charge-field', 'voltage-sources', 'electric-current', 'basic', 'advanced', 'ac', 'boss'],
};

export function allGrades() {
  return Object.keys(DEFAULT_CURRICULA);
}
