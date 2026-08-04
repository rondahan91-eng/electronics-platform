/**
 * ==========================================================================
 * מסע הזרם - Code.gs
 * שרת ה-Backend (Google Apps Script) עבור פלטפורמת הלמידה.
 * משתמש בגיליון Google Sheets מחובר כמסד נתונים.
 *
 * הוראות פריסה מלאות נמצאות בקובץ README.md שבשורש הפרויקט.
 * ==========================================================================
 */

const SHEET_USERS = 'Users';
const SHEET_LEVELS = 'LevelProgress';
const SHEET_GRADES = 'Grades';

// מספר הנושאים בתוכנית הלימודים של כל שכבה - חייב להישאר מסונכרן ידנית עם
// CURRICULA ב-js/curriculum.js (כאן זה רק כדי להגביל את "פתיחת הנושא הבא").
const CURRICULUM_TOPIC_COUNTS = { 'י': 4 };

// -------------------------------------------------------------- כניסה ל-Web App
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'בקשה לא תקינה (JSON שגוי)' });
  }
  const { action, payload } = body;
  try {
    const result = routeAction(action, payload || {});
    return jsonResponse({ ok: true, result });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || String(err) });
  }
}

function doGet() {
  return ContentService.createTextOutput(
    'מסע הזרם API פעיל. יש לשלוח בקשות POST בלבד.'
  ).setMimeType(ContentService.MimeType.TEXT);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function routeAction(action, payload) {
  switch (action) {
    case 'authenticateUser': return authenticateUser(payload.username, payload.password);
    case 'fetchClassProgress': return fetchClassProgress(payload.topicId);
    case 'createNewStudent': return createNewStudent(payload.username, payload.password, payload.displayName, payload.grade);
    case 'updateStudentPassword': return updateStudentPassword(payload.studentId, payload.newPassword);
    case 'saveLevelResult': return saveLevelResult(payload.studentId, payload.topicId, payload.levelId, payload.solved, payload.timeSeconds, payload.disqualified);
    case 'fetchMyProgress': return fetchMyProgress(payload.studentId);
    case 'fetchGrades': return fetchGrades();
    case 'advanceGradeTopic': return advanceGradeTopic(payload.grade);
    default: throw new Error('פעולה לא מוכרת: ' + action);
  }
}

// -------------------------------------------------------------- גישה לגיליונות
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = createSheet(ss, name);
  return sheet;
}

function createSheet(ss, name) {
  const sheet = ss.insertSheet(name);
  if (name === SHEET_USERS) {
    sheet.appendRow(['studentId', 'username', 'passHash', 'role', 'displayName', 'grade', 'createdAt']);
    const now = new Date();
    sheet.appendRow(['admin', 'admin', sha256('admin123'), 'admin', 'מורה ראשי', '', now]);
    sheet.appendRow(['demo1', 'demo', sha256('demo1234'), 'student', 'תלמיד/ה לדוגמה', 'י', now]);
  } else if (name === SHEET_LEVELS) {
    sheet.appendRow(['studentId', 'topicId', 'levelId', 'solved', 'timeSeconds', 'disqualifications', 'updatedAt']);
  } else if (name === SHEET_GRADES) {
    sheet.appendRow(['grade', 'unlockedCount']);
    Object.keys(CURRICULUM_TOPIC_COUNTS).forEach(g => sheet.appendRow([g, 1]));
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(row => row[0] !== '').map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function sha256(str) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return bytes.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0')).join('');
}

// -------------------------------------------------------------- פעולות API
function authenticateUser(username, password) {
  if (!username || !password) throw new Error('שם משתמש וסיסמה הם שדות חובה');
  const users = sheetToObjects(getSheet(SHEET_USERS));
  const user = users.find(u => String(u.username).toLowerCase() === String(username).trim().toLowerCase());
  if (!user) throw new Error('שם משתמש או סיסמה שגויים');
  if (sha256(password) !== user.passHash) throw new Error('שם משתמש או סיסמה שגויים');
  return { studentId: user.studentId, username: user.username, role: user.role, displayName: user.displayName, grade: user.grade || null };
}

function createNewStudent(username, password, displayName, grade) {
  if (!username || !password) throw new Error('חובה למלא שם משתמש וסיסמה');
  const sheet = getSheet(SHEET_USERS);
  const users = sheetToObjects(sheet);
  if (users.some(u => String(u.username).toLowerCase() === username.trim().toLowerCase())) {
    throw new Error('שם המשתמש כבר קיים במערכת');
  }
  const studentId = 's_' + Utilities.getUuid().slice(0, 8);
  sheet.appendRow([studentId, username.trim(), sha256(password), 'student', displayName || username.trim(), grade || '', new Date()]);
  return { studentId, username: username.trim() };
}

function updateStudentPassword(studentId, newPassword) {
  if (!studentId || !newPassword) throw new Error('חסרים פרטים לעדכון הסיסמה');
  const sheet = getSheet(SHEET_USERS);
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === studentId) {
      sheet.getRange(r + 1, 3).setValue(sha256(newPassword)); // עמודה 3 = passHash
      return { ok: true };
    }
  }
  throw new Error('תלמיד לא נמצא');
}

