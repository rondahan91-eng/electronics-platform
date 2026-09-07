// ==========================================================================
// digitalNumbersLevelGenerator.js - "שיטות ספירה" (מערכות ספרתיות, פרק 1).
// 25 שלבים, 5 תת-נושאים רצופים (ראו syllabus.js לטווחי השלבים המדויקים):
//  - 1.1 (1-4)   הצגת מספר עשרוני: פירוק לסכום חזקות בסיס 10 - מציאת ספרה
//                במקומה, תרומתה לסכום, ושחזור מספר מביטוי מפורק. קלט מספרי
//                רגיל תמיד (אין אפסים מובילים/אותיות בתשובה).
//  - 1.2 (5-10)  בסיס בינארי (2) והקסדצימלי (16): המרות דו-כיווניות, כולל
//                המרה משולבת דרך פירוק לנבלים (4 סיביות = ספרת הקס אחת).
//  - 1.3 (11-15) הצגת מספר שלילי: משלים ל-1 ומשלים ל-2 - קידוד ופענוח,
//                כולל מקרה הקצה הקלאסי (10000000 = -128 ב-8 סיביות).
//  - 1.4 (16-21) חיבור וחיסור בינארי ברגיסטר קבוע בן 4 סיביות: חיבור פשוט,
//                חיבור עם שרשור נשא פנימי, חיבור שגולש מרוחב הרגיסטר (שלב
//                18 - הפסילה היחידה בכל הטופיק, ראו למטה), חיסור בשיטה
//                ישירה (שאילה), וחיסור דרך משלים ל-2 (גם עם נשא-להשלכה
//                תקין וגם בלעדיו).
//  - 1.5 (22-25) קוד BCD: קידוד וקידוד/פענוח לפי נבלים, כולל נבל-אפס מוביל.
//
// אינפוט: כל שלב שבו לתשובה יש אפסים מובילים משמעותיים או תווים לא-
// מספריים (A-F) משתמש ב-question.inputMode='text' (המחרוזת הגולמית,
// אחרי trim בלבד - הנרמול/ההשוואה כאן באחריותנו, ראו normalizeBits).
// שלבים שתשובתם מספר עשרוני "רגיל" (כולל שלם שלילי) נשארים 'number'
// (ברירת המחדל - הקלט הוא <input type="number">, gameEngine עושה
// parseFloat בעצמו).
//
// פסילה (outcome:'disqualified') קיימת ב*שלב יחיד בלבד* מתוך 25 - שלב 18:
// חיבור בינארי שסכומו האמיתי חורג מרוחב הרגיסטר (17 = 10001, 5 סיביות,
// ברגיסטר בן 4) - האנלוג הפיזיקלי-הנדסי המדויק ל"קצר חשמלי" בדוגמת הזרם.
// הדגל overflowDisqualify מסומן במפורש רק ב-LEVEL_DEFS_14 של שלב 18 עצמו,
// ולעולם לא נבדק גנרית לפי אורך המחרוזת בכל 1.4 - כי שלב 20 (חיסור דרך
// משלים ל-2) מייצר *כדין* סיבית-נשא עודפת שיש לזרוק (מחרוזת ביניים בת 5
// תווים, "10011"), וזו טעות "רגילה" (שכחו לקצץ) ולא פסילה: הערך האמיתי שם
// כן נכנס ל-4 סיביות, בניגוד לשלב 18 שבו הוא פיזית לא נכנס.
// ==========================================================================

// ---------------------------------------------------------------- עזרי בסיס
/** מנרמל תשובת טקסט: מסיר רווחים (גם באמצע) והופך לאותיות גדולות (עבור
 * ספרות הקס A-F) - בלי לגעת באפסים מובילים או בסדר התווים. */
function normalizeBits(raw) { return String(raw).replace(/\s+/g, '').toUpperCase(); }

const mod16 = n => ((n % 16) + 16) % 16;

/** חיבור בינארי מלא (bit-adder) של שתי מחרוזות בינאריות (לא בהכרח באותו
 * אורך - הקצרה מושלמת באפסים מובילים). התוצאה *לא* מקוצרת - אם יש נשא
 * חורג היא ארוכה ב-1 תו מהאורך המקסימלי בין הקלטים (זה בדיוק מה שמאפשר
 * לזהות גלישת רגיסטר/נשא-להשלכה בהמשך). */
function binAdd(aBits, bBits) {
  const len = Math.max(aBits.length, bBits.length);
  const a = aBits.padStart(len, '0').split('').map(Number);
  const b = bBits.padStart(len, '0').split('').map(Number);
  let carry = 0;
  const result = [];
  for (let i = len - 1; i >= 0; i--) {
    const sum = a[i] + b[i] + carry;
    result.unshift(sum % 2);
    carry = Math.floor(sum / 2);
  }
  if (carry) result.unshift(carry);
  return result.join('');
}

function xorBits(a, b) { return a.split('').map((c, i) => (c === b[i] ? '0' : '1')).join(''); }

function onesComplementOf(n, width) {
  const positiveBin = Math.abs(n).toString(2).padStart(width, '0');
  return positiveBin.split('').map(bit => (bit === '0' ? '1' : '0')).join('');
}

function twosComplementOf(n, width) {
  const ones = onesComplementOf(n, width);
  return binAdd(ones, '1'.padStart(width, '0')).slice(-width);
}

function decodeTwosComplement(bits) {
  const unsigned = parseInt(bits, 2);
  return bits[0] === '1' ? unsigned - 2 ** bits.length : unsigned;
}

function decimalToBCD(number, width) {
  const digitCount = width / 4;
  const digits = String(number).padStart(digitCount, '0').split('').map(Number);
  return digits.map(d => d.toString(2).padStart(4, '0')).join('');
}

