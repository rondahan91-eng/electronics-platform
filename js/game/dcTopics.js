// ==========================================================================
// dcTopics.js - רישום נושאי מעגלי ה-DC החדשים (פרקים 4, 6, 8) בחוזה הנושא הכללי.
// כל נושא: מחולל שלבים (dcKit), ציור מעגל משותף, דף נוסחאות צף (dcFormulas) ומדרגת המרות יחידות.
// curriculum.js מוסיף אותם ל-TOPICS במקום הנכון לפי סדר הפרקים.
// ==========================================================================
import { makeDcTopic } from './dcKit.js';
import { generateResistanceLevel, resistanceLevelCount } from './resistanceLevelGenerator.js';
import { generateKirchhoffLevel, kirchhoffLevelCount } from './kirchhoffLevelGenerator.js';
import { generatePowerLevel, powerLevelCount } from './powerLevelGenerator.js';
import { FORMULAS_RESISTANCE, FORMULAS_KIRCHHOFF, FORMULAS_POWER } from './dcFormulas.js';

const LADDER = 'בלי המרות → המרת נתון אחד → המרת תשובה → המרת כמה נתונים';

export const DC_TOPICS = {
  resistance: makeDcTopic({
    id: 'resistance',
    title: 'התנגדות ומוליכות',
    subtitle: 'הגדרת ההתנגדות R = ⟦V⁄I⟧ והמוליכות G = ⟦1⁄R⟧',
    color: '#e05fb0',
    totalLevels: resistanceLevelCount(),
    generateLevel: generateResistanceLevel,
    formulas: FORMULAS_RESISTANCE,
    progression: LADDER,
  }),
  kirchhoff: makeDcTopic({
    id: 'kirchhoff',
    title: 'חוקי קירכהוף',
    subtitle: 'חוק הזרמים בצומת וחוק המתחים בחוג',
    color: '#3fc1c9',
    totalLevels: kirchhoffLevelCount(),
    generateLevel: generateKirchhoffLevel,
    formulas: FORMULAS_KIRCHHOFF,
    progression: LADDER,
  }),
  power: makeDcTopic({
    id: 'power',
    title: 'הספק ואנרגיה',
    subtitle: 'P = V·I, P = I²·R, P = ⟦V²⁄R⟧ ואנרגיה W = P·t',
    color: '#e8c23b',
    totalLevels: powerLevelCount(),
    generateLevel: generatePowerLevel,
    formulas: FORMULAS_POWER,
    progression: LADDER,
  }),
};