function fetchClassProgress(topicId) {
  const users = sheetToObjects(getSheet(SHEET_USERS)).filter(u => u.role === 'student');
  const levelRows = sheetToObjects(getSheet(SHEET_LEVELS)).filter(r => r.topicId === topicId);
  return users.map(u => summarizeStudent(u, levelRows));
}

function fetchMyProgress(studentId) {
  const levelRows = sheetToObjects(getSheet(SHEET_LEVELS)).filter(r => r.studentId === studentId);
  const byTopic = {};
  levelRows.forEach(r => {
    if (!byTopic[r.topicId]) byTopic[r.topicId] = { highestLevel: 0, levels: {} };
    const t = byTopic[r.topicId];
    t.levels[r.levelId] = { solved: !!r.solved, timeSeconds: r.timeSeconds || null, disqualifications: r.disqualifications || 0 };
    if (r.solved) t.highestLevel = Math.max(t.highestLevel, Number(r.levelId));
  });
  return byTopic;
}

function saveLevelResult(studentId, topicId, levelId, solved, timeSeconds, disqualified) {
  if (!studentId || !topicId || levelId == null) throw new Error('חסרים פרטי שלב/נושא/תלמיד');
  const sheet = getSheet(SHEET_LEVELS);
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === studentId && values[r][1] === topicId && Number(values[r][2]) === Number(levelId)) {
      const rowNum = r + 1;
      let dq = Number(values[r][5]) || 0;
      if (disqualified) dq += 1;
      if (solved) {
        sheet.getRange(rowNum, 4).setValue(true);
        sheet.getRange(rowNum, 5).setValue(timeSeconds);
      }
      sheet.getRange(rowNum, 6).setValue(dq);
      sheet.getRange(rowNum, 7).setValue(new Date());
      return { ok: true };
    }
  }
  sheet.appendRow([studentId, topicId, levelId, !!solved, solved ? timeSeconds : '', disqualified ? 1 : 0, new Date()]);
  return { ok: true };
}

function fetchGrades() {
  const rows = sheetToObjects(getSheet(SHEET_GRADES));
  return Object.keys(CURRICULUM_TOPIC_COUNTS).map(grade => {
    const row = rows.find(r => r.grade === grade);
    return { grade, unlockedCount: row ? Number(row.unlockedCount) : 1 };
  });
}

function advanceGradeTopic(grade) {
  if (!grade) throw new Error('חסרה שכבה');
  const sheet = getSheet(SHEET_GRADES);
  const values = sheet.getDataRange().getValues();
  const max = CURRICULUM_TOPIC_COUNTS[grade] || 1;
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === grade) {
      const next = Math.min(Number(values[r][1]) + 1, max);
      sheet.getRange(r + 1, 2).setValue(next);
      return { unlockedCount: next };
    }
  }
  const next = Math.min(2, max);
  sheet.appendRow([grade, next]);
  return { unlockedCount: next };
}

function summarizeStudent(user, levelRows) {
  const rows = levelRows.filter(r => r.studentId === user.studentId);
  const solvedRows = rows.filter(r => r.solved && typeof r.timeSeconds === 'number' && r.timeSeconds !== '');
  const avgTimeSeconds = solvedRows.length
    ? Math.round(solvedRows.reduce((s, r) => s + Number(r.timeSeconds), 0) / solvedRows.length)
    : null;
  const disqualifications = rows.reduce((s, r) => s + (Number(r.disqualifications) || 0), 0);
  const highestLevel = rows.filter(r => r.solved).reduce((m, r) => Math.max(m, Number(r.levelId)), 0);
  return {
    studentId: user.studentId,
    username: user.username,
    displayName: user.displayName,
    grade: user.grade || '—',
    highestLevel,
    avgTimeSeconds,
    disqualifications,
  };
}