function bcdDigits(bits) { return (bits.match(/.{4}/g) || []).map(nb => parseInt(nb, 2)); }

const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const supPow = p => String(p).split('').map(d => SUP[+d]).join('');

/** בדיקה גנרית משותפת לכל שלב-טקסט (אחרי כל הבדיקות הספציפיות של הקבוצה,
 * לפני נפילה להודעת "לא מדויק" כללית): הערך המספרי כבר נכון, רק האורך
 * (אפסים מובילים) לא תואם את רוחב הרגיסטר המלא. */
function lengthMismatchMessage(norm, canonical, base, unitWord) {
  if (norm.length === canonical.length) return null;
  const normVal = parseInt(norm, base);
  const canVal = parseInt(canonical, base);
  if (!Number.isNaN(normVal) && normVal === canVal) {
    const advice = norm.length < canonical.length
      ? 'השלימו אפסים מובילים.'
      : 'הסירו את התו/הספרה המיותרים בהתחלה.';
    return {
      outcome: 'incorrect', value: norm,
      message: `הערך המספרי נכון, אבל לא ברוחב הרגיסטר המלא (${canonical.length} ${unitWord}) - ${advice}`,
    };
  }
  return null;
}

// ============================================================== 1.1 (1-4)
const PLACE_NAMES = { 0: 'יחידות', 1: 'עשרות', 2: 'מאות', 3: 'אלפים', 4: 'עשרות-אלפים' };
const digitAt = (number, power) => Math.floor(number / 10 ** power) % 10;

const LEVEL_DEFS_11 = [
  { kind: 'find-digit', number: 3754, power: 2 },
  { kind: 'find-contribution', number: 4286, power: 1 },
  { kind: 'reconstruct', terms: [[6, 3], [0, 2], [4, 1], [9, 0]] },
  { kind: 'find-contribution', number: 8206, power: 1 },
];

function generate11(localId, def) {
  if (def.kind === 'reconstruct') {
    const answer = def.terms.reduce((s, [c, p]) => s + c * 10 ** p, 0);
    const expr = def.terms.map(([c, p]) => `${c}×10${supPow(p)}`).join(' + ');
    return {
      kind: 'reconstruct', terms: def.terms, answer,
      title: `פירוק לסכום חזקות #${localId}`,
      desc: 'כל מספר עשרוני ניתן לתיאור כסכום של מקדמים (ספרות) כפול חזקות של 10, לפי מקומה של כל ספרה.',
      prompt: `איזה מספר שלם מתקבל מהסכום הבא? ${expr}`,
    };
  }
  const { number, power } = def;
  const digit = digitAt(number, power);
  if (def.kind === 'find-digit') {
    return {
      kind: 'find-digit', number, power, digit, answer: digit,
      title: `זיהוי ספרה במקומה #${localId}`,
      desc: 'כל ספרה במספר עשרוני יושבת במקום (חזקת 10) מסוים - יחידות, עשרות, מאות וכן הלאה, נספר תמיד מהימין.',
      prompt: `במספר ${number}, מהי הספרה (המקדם) שנמצאת במקום ה${PLACE_NAMES[power]}?`,
    };
  }
  return {
    kind: 'find-contribution', number, power, digit, answer: digit * 10 ** power,
    title: `תרומת ספרה לסכום #${localId}`,
    desc: 'הערך שתורמת ספרה לסכום הכולל של המספר הוא הספרה עצמה, כפול חזקת 10 המתאימה למקומה.',
    prompt: `במספר ${number}, מהו הערך שתורמת הספרה שבמקום ה${PLACE_NAMES[power]} לסכום הכולל?`,
  };
}

function evaluate11(level, val) {
  const q = level.question;
  if (val === q.answer) return { outcome: 'correct', value: val };

  if (q.kind === 'reconstruct') {
    const sumCoef = q.terms.reduce((s, [c]) => s + c, 0);
    if (val === sumCoef) {
      return { outcome: 'incorrect', value: val, message: 'סכמתם רק את המקדמים - הפעילו גם את החזקות של 10 שמכפילות כל אחד.' };
    }
    for (const [c, p] of q.terms) {
      const base = c * 10 ** p;
      if (p < 4 && val === q.answer - base + c * 10 ** (p + 1)) {
        return { outcome: 'incorrect', value: val, message: 'נראה שאחד המקדמים הוצב בחזקה לא נכונה - התאימו כל מקדם למקום (לחזקה) שהוא אמור להיות בו.' };
      }
      if (p > 0 && val === q.answer - base + c * 10 ** (p - 1)) {
        return { outcome: 'incorrect', value: val, message: 'נראה שאחד המקדמים הוצב בחזקה לא נכונה - התאימו כל מקדם למקום (לחזקה) שהוא אמור להיות בו.' };
      }
    }
    return { outcome: 'incorrect', value: val, message: 'לא מדויק - הכפילו כל מקדם בחזקת 10 המתאימה למקומו (הימני ביותר הוא 10⁰), וסכמו את כל התוצאות.' };
  }

  const { number, power, digit } = q;
  if (q.kind === 'find-digit') {
    const neighborUp = digitAt(number, power + 1);
    const neighborDown = power > 0 ? digitAt(number, power - 1) : null;
    if (val === neighborUp || (neighborDown !== null && val === neighborDown)) {
      return { outcome: 'incorrect', value: val, message: 'בדקו שוב איזה מקום זה - ספרו מהימין: יחידות, עשרות, מאות...' };
    }
    if (val === digit * 10 ** power) {
      return { outcome: 'incorrect', value: val, message: 'זו התרומה של הספרה - כאן מבקשים את הספרה עצמה בלבד.' };
    }
    return { outcome: 'incorrect', value: val, message: 'לא מדויק - ספרו מקומות מהימין (יחידות, עשרות, מאות...) עד למקום המבוקש.' };
  }

  // find-contribution
  if (val === digit) {
    return { outcome: 'incorrect', value: val, message: 'הכפילו את הספרה בחזקת 10 המתאימה למקומה - לא רק הספרה עצמה.' };
  }
  if (digit === 0) {
    const numDigits = String(number).length;
    for (let p = 0; p < numDigits; p++) {
      if (p === power) continue;
      const contrib = digitAt(number, p) * 10 ** p;
      if (contrib !== 0 && val === contrib) {
        return { outcome: 'incorrect', value: val, message: 'בדקו שוב איזה מקום נשאל - שם הספרה היא 0, ולכן התרומה היא 0.' };
      }
    }
  } else {
    const upContribution = digitAt(number, power + 1) * 10 ** (power + 1);
    const downContribution = power > 0 ? digitAt(number, power - 1) * 10 ** (power - 1) : null;
    if (val === upContribution || (downContribution !== null && val === downContribution)) {
      return { outcome: 'incorrect', value: val, message: 'בדקו שוב את החזקה - נספרת מהימין, החל מ-10⁰.' };
    }
  }
  return { outcome: 'incorrect', value: val, message: 'לא מדויק - הכפילו את הספרה שבמקום המבוקש בחזקת 10 המתאימה לאותו מקום.' };
}

