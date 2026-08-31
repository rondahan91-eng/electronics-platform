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
const SHEET_REPORTS = 'Reports';

// תוכנית הלימודים *ברירת המחדל* לכל שכבה (משמשת רק לזריעת גיליון Grades
// חדש) - חייבת להישאר מסונכרנת ידנית עם TOPICS/DEFAULT_CURRICULA
// ב-js/curriculum.js. תוכן חשוף בפועל לתלמידים נשלט דרך עמודת revealed
// (chapterKey מ-syllabus.js), לא דרך topicIds/unlockedCount למטה -
// אלה נשארים בגיליון רק כשדה legacy, לא נכתבים או נקראים יותר בקוד.
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
    case 'fetchTopicLevelStats': return fetchTopicLevelStats(payload.topicId);
    case 'revealChapter': return revealChapter(payload.grade, payload.key);
    case 'hideChapter': return hideChapter(payload.grade, payload.key);
    case 'changeMyPassword': return changeMyPassword(payload.studentId, payload.currentPassword, payload.newPassword);
    case 'submitReport': return submitReport(payload.studentId, payload.studentName, payload.grade, payload.screen, payload.text);
    case 'fetchReports': return fetchReports();
    case 'toggleReportOpen': return toggleReportOpen(payload.id);
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
    sheet.appendRow(['studentId', 'username', 'passHash', 'role', 'displayName', 'grade', 'streakDays', 'lastActiveDate', 'createdAt']);
    const now = new Date();
    sheet.appendRow(['admin', 'admin', sha256('admin123'), 'admin', 'מורה ראשי', '', 0, '', now]);
    sheet.appendRow(['demo1', 'demo', sha256('demo1234'), 'student', 'תלמיד/ה לדוגמה', 'י', 0, '', now]);
  } else if (name === SHEET_LEVELS) {
    sheet.appendRow(['studentId', 'topicId', 'levelId', 'solved', 'timeSeconds', 'disqualifications', 'attempts', 'updatedAt']);
  } else if (name === SHEET_GRADES) {
    // 'revealed' = מפתחות פרקים חשופים (syllabus.js, "chapterKey#N"), הבסיס
    // החדש לפתיחת תוכן לתלמידים - ריק כברירת מחדל, המורה חושף דרך הדשבורד.
    sheet.appendRow(['grade', 'unlockedCount', 'topicIds', 'revealed']);
    Object.keys(DEFAULT_GRADE_TOPICS).forEach(g => sheet.appendRow([g, 1, DEFAULT_GRADE_TOPICS[g].join(','), '']));
  } else if (name === SHEET_REPORTS) {
    sheet.appendRow(['id', 'studentId', 'studentName', 'grade', 'screen', 'text', 'open', 'createdAt']);
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
  const sheet = getSheet(SHEET_USERS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const col = h => headers.indexOf(h);
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (String(row[col('username')]).toLowerCase() !== String(username).trim().toLowerCase()) continue;
    if (sha256(password) !== row[col('passHash')]) throw new Error('שם משתמש או סיסמה שגויים');
    const role = row[col('role')];
    let streakDays = Number(row[col('streakDays')]) || 0;
    // רצף ימי כניסה - מתעדכן פעם ביום לפי תאריך אמיתי, לא נתון מדומה.
    if (role === 'student' && col('lastActiveDate') !== -1) {
      const tz = Session.getScriptTimeZone();
      const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
      const lastActive = row[col('lastActiveDate')];
      if (lastActive !== today) {
        const yesterday = Utilities.formatDate(new Date(Date.now() - 86400000), tz, 'yyyy-MM-dd');
        streakDays = lastActive === yesterday ? streakDays + 1 : 1;
        sheet.getRange(r + 1, col('streakDays') + 1).setValue(streakDays);
        sheet.getRange(r + 1, col('lastActiveDate') + 1).setValue(today);
      }
    }
    return {
      studentId: row[col('studentId')], username: row[col('username')], role,
      displayName: row[col('displayName')], grade: row[col('grade')] || null, streakDays,
    };
  }
  throw new Error('שם משתמש או סיסמה שגויים');
}

