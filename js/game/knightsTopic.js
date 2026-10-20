// ==========================================================================
// knightsTopic.js - "צדיקים ונוכלים" (פסוקים לוגיים) בחוזה הנושא הכללי (gameEngine.js). 6 תרגילים לפי מסמך ההנחיות של המורה;
// בכל תרגיל איור + טבלה אינטראקטיבית בת 4 שלבים (פסוק, שיבוץ בעמודות, קביעות, עקביות), 3 רמזים לכל שלב.
// הפאנל האינטראקטיבי (knightsPanel.js) מחליף את שדה התשובה הרגיל דרך topic.mountPanel. curriculum.js מוסיף את הנושא ל-TOPICS.
// ==========================================================================
import { exerciseCount, exercise, solutionRow, columnName } from './knightsLogic.js';
import { renderKnights } from './knightsRenderer.js';
import { mountKnightsPanel } from './knightsPanel.js';
import { FORMULAS_KNIGHTS } from './knightsFormulas.js';
import { fmtTime } from '../ui.js';

const plain = s => String(s).replace(/[\u2066-\u2069]/g, '').replace(/<[^>]+>/g, '');
const cache = new Map();

function buildLevel(localId) {
  const ex = exercise(localId);
  const solution = solutionRow(ex);
  return {
    id: localId, topicId: 'knights',
    title: `${ex.n}. ${ex.title}`,
    description: ex.levelText, // התרחיש עצמו מוצג בפאנל; כאן רק רמת הקושי

    ex, solution,
    // שדות למנוע: אין שדה תשובה רגיל (הפאנל המותאם מחליף אותו), אבל הם נשארים כדי שהמבנה יהיה תקין
    question: { prompt: ex.paragraphs.join(' '), data: [], hints: [], unit: '', answer: solution.n },
  };
}
export function generateKnightsLevel(localId) {
  if (!cache.has(localId)) cache.set(localId, buildLevel(localId));
  return cache.get(localId);
}

function conclusionText(level) {
  const { ex, solution } = level;
  const people = ex.people.map(p => `${p.name} ${solution.vals[p.v] ? (p.gender === 'f' ? 'צדיקה' : 'צדיק') : (p.gender === 'f' ? 'נוכלת' : 'נוכל')}`);
  const facts = ex.facts.map(f => `${f.label} ${solution.vals[f.v] ? 'דולקת' : 'כבויה'}`);
  return [...people, ...facts].join(' · ');
}

export const KNIGHTS_TOPIC = {
  id: 'knights',
  title: 'צדיקים ונוכלים',
  subtitle: 'פסוקים לוגיים: מהמלל לפסוק, לטבלת אמת ולחוק העקביות',
  color: '#9d4edd',
  totalLevels: exerciseCount(),
  generateLevel: generateKnightsLevel,
  render: renderKnights,
  mountPanel: mountKnightsPanel,
  // התרגיל נפתר דרך הפאנל (mountPanel); אם דפדפן שומר מנוע ישן (בלי mountPanel) אסור שיסמן שלב פתור
  evaluateAnswer: () => ({ outcome: 'incorrect', message: 'כדי להמשיך יש לרענן את הדף (Ctrl+F5): הדפדפן שמר גרסה ישנה של המערכת.' }),
  successMessage: (level, elapsed) => `מצוין! פתרתם את התרגיל (זמן פתרון: ${fmtTime(elapsed)}). ${plain(level.ex.conclusion)}`,
  formatAnswer: conclusionText,
  formulas: FORMULAS_KNIGHTS,
  answerTools: false,
  flatStage: true,
  progression: 'טכנאי בודד ונורית → שני דוברים → שלושה משתנים',
};
export { columnName };