// ============================================================= 1.2 (5-10)
const LEVEL_DEFS_12 = [
  { kind: 'decToBin', number: 5, width: 4 },
  { kind: 'binToDec', bits: '1011' },
  { kind: 'decToHex1', number: 13 },
  { kind: 'hexToDec1', hexChar: 'A' },
  { kind: 'decToBin', number: 182, width: 8 },
  { kind: 'binToHexNibble', bits: '10110110' },
];

function generate12(localId, def) {
  if (def.kind === 'decToBin') {
    const canonical = def.number.toString(2).padStart(def.width, '0');
    return {
      kind: 'decToBin', number: def.number, width: def.width, canonical, answer: canonical, inputMode: 'text',
      title: `המרה לבינארי #${localId}`,
      desc: `כל מספר עשרוני ניתן להצגה בבסיס 2 (בינארי) - רצף סיביות (0/1), כל אחת מייצגת חזקת 2. הרגיסטר כאן רחב ${def.width} סיביות בדיוק - יש להשלים אפסים מובילים אם צריך.`,
      prompt: `הציגו את המספר העשרוני ${def.number} בבינארי, ברוחב רגיסטר של ${def.width} סיביות בדיוק.`,
    };
  }
  if (def.kind === 'binToDec') {
    return {
      kind: 'binToDec', bits: def.bits, answer: parseInt(def.bits, 2),
      title: `המרה לעשרוני #${localId}`,
      desc: 'כדי להמיר בינארי לעשרוני, מכפילים כל סיבית במשקלה (1,2,4,8,...) וסוכמים את המשקלים שבהם הסיבית דולקת (1).',
      prompt: `הרגיסטר הבינארי הבא מכיל את הדפוס ${def.bits}. מהו הערך העשרוני השקול?`,
    };
  }
  if (def.kind === 'decToHex1') {
    const canonical = def.number.toString(16).toUpperCase();
    return {
      kind: 'decToHex1', number: def.number, canonical, answer: canonical, inputMode: 'text',
      title: `המרה להקסדצימלי #${localId}`,
      desc: 'בבסיס הקסדצימלי (16) יש 16 ספרות: 0-9, ואז האותיות A-F עבור הערכים 10-15.',
      prompt: `הציגו את המספר העשרוני ${def.number} כספרה הקסדצימלית (16) בודדת אחת.`,
    };
  }
  if (def.kind === 'hexToDec1') {
    return {
      kind: 'hexToDec1', hexChar: def.hexChar, answer: parseInt(def.hexChar, 16),
      title: `פענוח ספרת הקס #${localId}`,
      desc: 'בהקסדצימלי, האותיות A-F מייצגות את הערכים העשרוניים 10-15 (A=10, B=11, ... F=15).',
      prompt: `הספרה ההקסדצימלית '${def.hexChar}' - מהו הערך העשרוני שלה?`,
    };
  }
  // binToHexNibble
  const nibbles = def.bits.match(/.{4}/g);
  const canonical = nibbles.map(nb => parseInt(nb, 2).toString(16).toUpperCase()).join('');
  return {
    kind: 'binToHexNibble', bits: def.bits, canonical, answer: canonical, inputMode: 'text',
    title: `מבינארי להקס דרך נבלים #${localId}`,
    desc: 'כל ספרה הקסדצימלית שקולה בדיוק לקבוצה של 4 סיביות (נבל, nibble). מחלקים את הרגיסטר לקבוצות של 4 מימין לשמאל, וממירים כל קבוצה בנפרד.',
    prompt: `הרגיסטר הבינארי ${def.bits} (8 סיביות) - הציגו אותו כשתי ספרות הקסדצימליות (המרה דרך נבלים).`,
  };
}

