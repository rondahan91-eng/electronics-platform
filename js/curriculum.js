// ==========================================================================
// curriculum.js - מרשם נושאי הלימוד (Topics) ותוכניות הלימודים לפי שכבת גיל.
// כל נושא הוא מודול תרגול עצמאי (מנוע פיזיקלי + מחולל שלבים + רינדור משלו).
// כרגע כל הנושאים משתמשים במנוע המעגלים (circuitEngine/circuitRenderer),
// אך המבנה מאפשר להוסיף בעתיד נושאים עם מנוע תרגול שונה לגמרי.
// ==========================================================================
import { generateTopicLevel, topicLevelCount } from './game/levelGenerator.js';
import { renderCircuit } from './game/circuitRenderer.js';

export const TOPICS = {
  basic: {
    id: 'basic',
    title: 'טירונות חשמלית',
    subtitle: 'חוק אוהם, מעגלים טוריים ומקביליים בסיסיים',
    color: '#00e5ff',
    totalLevels: topicLevelCount('basic'),
    generateLevel: (localId) => generateTopicLevel('basic', localId),
    renderCircuit,
  },
  advanced: {
    id: 'advanced',
    title: 'התנגדות מתקדמת',
    subtitle: 'מעגלים מעורבים, צמתים מרובים וחלוקת זרמים',
    color: '#7c4dff',
    totalLevels: topicLevelCount('advanced'),
    generateLevel: (localId) => generateTopicLevel('advanced', localId),
    renderCircuit,
  },
  ac: {
    id: 'ac',
    title: 'זרם חילופין',
    subtitle: 'עכבה, קבלים ומתח אפקטיבי (Veff)',
    color: '#ff4dd8',
    totalLevels: topicLevelCount('ac'),
    generateLevel: (localId) => generateTopicLevel('ac', localId),
    renderCircuit,
  },
  boss: {
    id: 'boss',
    title: 'שלבי בוס - רמת בגרות',
    subtitle: 'רשתות נגדים מורכבות ומגברי שרת',
    color: '#ff3d3d',
    totalLevels: topicLevelCount('boss'),
    generateLevel: (localId) => generateTopicLevel('boss', localId),
    renderCircuit,
  },
};

/** תוכנית הלימודים לכל שכבת גיל - סדר הוראה מסודר של מזהי נושאים. */
export const CURRICULA = {
  'י': ['basic', 'advanced', 'ac', 'boss'],
};

export function curriculumForGrade(grade) {
  return (CURRICULA[grade] || []).map(topicId => TOPICS[topicId]);
}

export function allGrades() {
  return Object.keys(CURRICULA);
}
