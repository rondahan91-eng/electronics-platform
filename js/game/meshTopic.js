// ==========================================================================
// meshTopic.js - רישום נושא "שיטת זרמי החוגים" (סעיף 9.1 בתוכנית) בחוזה הנושא הכללי (gameEngine.js).
// מה שמייחד אותו: שורת בדיקה לכל זרם (question.lines + evaluateLine), רמזים על גבי המעגל (hintsOnCircuit),
// מצגת בחלון צף שקופצת בתשובה השגויה הראשונה ונפתחת שוב בשקף האחרון (theoryDeck), ודף נוסחאות הזהה למצגת.
// curriculum.js מוסיף אותו ל-TOPICS לפי סדר הפרקים.
// ==========================================================================
import { generateMeshLevel, meshLevelCount, evaluateMeshLine, formatMeshAnswer } from './meshLevelGenerator.js';
import { renderMesh } from './meshRenderer.js';
import { FORMULAS_MESH } from './meshFormulas.js';
import { fmtTime } from '../ui.js';

function meshSuccessMessage(level, elapsed) {
  const m = level.mesh;
  const notes = [];
  if (m.I1 < 0) notes.push('I₁ יצא שלילי: זרם לולאה 1 זורם בפועל נגד כיוון השעון.');
  if (m.I2 < 0) notes.push('I₂ יצא שלילי: זרם לולאה 2 זורם בפועל נגד כיוון השעון.');
  if (m.withShared) {
    const dir = m.IR2 > 0 ? 'כלפי מטה, בכיוון I₁' : 'כלפי מעלה, בכיוון I₂';
    notes.push(`זרם הענף המשותף הוא ההפרש בין זרמי הלולאה, והוא זורם ${dir}.`);
  }
  return `✅ מצוין! כל הזרמים אושרו (זמן פתרון: ${fmtTime(elapsed)}).${notes.length ? ' ' + notes.join(' ') : ''}`;
}

export const MESH_TOPIC = {
  id: 'mesh',
  title: 'שיטת זרמי החוגים',
  subtitle: 'שתי לולאות, שני זרמי עזר, ומשוואת חוק המתחים לכל לולאה',
  color: '#14b877',
  totalLevels: meshLevelCount(),
  generateLevel: generateMeshLevel,
  render: renderMesh,
  // שלב זה נבדק בשורות (evaluateLine). אם דפדפן שומר מנוע ישן (בלי שורות) לצד הקבצים החדשים, אסור שיסמן שלב פתור:
  evaluateAnswer: () => ({ outcome: 'incorrect', message: 'כדי להמשיך יש לרענן את הדף (Ctrl+F5): הדפדפן שמר גרסה ישנה של המערכת.' }),
  evaluateLine: evaluateMeshLine,
  successMessage: meshSuccessMessage,
  formatAnswer: formatMeshAnswer,
  formulas: FORMULAS_MESH,
  hintsOnCircuit: true,
  flatStage: true, // המעגל רחב: הקשת העליונה של הזירה הרגילה חותכת את פינותיו
  answerTools: false,
  theoryDeck: { src: 'assets/dc-circuits-deck.html', title: 'מצגת: עקרונות מעגלי זרם ישר' },
  progression: 'שני זרמי הלולאה → גם הזרם בענף המשותף (משלב 4) → מקורות הפוכים',
};