function evaluate12(level, val) {
  const q = level.question;
  if (q.kind === 'decToBin') {
    const norm = normalizeBits(val);
    if (norm === q.canonical) return { outcome: 'correct', value: norm };
    const reversed = q.canonical.split('').reverse().join('');
    if (norm === reversed) {
      return { outcome: 'incorrect', value: norm, message: 'סדר הסיביות הפוך - הסיבית הימנית ביותר (LSB) היא הפחות-משמעותית, לא השמאלית.' };
    }
    return lengthMismatchMessage(norm, q.canonical, 2, 'סיביות')
      || { outcome: 'incorrect', value: norm, message: 'לא מדויק - חלקו שוב ושוב ב-2 ורשמו את השאריות מלמטה למעלה, או פרקו לסכום חזקות של 2.' };
  }
  if (q.kind === 'binToDec') {
    if (val === q.answer) return { outcome: 'correct', value: val };
    const { bits } = q;
    if (val === parseInt(bits.split('').reverse().join(''), 2)) {
      return { outcome: 'incorrect', value: val, message: 'המשקלים הפוכים - הסיבית הימנית ביותר שווה 2⁰=1, לא השמאלית. בדקו שוב את סדר המשקלים.' };
    }
    const popcount = bits.split('').filter(c => c === '1').length;
    if (val === popcount) {
      return { outcome: 'incorrect', value: val, message: 'ספרתם כמה פעמים מופיעה הספרה 1 - יש להכפיל כל סיבית במשקל שלה (1,2,4,8...) ולחבר, לא רק לספור אותן.' };
    }
    return { outcome: 'incorrect', value: val, message: 'לא מדויק - הכפילו כל סיבית דולקת (1) במשקל שלה (1,2,4,8,16,...) וסכמו.' };
  }
  if (q.kind === 'decToHex1') {
    const norm = normalizeBits(val);
    if (norm === q.canonical) return { outcome: 'correct', value: norm };
    if (norm === String(q.number)) {
      return { outcome: 'incorrect', value: norm, message: 'ספרות 10 ומעלה נכתבות כאות: A=10, B=11, C=12, D=13, E=14, F=15.' };
    }
    return lengthMismatchMessage(norm, q.canonical, 16, 'ספרות הקס')
      || { outcome: 'incorrect', value: norm, message: 'לא מדויק - זכרו שהערכים 10-15 נכתבים כאות בודדת (A-F).' };
  }
  if (q.kind === 'hexToDec1') {
    if (val === q.answer) return { outcome: 'correct', value: val };
    const posInAlphabet = q.hexChar.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
    if (val === posInAlphabet) {
      return { outcome: 'incorrect', value: val, message: `${q.hexChar} שווה ${q.answer} בהקסדצימלי (לא ${posInAlphabet} - זו לא ספירת מיקום באלף-בית).` };
    }
    return { outcome: 'incorrect', value: val, message: 'לא מדויק - זכרו: A=10, B=11, C=12, D=13, E=14, F=15.' };
  }
  // binToHexNibble
  const norm = normalizeBits(val);
  if (norm === q.canonical) return { outcome: 'correct', value: norm };
  const octalStyle = parseInt(q.bits, 2).toString(8).toUpperCase();
  if (norm === octalStyle && octalStyle !== q.canonical) {
    return { outcome: 'incorrect', value: norm, message: 'כל ספרה הקסדצימלית שווה בדיוק ל-4 סיביות (נבל), לא 3 - חלקו שוב לקבוצות של 4 מימין לשמאל.' };
  }
  const nibbles = q.bits.match(/.{4}/g);
  const swappedNibbles = nibbles.slice().reverse().map(nb => parseInt(nb, 2).toString(16).toUpperCase()).join('');
  if (norm === swappedNibbles && swappedNibbles !== q.canonical) {
    return { outcome: 'incorrect', value: norm, message: 'קיבצתם מהצד הלא נכון - הנבל השמאלי (המשמעותי) הופך לספרה השמאלית בהקס.' };
  }
  const decimalConcat = nibbles.map(nb => String(parseInt(nb, 2))).join('');
  if (norm === decimalConcat && decimalConcat !== q.canonical) {
    return { outcome: 'incorrect', value: norm, message: 'המירו כל נבל לספרת ההקס שלו (0-9/A-F), לא לערכו העשרוני.' };
  }
  return lengthMismatchMessage(norm, q.canonical, 16, 'ספרות הקס')
    || { outcome: 'incorrect', value: norm, message: 'לא מדויק - חלקו את הרגיסטר לקבוצות של 4 סיביות (נבלים) מימין לשמאל, והמירו כל קבוצה לספרת הקס שלה.' };
}

// ============================================================ 1.3 (11-15)
const LEVEL_DEFS_13 = [
  { kind: 'encode1s', n: -5, width: 4 },
  { kind: 'encode2s', n: -5, width: 4 },
  { kind: 'encode2s', n: -20, width: 8 },
  { kind: 'decode2s', bits: '11110110' },
  { kind: 'decode2s', bits: '10000000' },
];

function generate13(localId, def) {
  if (def.kind === 'encode1s') {
    const canonical = onesComplementOf(def.n, def.width);
    return {
      kind: 'encode1s', n: def.n, width: def.width, canonical, answer: canonical, inputMode: 'text',
      title: `קידוד במשלים ל-1 #${localId}`,
      desc: 'בשיטת המשלים ל-1, מספר שלילי מיוצג על-ידי הפיכת (השלמת) כל הסיביות בייצוג הבינארי החיובי שלו.',
      prompt: `הציגו את המספר ${def.n} בשיטת המשלים ל-1, ברוחב רגיסטר של ${def.width} סיביות.`,
    };
  }
  if (def.kind === 'encode2s') {
    const canonical = twosComplementOf(def.n, def.width);
    return {
      kind: 'encode2s', n: def.n, width: def.width, canonical, answer: canonical, inputMode: 'text',
      title: `קידוד במשלים ל-2 #${localId}`,
      desc: 'בשיטת המשלים ל-2, מספר שלילי מיוצג על-ידי הפיכת כל הסיביות (משלים ל-1) ולאחר מכן הוספת 1.',
      prompt: `הציגו את המספר ${def.n} בשיטת המשלים ל-2, ברוחב רגיסטר של ${def.width} סיביות.`,
    };
  }
  // decode2s
  return {
    kind: 'decode2s', bits: def.bits, width: def.bits.length, answer: decodeTwosComplement(def.bits),
    title: `פענוח משלים ל-2 #${localId}`,
    desc: 'ברגיסטר בשיטת המשלים ל-2, סיבית ה-MSB (השמאלית ביותר) היא סיבית הסימן: 0=חיובי, 1=שלילי.',
    prompt: `הרגיסטר ${def.bits} (${def.bits.length} סיביות) מיוצג בשיטת המשלים ל-2. מהו הערך העשרוני שהוא מייצג (כולל סימן)?`,
  };
}