function createNewStudent(username, password, displayName, grade) {
  if (!username || !password) throw new Error('חובה למלא שם משתמש וסיסמה');
  const sheet = getSheet(SHEET_USERS);
  const users = sheetToObjects(sheet);
  if (users.some(u => String(u.username).toLowerCase() === username.trim().toLowerCase())) {
    throw new Error('שם המשתמש כבר קיים במערכת');
  }
  const studentId = 's_' + Utilities.getUuid().slice(0, 8);
  sheet.appendRow([studentId, username.trim(), sha256(password), 'student', displayName || username.trim(), grade || '', 0, '', new Date()]);
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

function changeMyPassword(studentId, currentPassword, newPassword) {
  if (!studentId || !currentPassword || !newPassword) throw new Error('חסרים פרטים לעדכון הסיסמה');
  const sheet = getSheet(SHEET_USERS);
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === studentId) {
      if (sha256(currentPassword) !== values[r][2]) throw new Error('הסיסמה הנוכחית שגויה');
      sheet.getRange(r + 1, 3).setValue(sha256(newPassword));
      return { ok: true };
    }
  }
  throw new Error('משתמש לא נמצא');
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
      revealed: row ? parseTopicIds(row.revealed) : [],
    };
  });
}

function setRevealed(grade, revealed) {
  const sheet = getSheet(SHEET_GRADES);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const revealedCol = headers.indexOf('revealed') + 1; // 1-based; אם חסרה בגיליון ישן, לא נכתוב
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === grade) {
      if (revealedCol > 0) sheet.getRange(r + 1, revealedCol).setValue(revealed.join(','));
      return;
    }
  }
  sheet.appendRow([grade, 1, (DEFAULT_GRADE_TOPICS[grade] || []).join(','), revealed.join(',')]);
}

function revealChapter(grade, key) {
  if (!grade || !key) throw new Error('חסרים פרטי שכבה/פרק');
  const current = fetchGrades().find(g => g.grade === grade);
  const revealed = current ? current.revealed.slice() : [];
  if (revealed.indexOf(key) === -1) revealed.push(key);
  setRevealed(grade, revealed);
  return { revealed };
}

function hideChapter(grade, key) {
  if (!grade || !key) throw new Error('חסרים פרטי שכבה/פרק');
  const current = fetchGrades().find(g => g.grade === grade);
  const revealed = (current ? current.revealed : []).filter(k => k !== key);
  setRevealed(grade, revealed);
  return { revealed };
}

function fetchTopicLevelStats(topicId) {
  const rows = sheetToObjects(getSheet(SHEET_LEVELS)).filter(r => r.topicId === topicId);
  const byLevel = {};
  rows.forEach(r => {
    const id = Number(r.levelId);
    if (!byLevel[id]) byLevel[id] = { levelId: id, dq: 0, attempts: 0 };
    byLevel[id].dq += Number(r.disqualifications) || 0;
    byLevel[id].attempts += Number(r.attempts) || 0;
  });
  return Object.values(byLevel).sort((a, b) => a.levelId - b.levelId);
}

function submitReport(studentId, studentName, grade, screen, text) {
  if (!text || !String(text).trim()) throw new Error('נא לכתוב תיאור קצר של התקלה');
  const sheet = getSheet(SHEET_REPORTS);
  const id = 'R-' + Utilities.getUuid().slice(0, 8);
  const now = new Date();
  sheet.appendRow([id, studentId || '', studentName || 'לא ידוע', grade || '—', screen || '', String(text).trim(), true, now]);
  return { id, studentId, studentName: studentName || 'לא ידוע', grade: grade || '—', screen, text: String(text).trim(), open: true, createdAt: now };
}

function fetchReports() {
  return sheetToObjects(getSheet(SHEET_REPORTS)).map(r => Object.assign({}, r, { open: !!r.open })).reverse();
}

function toggleReportOpen(id) {
  if (!id) throw new Error('חסר מזהה דיווח');
  const sheet = getSheet(SHEET_REPORTS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const openCol = headers.indexOf('open') + 1;
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === id) {
      const newOpen = !values[r][openCol - 1];
      sheet.getRange(r + 1, openCol).setValue(newOpen);
      return { open: newOpen };
    }
  }
  throw new Error('דיווח לא נמצא');
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
    lastActiveDate: user.lastActiveDate || null,
  };
}
