/**
 * ==========================================================================
 * מגמת אלקטרוניקה ומחשבים - Code.gs
 * שרת ה-Backend (Google Apps Script) עבור פלטפורמת הלמידה.
 * משתמש בגיליון Google Sheets מחובר כמסד נתונים.
 *
 * הוראות פריסה מלאות נמצאות בקובץ README.md שבשורש הפרויקט.
 * ==========================================================================
 */

const SHEET_USERS = 'Users';
const SHEET_LEVELS = 'LevelProgress';
const SHEET_GRADES = 'Grades';

// כל מזהי הנושאים האפשריים במאגר, ותוכנית הלימודים *ברירת המחדל* לכל שכבה
// (משמשת רק לזריעת גיליון Grades חדש) - חייבים להישאר מסונכרנים ידנית עם
// TOPICS/DEFAULT_CURRICULA ב-js/curriculum.js. השיבוץ בפועל לכל שכבה נשמר
// בעמודת topicIds בגיליון Grades ונערך דרך פאנל הניהול.
const ALL_TOPIC_IDS = ['charge-field', 'basic', 'advanced', 'ac', 'boss'];
const DEFAULT_GRADE_TOPICS = { 'י': ['charge-field', 'basic', 'advanced', 'ac', 'boss'] };

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
    'מגמת אלקטרוניקה ומחשבים - API פעיל. יש לשלוח בקשות POST בלבד.'
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
    case 'assignTopicToGrade': return assignTopicToGrade(payload.grade, payload.topicId);
    case 'removeTopicFromGrade': return removeTopicFromGrade(payload.grade, payload.topicId);
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
    sheet.appendRow(['studentId', 'topicId', 'levelId', 'solved', 'timeSeconds', 'disqualifications', 'attempts', 'updatedAt']);
  } else if (name === SHEET_GRADES) {
    sheet.appendRow(['grade', 'unlockedCount', 'topicIds']);
    Object.keys(DEFAULT_GRADE_TOPICS).forEach(g => sheet.appendRow([g, 1, DEFAULT_GRADE_TOPICS[g].join(',')]));
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
    t.levels[r.levelId] = { solved: !!r.solved, timeSeconds: r.timeSeconds || null, disqualifications: r.disqualifications || 0, attempts: r.attempts || 0 };
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
      const attempts = (Number(values[r][6]) || 0) + 1;
      if (solved) {
        sheet.getRange(rowNum, 4).setValue(true);
        sheet.getRange(rowNum, 5).setValue(timeSeconds);
      }
      sheet.getRange(rowNum, 6).setValue(dq);
      sheet.getRange(rowNum, 7).setValue(attempts);
      sheet.getRange(rowNum, 8).setValue(new Date());
      return { ok: true };
    }
  }
  sheet.appendRow([studentId, topicId, levelId, !!solved, solved ? timeSeconds : '', disqualified ? 1 : 0, 1, new Date()]);
  return { ok: true };
}

function parseTopicIds(str) {
  return String(str || '').split(',').map(s => s.trim()).filter(Boolean);
}

function fetchGrades() {
  const rows = sheetToObjects(getSheet(SHEET_GRADES));
  return Object.keys(DEFAULT_GRADE_TOPICS).map(grade => {
    const row = rows.find(r => r.grade === grade);
    return {
      grade,
      unlockedCount: row ? Number(row.unlockedCount) : 1,
      topicIds: row ? parseTopicIds(row.topicIds) : DEFAULT_GRADE_TOPICS[grade].slice(),
    };
  });
}

function advanceGradeTopic(grade) {
  if (!grade) throw new Error('חסרה שכבה');
  const sheet = getSheet(SHEET_GRADES);
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === grade) {
      const max = parseTopicIds(values[r][2]).length;
      const next = Math.min(Number(values[r][1]) + 1, max);
      sheet.getRange(r + 1, 2).setValue(next);
      return { unlockedCount: next };
    }
  }
  const topicIds = DEFAULT_GRADE_TOPICS[grade] || [];
  const next = Math.min(2, topicIds.length);
  sheet.appendRow([grade, next, topicIds.join(',')]);
  return { unlockedCount: next };
}

function assignTopicToGrade(grade, topicId) {
  if (!grade || ALL_TOPIC_IDS.indexOf(topicId) === -1) throw new Error('שכבה או נושא לא תקינים');
  const sheet = getSheet(SHEET_GRADES);
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === grade) {
      const topicIds = parseTopicIds(values[r][2]);
      if (topicIds.indexOf(topicId) === -1) {
        topicIds.push(topicId);
        sheet.getRange(r + 1, 3).setValue(topicIds.join(','));
      }
      return { topicIds };
    }
  }
  sheet.appendRow([grade, 1, topicId]);
  return { topicIds: [topicId] };
}

function removeTopicFromGrade(grade, topicId) {
  if (!grade) throw new Error('חסרה שכבה');
  const sheet = getSheet(SHEET_GRADES);
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === grade) {
      const topicIds = parseTopicIds(values[r][2]).filter(id => id !== topicId);
      const unlockedCount = Math.min(Number(values[r][1]) || 0, topicIds.length);
      sheet.getRange(r + 1, 2).setValue(unlockedCount);
      sheet.getRange(r + 1, 3).setValue(topicIds.join(','));
      return { topicIds, unlockedCount };
    }
  }
  throw new Error('שכבה לא נמצאה');
}

function summarizeStudent(user, levelRows) {
  const rows = levelRows.filter(r => r.studentId === user.studentId);
  const solvedRows = rows.filter(r => r.solved && typeof r.timeSeconds === 'number' && r.timeSeconds !== '');
  const avgTimeSeconds = solvedRows.length
    ? Math.round(solvedRows.reduce((s, r) => s + Number(r.timeSeconds), 0) / solvedRows.length)
    : null;
  const disqualifications = rows.reduce((s, r) => s + (Number(r.disqualifications) || 0), 0);
  const attempts = rows.reduce((s, r) => s + (Number(r.attempts) || 0), 0);
  const highestLevel = rows.filter(r => r.solved).reduce((m, r) => Math.max(m, Number(r.levelId)), 0);
  return {
    studentId: user.studentId,
    username: user.username,
    displayName: user.displayName,
    grade: user.grade || '—',
    highestLevel,
    avgTimeSeconds,
    disqualifications,
    attempts,
  };
}