function evaluate13(level, val) {
  const q = level.question;
  if (q.kind === 'encode1s' || q.kind === 'encode2s') {
    const norm = normalizeBits(val);
    if (norm === q.canonical) return { outcome: 'correct', value: norm };
    const positiveBin = Math.abs(q.n).toString(2).padStart(q.width, '0');
    if (norm === positiveBin) {
      return { outcome: 'incorrect', value: norm, message: `שכחתם להפוך (להשלים) את כל הסיביות - זו ההצגה של +${Math.abs(q.n)}, לא ${q.n}.` };
    }
    if (q.kind === 'encode1s') {
      if (norm === twosComplementOf(q.n, q.width)) {
        return { outcome: 'incorrect', value: norm, message: 'זה משלים ל-2 - כאן מבקשים משלים ל-1 בלבד (רק היפוך, בלי +1).' };
      }
    } else if (norm === onesComplementOf(q.n, q.width)) {
      return { outcome: 'incorrect', value: norm, message: 'זה משלים ל-1 - חסר עוד +1 בסוף.' };
    }
    return lengthMismatchMessage(norm, q.canonical, 2, 'סיביות')
      || { outcome: 'incorrect', value: norm, message: 'לא מדויק - בדקו שוב את שלבי הקידוד (היפוך הסיביות, ובמשלים ל-2 גם +1).' };
  }
  // decode2s
  if (val === q.answer) return { outcome: 'correct', value: val };
  const unsignedVal = parseInt(q.bits, 2);
  if (val === unsignedVal && q.bits[0] === '1') {
    return { outcome: 'incorrect', value: val, message: 'סיבית ה-MSB דולקת (1) - זהו סימן שלילי, לא חלק מהגודל הרגיל.' };
  }
  if (q.bits === '10000000') {
    if (val === 0) return { outcome: 'incorrect', value: val, message: 'במשלים ל-2 יש רק ייצוג אחד לאפס (00000000) - זה דפוס שונה.' };
    if (val === 128) return { outcome: 'incorrect', value: val, message: 'הגודל נכון (128), אבל שכחתם שסיבית ה-MSB דולקת = ערך שלילי: -128, לא +128.' };
  }
  return { outcome: 'incorrect', value: val, message: 'לא מדויק - בדקו את סיבית הסימן (MSB), ובמשלים ל-2 את גודל הערך שמיוצג.' };
}

// ============================================================ 1.4 (16-21)
// רוחב רגיסטר קבוע בן 4 סיביות לכל שלבי הקבוצה (גם לחיבור וגם לחיסור).
const REG_WIDTH_14 = 4;
const LEVEL_DEFS_14 = [
  { a: '0010', b: '0101', op: 'add' },
  { a: '0110', b: '0011', op: 'add' },
  { a: '1010', b: '0111', op: 'add', overflowDisqualify: true },
  { a: '0101', b: '0011', op: 'sub', method: 'direct' },
  { a: '0110', b: '0011', op: 'sub', method: 'complement' },
  { a: '0011', b: '0101', op: 'sub', method: 'complement' },
];

function generate14(localId, def) {
  const { a, b, op } = def;
  const width = REG_WIDTH_14;
  const aDec = parseInt(a, 2), bDec = parseInt(b, 2);
  const canonicalDec = op === 'add' ? mod16(aDec + bDec) : mod16(aDec - bDec);
  const canonical = canonicalDec.toString(2).padStart(width, '0');
  const forAddSub = { a, b, op, width, canonical, overflowDisqualify: !!def.overflowDisqualify, method: def.method || null };
  if (op === 'add') {
    return {
      kind: 'addsub', forAddSub, answer: canonical, inputMode: 'text',
      title: `חיבור בינארי #${localId}`,
      desc: `שני אוגרים בני ${width} סיביות (A ו-B) מוזנים לפעולת חיבור. חברו ביט-אחר-ביט מימין לשמאל, והעבירו נשא (carry) לעמודה הבאה כשמתקבל 1+1.`,
      prompt: `חשבו A+B ברגיסטר בן ${width} סיביות: A=${a}, B=${b}. מהי תוצאת החיבור (${width} סיביות)?`,
    };
  }
  return {
    kind: 'addsub', forAddSub, answer: canonical, inputMode: 'text',
    title: `חיסור בינארי #${localId}`,
    desc: def.method === 'direct'
      ? `שני אוגרים בני ${width} סיביות (A ו-B) מוזנים לפעולת חיסור A-B. חסרו ביט-אחר-ביט מימין לשמאל, ושאלו (borrow) מהעמודה הבאה כשצריך.`
      : `שני אוגרים בני ${width} סיביות (A ו-B) מוזנים לפעולת חיסור A-B, בשיטת המשלים ל-2: חשבו A + (משלים-ל-2 של B), והשליכו סיבית נשא עודפת אם נוצרה.`,
    prompt: `חשבו A-B ברגיסטר בן ${width} סיביות: A=${a}, B=${b}. מהי תוצאת החיסור (${width} סיביות${def.method === 'complement' ? ', בייצוג משלים ל-2' : ''})?`,
  };
}

