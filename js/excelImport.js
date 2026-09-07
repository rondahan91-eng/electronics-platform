// ==========================================================================
// excelImport.js - פרשור קובץ Excel של תלמידים + חישוב פרטי התחברות לפי
// כללים קבועים. משתמש בספריית SheetJS הגלובלית (XLSX) שנטענת ב-index.html.
// ==========================================================================
import { allGrades } from './curriculum.js';

// כינויי כותרות אפשריים בעברית לכל שדה קנוני (נרמול: trim + הסרת גרשיים)
const HEADER_ALIASES = {
  firstName: ['שם פרטי'],
  lastName: ['שם משפחה'],
  idNumber: ['ת.ז', 'ת"ז', 'ת״ז', 'תעודת זהות', 'תז'],
  dob: ['תאריך לידה'],
  grade: ['כיתה', 'שכבה'],
};
const FIELD_LABELS = {
  firstName: 'שם פרטי', lastName: 'שם משפחה', idNumber: 'ת.ז',
  dob: 'תאריך לידה', grade: 'כיתה',
};

function normalizeHeader(h) {
  return String(h || '').replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim();
}

/** מנרמל ערך שכבה מקובץ Excel: מסיר גרשיים ומספר כיתה מקבילה בסוף
 * (למשל "יא1"/"יא2" -> "יא", "י'" -> "י") - כיתות מקבילות מדווחות תמיד
 * לאותה שכבה קנונית במערכת, שלא מבחינה בין כיתות מקבילות. */
function normalizeGrade(g) {
  return String(g || '').replace(/["'״׳]/g, '').replace(/\s+/g, '').replace(/\d+$/, '').trim();
}

function buildFieldMap(sampleRow) {
  const rawHeaders = Object.keys(sampleRow);
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const normalizedAliases = aliases.map(normalizeHeader);
    // התאמה מדויקת קודם; אם לא נמצאה, נופלים ל"מתחיל ב-" כדי לתמוך גם
    // בכותרות עם הבהרה בסוגריים (למשל "ת.ז (4 ספרות אחרונות)").
    const exact = rawHeaders.find(h => normalizedAliases.includes(normalizeHeader(h)));
    const found = exact || rawHeaders.find(h => {
      const nh = normalizeHeader(h);
      return normalizedAliases.some(a => nh.startsWith(a));
    });
    if (found) map[field] = found;
  }
  return map;
}

/** מפרש ערך תאריך לידה (Date אמיתי מ-SheetJS, או מחרוזת DD/MM/YYYY וכדומה). */
export function parseDob(value) {
  if (value instanceof Date && !isNaN(value)) {
    return {
      dd: String(value.getDate()).padStart(2, '0'),
      mm: String(value.getMonth() + 1).padStart(2, '0'),
      yy: String(value.getFullYear() % 100).padStart(2, '0'),
    };
  }
  const s = String(value || '').trim();
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10), month = parseInt(m[2], 10);
  let year = m[3];
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  year = year.length === 4 ? year.slice(2) : year.padStart(2, '0');
  return { dd: String(day).padStart(2, '0'), mm: String(month).padStart(2, '0'), yy: year };
}

/** שם משתמש = שם פרטי + 3 הספרות האחרונות של ת.ז, עם דה-דופ (_2, _3...). */
export function deriveUsername(firstName, idNumber, takenSet) {
  const digits = String(idNumber || '').replace(/\D/g, '');
  const last3 = digits.slice(-3).padStart(3, '0');
  const base = firstName.trim() + last3;
  let candidate = base;
  let i = 2;
  while (takenSet.has(candidate)) {
    candidate = `${base}_${i}`;
    i += 1;
  }
  takenSet.add(candidate);
  return candidate;
}

function isBlankRow(row, fieldMap) {
  return Object.values(fieldMap).every(key => String(row[key] ?? '').trim() === '');
}

/**
 * מפרש קובץ Excel של תלמידים ומחזיר { valid, invalid }.
 * @param {File} file
 * @param {string[]} existingUsernames - שמות משתמש קיימים כבר במערכת (למניעת התנגשות)
 */
export async function parseStudentsExcel(file, existingUsernames = []) {
  if (typeof XLSX === 'undefined') {
    throw new Error('ספריית קריאת ה-Excel לא נטענה. ודאו חיבור אינטרנט ורעננו את הדף.');
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rows.length) {
    return { valid: [], invalid: [{ row: 0, reason: 'הקובץ ריק, או שלא נמצאו כותרות עמודות בשורה הראשונה.' }] };
  }

  const fieldMap = buildFieldMap(rows[0]);
  const missingFields = Object.keys(HEADER_ALIASES).filter(f => !fieldMap[f]);
  if (missingFields.length) {
    return {
      valid: [],
      invalid: [{ row: 0, reason: `עמודות חסרות בקובץ: ${missingFields.map(f => FIELD_LABELS[f]).join(', ')}` }],
    };
  }

  const takenUsernames = new Set(existingUsernames);
  const valid = [];
  const invalid = [];

  rows.forEach((row, i) => {
    const excelRow = i + 2; // שורה 1 = כותרות
    if (isBlankRow(row, fieldMap)) return; // דילוג שקט על שורות ריקות

    const firstName = String(row[fieldMap.firstName] ?? '').trim();
    const lastName = String(row[fieldMap.lastName] ?? '').trim();
    const idNumber = String(row[fieldMap.idNumber] ?? '').trim();
    const dobRaw = row[fieldMap.dob];
    const grade = normalizeGrade(row[fieldMap.grade]);

    if (!firstName || !lastName || !idNumber || !dobRaw || !grade) {
      invalid.push({ row: excelRow, reason: 'חסרים שדות חובה בשורה.' });
      return;
    }
    const dob = parseDob(dobRaw);
    if (!dob) {
      invalid.push({ row: excelRow, reason: `תאריך לידה לא תקין ("${dobRaw}"). פורמט צפוי: DD/MM/YYYY.` });
      return;
    }
    if (!allGrades().includes(grade)) {
      invalid.push({ row: excelRow, reason: `שכבה לא מוכרת בתוכנית הלימודים: "${grade}".` });
      return;
    }

    const username = deriveUsername(firstName, idNumber, takenUsernames);
    const password = dob.dd + dob.mm + dob.yy;
    valid.push({
      excelRow, firstName, lastName, displayName: `${firstName} ${lastName}`,
      idNumber, grade, username, password,
    });
  });

  return { valid, invalid };
}