function evaluate14(level, val) {
  const w = level.question.forAddSub;
  const { a, b, op, width, canonical, overflowDisqualify, method } = w;
  const norm = normalizeBits(val);

  // הדגל הזה מסומן *אך ורק* ב-LEVEL_DEFS_14 של שלב 18 - לעולם לא זיהוי גנרי
  // לפי אורך המחרוזת (ראו שלב 20: מחרוזת ביניים בת 5 תווים היא שם תקינה
  // בדרך, לא פסילה).
  if (overflowDisqualify && norm.length > width) {
    const trueSum = parseInt(a, 2) + parseInt(b, 2);
    return {
      outcome: 'disqualified', value: norm,
      message: `⚡ גלישת רגיסטר! הסכום האמיתי (${trueSum}) דורש ${norm.length} סיביות - רגיסטר בן ${width} סיביות לא יכול להכיל זאת. הביט העודף אובד פיזית.`,
    };
  }
  if (norm === canonical) return { outcome: 'correct', value: norm };

  const xorTrap = xorBits(a, b);
  if (norm === xorTrap && xorTrap !== canonical) {
    return { outcome: 'incorrect', value: norm, message: 'שכחתם להעביר את הנשא (carry) לעמודה הבאה - חברו ביט-אחר-ביט מימין לשמאל, ומעבירים נשא כשמתקבל 1+1.' };
  }

  if (op === 'sub') {
    const aDec = parseInt(a, 2), bDec = parseInt(b, 2);
    if (aDec < bDec) {
      const magnitude = (bDec - aDec).toString(2).padStart(width, '0');
      if (norm === magnitude && magnitude !== canonical) {
        return { outcome: 'incorrect', value: norm, message: `התוצאה שלילית - הציגו אותה כדפוס משלים ל-2 (${canonical}), לא כגודל מוחלט.` };
      }
    }
    const revCanonical = mod16(bDec - aDec).toString(2).padStart(width, '0');
    if (norm === revCanonical && revCanonical !== canonical) {
      return { outcome: 'incorrect', value: norm, message: 'נראה שהחיסור בוצע בסדר הפוך - בדקו איזה איבר הוא המחוסר ואיזה המוחסר.' };
    }
    if (method === 'complement') {
      const onesAlt = binAdd(a, onesComplementOf(bDec, width)).slice(-width);
      if (norm === onesAlt && onesAlt !== canonical) {
        return { outcome: 'incorrect', value: norm, message: 'השתמשתם במשלים ל-1 - לשיטת החיסור צריך משלים ל-2 (עם ה-+1).' };
      }
      const fullComplementSum = binAdd(a, twosComplementOf(bDec, width));
      if (fullComplementSum.length > width && norm === fullComplementSum) {
        return {
          outcome: 'incorrect', value: norm,
          message: `הביטים התחתונים נכונים, אבל נשארה סיבית הנשא העודפת (ה-"1" המוביל) שבשיטת המשלים תמיד זורקים - השאירו רק את ${width} הסיביות התחתונות: ${canonical}.`,
        };
      }
    }
  }

  return lengthMismatchMessage(norm, canonical, 2, 'סיביות') || {
    outcome: 'incorrect', value: norm,
    message: op === 'add'
      ? 'לא מדויק - חברו ביט אחר ביט מימין לשמאל והעבירו נשא כשצריך, ונסו שוב.'
      : 'לא מדויק - בדקו שוב את שיטת החיסור (שאילה ישירה או חיבור המשלים ל-2) ונסו שוב.',
  };
}

// ============================================================ 1.5 (22-25)
const LEVEL_DEFS_15 = [
  { kind: 'encodeBcd', number: 8, width: 4 },
  { kind: 'encodeBcd', number: 47, width: 8 },
  { kind: 'decodeBcd', bits: '01011001' },
  { kind: 'decodeBcd', bits: '000010010011' },
];

function generate15(localId, def) {
  if (def.kind === 'encodeBcd') {
    const canonical = decimalToBCD(def.number, def.width);
    return {
      kind: 'encodeBcd', number: def.number, width: def.width, canonical, answer: canonical, inputMode: 'text',
      title: `קידוד BCD #${localId}`,
      desc: 'בקוד BCD (Binary-Coded Decimal) כל ספרה עשרונית (0-9) מקודדת בנפרד, בנבל (4 סיביות) בינארי משלה - לא ממירים את המספר השלם לבינארי הרגיל.',
      prompt: `הציגו את המספר העשרוני ${def.number} בקוד BCD (נבל נפרד לכל ספרה).`,
    };
  }
  // decodeBcd
  const digits = bcdDigits(def.bits);
  return {
    kind: 'decodeBcd', bits: def.bits, width: def.bits.length, answer: parseInt(digits.join(''), 10),
    title: `פענוח BCD #${localId}`,
    desc: 'לפענוח BCD מחלקים את הרגיסטר לקבוצות של 4 סיביות (נבלים) מימין לשמאל, וממירים כל נבל בנפרד לספרה העשרונית שלו (0-9).',
    prompt: `הרגיסטר ${def.bits} (${def.bits.length} סיביות) מקודד בשיטת BCD. מהו המספר העשרוני שהוא מייצג?`,
  };
}

function evaluate15(level, val) {
  const q = level.question;
  if (q.kind === 'encodeBcd') {
    const norm = normalizeBits(val);
    if (norm === q.canonical) return { outcome: 'correct', value: norm };
    const plainBinaryTrap = q.number.toString(2).padStart(q.width, '0');
    if (norm === plainBinaryTrap && plainBinaryTrap !== q.canonical) {
      return { outcome: 'incorrect', value: norm, message: 'זהו הבינארי הרגיל של המספר השלם - ב-BCD כל ספרה עשרונית מקודדת בנפרד, כל אחת בנבל (4 סיביות) משלה.' };
    }
    if (q.width === 8) {
      const nibbles = q.canonical.match(/.{4}/g);
      const swapped = nibbles.slice().reverse().join('');
      if (norm === swapped && swapped !== q.canonical) {
        return { outcome: 'incorrect', value: norm, message: 'סדר הספרות הפוך - הנבל השמאלי הוא הספרה המשמעותית ביותר (העשרות).' };
      }
    }
    return lengthMismatchMessage(norm, q.canonical, 2, 'סיביות')
      || { outcome: 'incorrect', value: norm, message: 'לא מדויק - קדדו כל ספרה עשרונית בנפרד לנבל (4 סיביות) בינארי משלה.' };
  }
  // decodeBcd
  if (val === q.answer) return { outcome: 'correct', value: val };
  const wholeBinaryTrap = parseInt(q.bits, 2);
  if (val === wholeBinaryTrap && wholeBinaryTrap !== q.answer) {
    return { outcome: 'incorrect', value: val, message: 'קראתם את כל המחרוזת כמספר בינארי אחד רציף - יש לפרק לקבוצות של 4 סיביות (נבלים) ולהמיר כל קבוצה בנפרד לספרה שלה.' };
  }
  const swapTrap = parseInt(String(q.answer).split('').reverse().join(''), 10);
  if (val === swapTrap && swapTrap !== q.answer) {
    return { outcome: 'incorrect', value: val, message: 'סדר הספרות הפוך/מוחלף - הנבל השמאלי ביותר הוא הספרה המשמעותית ביותר.' };
  }
  return { outcome: 'incorrect', value: val, message: 'לא מדויק - פרקו לקבוצות של 4 סיביות (נבלים) מימין לשמאל, והמירו כל קבוצה לספרה העשרונית שלה (0-9).' };
}

// --------------------------------------------------------------- רמזים
function buildHints(group, g) {
  if (group === '1.1') {
    if (g.kind === 'reconstruct') {
      return [
        'כל איבר בביטוי הוא מקדם (ספרה) כפול 10 בחזקת המקום שלו.',
        'חשבו כל מכפלה בנפרד (מקדם × 10^חזקה), ורק אז סכמו את כל התוצאות יחד.',
        `לדוגמה, האיבר הראשון: ${g.terms[0][0]}×10${supPow(g.terms[0][1])} = ${g.terms[0][0] * 10 ** g.terms[0][1]}.`,
      ];
    }
    if (g.kind === 'find-digit') {
      return [
        'מקומות במספר עשרוני נספרים תמיד מהימין: יחידות (10⁰), עשרות (10¹), מאות (10²) וכן הלאה.',
        `המקום שנשאל כאן הוא "${PLACE_NAMES[g.power]}" - חזקה 10${supPow(g.power)}.`,
        'שאלה זו מבקשת את הספרה עצמה בלבד - לא את התרומה שלה לסכום.',
      ];
    }
    return [
      'תרומת ספרה לסכום = הספרה עצמה, כפול 10 בחזקת מקומה.',
      `המקום שנשאל כאן הוא "${PLACE_NAMES[g.power]}", כלומר חזקה 10${supPow(g.power)}.`,
      g.digit === 0 ? 'שימו לב: אם הספרה במקום הזה היא 0, גם התרומה שלה היא 0.' : 'הציבו: ספרה × 10^חזקת המקום.',
    ];
  }
  if (group === '1.2') {
    if (g.kind === 'decToBin') {
      return [
        'חלקו את המספר שוב ושוב ב-2, ורשמו את השאריות (0 או 1) - מלמטה למעלה, מה-LSB ל-MSB.',
        `רוחב הרגיסטר כאן הוא ${g.width} סיביות בדיוק - השלימו אפסים מובילים אם צריך.`,
        'הסיבית השמאלית ביותר היא המשמעותית ביותר (MSB), הימנית ביותר היא הפחות משמעותית (LSB).',
      ];
    }
    if (g.kind === 'binToDec') {
      return [
        'לכל סיבית יש משקל: הימנית ביותר=1 (2⁰), הבאה=2 (2¹), הבאה=4 (2²), וכן הלאה.',
        'סכמו רק את המשקלים של הסיביות שדולקות (=1).',
        `הרגיסטר: ${g.bits}.`,
      ];
    }
    if (g.kind === 'decToHex1') {
      return [
        'בהקסדצימלי (בסיס 16) יש 16 ספרות: 0-9, ואז A-F לערכים 10-15.',
        'אם הערך העשרוני גדול או שווה ל-10, יש לכתוב אות (A-F) ולא ספרה עשרונית.',
        `בדקו היכן ${g.number} נופל בטווח 10-15.`,
      ];
    }
    if (g.kind === 'hexToDec1') {
      return [
        'A=10, B=11, C=12, D=13, E=14, F=15.',
        `הספרה '${g.hexChar}' היא אחת מהאותיות האלה.`,
        'זה לא מיקום באלף-בית - אלו ערכים עשרוניים קבועים שיש לזכור.',
      ];
    }
    return [
      'חלקו את הרגיסטר לקבוצות של 4 סיביות (נבלים) מימין לשמאל.',
      'המירו כל נבל בנפרד לספרת הקס שלו (0-9 או A-F) - לא לערכו העשרוני.',
      `הרגיסטר: ${g.bits} → שתי קבוצות של 4 סיביות.`,
    ];
  }
  if (group === '1.3') {
    if (g.kind === 'encode1s') {
      return [
        `הציגו קודם את הגודל החיובי ${Math.abs(g.n)} בבינארי, ברוחב ${g.width} סיביות.`,
        'משלים ל-1 = היפוך (השלמה) של כל סיבית וסיבית - 0 הופך ל-1 ולהפך.',
        'אין כאן שום +1 - זה ההבדל מול משלים ל-2.',
      ];
    }
    if (g.kind === 'encode2s') {
      return [
        `הציגו קודם את הגודל החיובי ${Math.abs(g.n)} בבינארי, ברוחב ${g.width} סיביות.`,
        'הפכו (השלימו) את כל הסיביות - זה משלים ל-1.',
        'ולבסוף הוסיפו 1 לתוצאה - זה מה שהופך את זה למשלים ל-2.',
      ];
    }
    return [
      'סיבית ה-MSB (השמאלית) היא סיבית הסימן: 0=חיובי, 1=שלילי.',
      g.bits === '10000000'
        ? 'זהו מקרה קצה חשוב: 10000000 הוא הערך השלילי הקיצוני ביותר שניתן לייצג ב-8 סיביות.'
        : 'אם הסימן שלילי, הגודל מחושב ממשלים ל-2 של הרגיסטר.',
      `הרגיסטר: ${g.bits}.`,
    ];
  }
  if (group === '1.4') {
    const w = g.forAddSub;
    if (w.op === 'add') {
      return [
        'חברו ביט אחר ביט מימין לשמאל: 0+0=0, 0+1=1, 1+1=10 (רושמים 0, מעבירים נשא 1).',
        w.overflowDisqualify ? 'שימו לב לרוחב הרגיסטר - בדקו כמה סיביות התוצאה האמיתית דורשת.' : 'העבירו כל נשא לעמודה הבאה בשמאל.',
        `A=${w.a}, B=${w.b}.`,
      ];
    }
    if (w.method === 'direct') {
      return [
        'חסרו ביט אחר ביט מימין לשמאל: 0-0=0, 1-0=1, 1-1=0.',
        'כשצריך לחסר 0-1, שאלו (borrow) 1 מהעמודה הבאה בשמאל.',
        `A=${w.a}, B=${w.b}.`,
      ];
    }
    return [
      'שיטת המשלים ל-2 לחיסור: A-B = A + (משלים-ל-2 של B).',
      'חשבו את משלים ה-2 של B (היפוך סיביות ואז +1), וחברו אותו ל-A.',
      'אם מתקבל נשא עודף מעבר לרוחב הרגיסטר - זורקים אותו ומשאירים רק את הסיביות שבתוך הרוחב.',
    ];
  }
  // 1.5
  if (g.kind === 'encodeBcd') {
    return [
      'ב-BCD כל ספרה עשרונית (0-9) מקודדת בנפרד, בנבל (4 סיביות) בינארי משלה.',
      `למספר ${g.number} יש ${String(g.number).length} ספרות עשרוניות - כל אחת מקבלת נבל נפרד.`,
      'אל תמירו את המספר השלם לבינארי הרגיל - זו טעות נפוצה.',
    ];
  }
  return [
    'חלקו את הרגיסטר לקבוצות של 4 סיביות (נבלים) מימין לשמאל.',
    'המירו כל נבל בנפרד לספרה העשרונית שלו (0-9), ואז הרכיבו את הספרות זו לצד זו.',
    `הרגיסטר: ${g.bits}.`,
  ];
}

// -------------------------------------------------------------- דיספצ'ר
function groupOf(localId) {
  if (localId <= 4) return '1.1';
  if (localId <= 10) return '1.2';
  if (localId <= 15) return '1.3';
  if (localId <= 21) return '1.4';
  return '1.5';
}

function generateForLocal(localId) {
  const group = groupOf(localId);
  if (group === '1.1') return generate11(localId, LEVEL_DEFS_11[localId - 1]);
  if (group === '1.2') return generate12(localId, LEVEL_DEFS_12[localId - 5]);
  if (group === '1.3') return generate13(localId, LEVEL_DEFS_13[localId - 11]);
  if (group === '1.4') return generate14(localId, LEVEL_DEFS_14[localId - 16]);
  return generate15(localId, LEVEL_DEFS_15[localId - 22]);
}

const TOTAL_LEVELS = 25;
const cache = new Map();

export function generateDigitalNumbersLevel(localId) {
  if (cache.has(localId)) return cache.get(localId);
  const group = groupOf(localId);
  const g = generateForLocal(localId);
  const { title, desc, prompt, answer, inputMode, ...rest } = g;
  const hints = buildHints(group, g);

  const question = { prompt, unit: '', answer, hints, ...rest };
  if (inputMode === 'text') question.inputMode = 'text';

  const level = {
    id: localId, title, description: desc,
    world: { group, answer, ...rest },
    question,
  };
  cache.set(localId, level);
  return level;
}

export function topicLevelCount() { return TOTAL_LEVELS; }

// ---------------------------------------------------------------- הערכת תשובה
export function evaluateDigitalNumbersAnswer(level, val) {
  switch (level.world.group) {
    case '1.1': return evaluate11(level, val);
    case '1.2': return evaluate12(level, val);
    case '1.3': return evaluate13(level, val);
    case '1.4': return evaluate14(level, val);
    default: return evaluate15(level, val);
  }
}
