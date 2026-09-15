// ==========================================================================
// api.js - שכבת התקשורת מול השרת (Google Apps Script Web App).
// כל עוד CONFIG.API_URL ריק, פועל מצב פיתוח מקומי (DEV MODE) המדמה את
// אותה שכבה בדיוק באמצעות localStorage - כדי לאפשר בדיקה מלאה בדפדפן.
// ==========================================================================
import { CONFIG } from './config.js';
import { DEFAULT_CURRICULA, allGrades } from './curriculum.js';
import { DEFAULT_REVEALED } from './syllabus.js';

const DB_KEY = 'masa-hazerem-devdb';

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- תקשורת אמיתית
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// שגיאות רשת/עומס זמני בלבד מנוסות שוב (עד 3 ניסיונות נוספים, בהשהיה
// גדלה) - שגיאה עסקית אמיתית (סיסמה שגויה, שם משתמש תפוס וכו') נזרקת מיד
// בלי ניסיון חוזר, כי לחזור עליה לא עוזר. המטרה: תקלת-רגע (בעיית רשת
// חולפת, 503 זמני, או "השרת עמוס" מנעילת-תור ב-Code.gs) לא תיראה למשתמש/ת
// ככישלון קשיח - היא תיפתר בשקט ברוב המקרים בלי לדרוש לחיצה חוזרת.
const RETRY_DELAYS_MS = [500, 1200, 2500];
const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);

async function callRemote(action, payload) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      // משתמשים ב-Content-Type: text/plain כדי להימנע מ-CORS preflight (Apps Script לא תומך ב-OPTIONS)
      res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload }),
      });
    } catch (networkErr) {
      // ה-fetch עצמו נכשל (אין אינטרנט/DNS/הבקשה נחסמה) - זמני מטבעו.
      if (attempt < RETRY_DELAYS_MS.length) { await sleep(RETRY_DELAYS_MS[attempt]); continue; }
      throw new Error('בעיית חיבור לאינטרנט - בדקו את החיבור ונסו שוב.');
    }
    if (!res.ok) {
      if (RETRYABLE_HTTP_STATUS.has(res.status) && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]); continue;
      }
      throw new Error('שגיאת רשת מול השרת (' + res.status + ')');
    }
    const data = await res.json();
    if (!data.ok) {
      if (String(data.error || '').indexOf('השרת עמוס') !== -1 && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]); continue;
      }
      throw new Error(data.error || 'שגיאת שרת לא ידועה');
    }
    return data.result;
  }
}

// ---------------------------------------------------------------- DEV MODE (localStorage)
function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  return raw ? JSON.parse(raw) : null;
}
function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function delay(ms = 220) { return new Promise(r => setTimeout(r, ms)); }

function ensureGradesSeeded(db) {
  if (!db.grades) db.grades = {};
  allGrades().forEach(g => {
    if (!db.grades[g]) db.grades[g] = { unlockedCount: 1, topicIds: [...(DEFAULT_CURRICULA[g] || [])] };
    if (!db.grades[g].topicIds) db.grades[g].topicIds = [...(DEFAULT_CURRICULA[g] || [])]; // מיגרציה לנתונים ישנים
    // "חשיפת פרקים" - שכבת המידע החדשה (syllabus.js), חיה *לצד* המנגנון
    // הישן (unlockedCount/topicIds) בזמן המעבר בין העיצובים; המנגנון
    // הישן יוסר אחרי שלבים 4/6 (שם home.js/dashboard.js עוברים אליה).
    if (!db.grades[g].revealed) db.grades[g].revealed = [...DEFAULT_REVEALED];
  });
}

async function ensureSeeded() {
  let db = loadDB();
  if (db) { ensureGradesSeeded(db); if (!db.reports) db.reports = []; return db; }
  db = { users: [], progress: {}, grades: {}, reports: [] };
  const adminHash = await sha256Hex('admin123');
  const demoHash = await sha256Hex('demo1234');
  db.users.push({ studentId: 'admin', username: 'admin', passHash: adminHash, role: 'admin', displayName: 'מורה ראשי', grade: null });
  db.users.push({ studentId: 'demo1', username: 'demo', passHash: demoHash, role: 'student', displayName: 'תלמיד/ה לדוגמה', grade: 'י' });
  db.progress.demo1 = {
    basic: {
      highestLevel: 3,
      levels: {
        1: { solved: true, timeSeconds: 46, disqualifications: 0, attempts: 1 },
        2: { solved: true, timeSeconds: 91, disqualifications: 1, attempts: 3 },
        3: { solved: true, timeSeconds: 138, disqualifications: 2, attempts: 4 },
      },
    },
  };
  ensureGradesSeeded(db);
  saveDB(db);
  return db;
}

async function callLocal(action, payload) {
  await delay();
  const db = await ensureSeeded();

  if (action === 'authenticateUser') {
    const { username, password } = payload;
    const user = db.users.find(u => u.username.toLowerCase() === String(username).trim().toLowerCase());
    if (!user) throw new Error('שם משתמש או סיסמה שגויים');
    const hash = await sha256Hex(password);
    if (hash !== user.passHash) throw new Error('שם משתמש או סיסמה שגויים');
    // רצף ימי כניסה - מתעדכן פעם ביום, לא בכל בדיקה. מבוסס על תאריך
    // התחברות אמיתי (לא נתון מדומה) - נשמר לכל תלמיד/ה בנפרד.
    if (user.role === 'student') {
      const today = new Date().toISOString().slice(0, 10);
      if (user.lastActiveDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        user.streakDays = user.lastActiveDate === yesterday ? (user.streakDays || 0) + 1 : 1;
        user.lastActiveDate = today;
        saveDB(db);
      }
    }
    return {
      studentId: user.studentId, username: user.username, role: user.role,
      displayName: user.displayName, grade: user.grade || null, streakDays: user.streakDays || 0,
    };
  }

  if (action === 'fetchClassProgress') {
    const { topicId } = payload;
    return db.users.filter(u => u.role === 'student').map(u => summarizeStudent(db, u, topicId));
  }

  if (action === 'createNewStudent') {
    const { username, password, displayName, grade } = payload;
    if (!username || !password) throw new Error('חובה למלא שם משתמש וסיסמה');
    if (db.users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
      throw new Error('שם המשתמש כבר קיים במערכת');
    }
    const studentId = 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const passHash = await sha256Hex(password);
    db.users.push({ studentId, username: username.trim(), passHash, role: 'student', displayName: displayName || username.trim(), grade: grade || null });
    db.progress[studentId] = {};
    saveDB(db);
    return { studentId, username: username.trim() };
  }

  if (action === 'updateStudentPassword') {
    const { studentId, newPassword } = payload;
    const user = db.users.find(u => u.studentId === studentId);
    if (!user) throw new Error('תלמיד לא נמצא');
    user.passHash = await sha256Hex(newPassword);
    saveDB(db);
    return { ok: true };
  }

  if (action === 'saveLevelResult') {
    const { studentId, topicId, levelId, solved, timeSeconds, disqualified } = payload;
    if (!db.progress[studentId]) db.progress[studentId] = {};
    if (!db.progress[studentId][topicId]) db.progress[studentId][topicId] = { highestLevel: 0, levels: {} };
    const prog = db.progress[studentId][topicId];
    const lv = prog.levels[levelId] || { solved: false, timeSeconds: null, disqualifications: 0, attempts: 0 };
    lv.attempts = (lv.attempts || 0) + 1;
    if (disqualified) lv.disqualifications = (lv.disqualifications || 0) + 1;
    if (solved) {
      lv.solved = true;
      lv.timeSeconds = timeSeconds;
      prog.highestLevel = Math.max(prog.highestLevel || 0, levelId);
    }
    prog.levels[levelId] = lv;
    saveDB(db);
    return { ok: true };
  }

  if (action === 'fetchMyProgress') {
    const { studentId } = payload;
    return db.progress[studentId] || {};
  }

  if (action === 'fetchGrades') {
    return allGrades().map(g => ({
      grade: g,
      unlockedCount: db.grades[g]?.unlockedCount || 1,
      topicIds: db.grades[g]?.topicIds || [],
      revealed: db.grades[g]?.revealed || [],
    }));
  }

  if (action === 'revealChapter') {
    const { grade, key } = payload;
    if (!db.grades[grade]) db.grades[grade] = { unlockedCount: 1, topicIds: [], revealed: [] };
    if (!db.grades[grade].revealed.includes(key)) db.grades[grade].revealed.push(key);
    saveDB(db);
    return { revealed: db.grades[grade].revealed };
  }

  if (action === 'hideChapter') {
    const { grade, key } = payload;
    if (!db.grades[grade]) db.grades[grade] = { unlockedCount: 1, topicIds: [], revealed: [] };
    db.grades[grade].revealed = db.grades[grade].revealed.filter(k => k !== key);
    saveDB(db);
    return { revealed: db.grades[grade].revealed };
  }

  if (action === 'changeMyPassword') {
    const { studentId, currentPassword, newPassword } = payload;
    const user = db.users.find(u => u.studentId === studentId);
    if (!user) throw new Error('משתמש לא נמצא');
    const hash = await sha256Hex(currentPassword);
    if (hash !== user.passHash) throw new Error('הסיסמה הנוכחית שגויה');
    user.passHash = await sha256Hex(newPassword);
    saveDB(db);
    return { ok: true };
  }

  if (action === 'submitReport') {
    const { studentId, studentName, grade, screen, text } = payload;
    if (!text || !text.trim()) throw new Error('נא לכתוב תיאור קצר של התקלה');
    const report = {
      id: 'R-' + Date.now().toString(36),
      studentId, studentName: studentName || 'לא ידוע', grade: grade || '—',
      screen, text: text.trim(), open: true, createdAt: new Date().toISOString(),
    };
    db.reports.unshift(report);
    saveDB(db);
    return report;
  }

  if (action === 'fetchReports') {
    return db.reports.slice();
  }

  if (action === 'toggleReportOpen') {
    const { id } = payload;
    const report = db.reports.find(r => r.id === id);
    if (!report) throw new Error('דיווח לא נמצא');
    report.open = !report.open;
    saveDB(db);
    return { open: report.open };
  }

  if (action === 'fetchTopicLevelStats') {
    const { topicId } = payload;
    const byLevel = {};
    Object.values(db.progress).forEach(byTopic => {
      const prog = byTopic[topicId];
      if (!prog || !prog.levels) return;
      Object.entries(prog.levels).forEach(([levelId, lv]) => {
        const id = Number(levelId);
        if (!byLevel[id]) byLevel[id] = { levelId: id, dq: 0, attempts: 0 };
        byLevel[id].dq += lv.disqualifications || 0;
        byLevel[id].attempts += lv.attempts || 0;
      });
    });
    return Object.values(byLevel).sort((a, b) => a.levelId - b.levelId);
  }

  throw new Error('פעולה לא מוכרת: ' + action);
}

function summarizeStudent(db, user, topicId) {
  const topicProg = (db.progress[user.studentId] && db.progress[user.studentId][topicId]) || { highestLevel: 0, levels: {} };
  const solvedLevels = Object.values(topicProg.levels || {}).filter(l => l.solved && typeof l.timeSeconds === 'number');
  const avgTime = solvedLevels.length
    ? Math.round(solvedLevels.reduce((s, l) => s + l.timeSeconds, 0) / solvedLevels.length)
    : null;
  const disqualifications = Object.values(topicProg.levels || {}).reduce((s, l) => s + (l.disqualifications || 0), 0);
  const attempts = Object.values(topicProg.levels || {}).reduce((s, l) => s + (l.attempts || 0), 0);
  return {
    studentId: user.studentId,
    username: user.username,
    displayName: user.displayName,
    grade: user.grade || '—',
    highestLevel: topicProg.highestLevel || 0,
    avgTimeSeconds: avgTime,
    disqualifications,
    attempts,
    lastActiveDate: user.lastActiveDate || null,
  };
}

async function dispatch(action, payload) {
  return CONFIG.API_URL ? callRemote(action, payload) : callLocal(action, payload);
}

// ---------------------------------------------------------------- API ציבורי
export async function authenticateUser(username, password) {
  return dispatch('authenticateUser', { username, password });
}
export async function fetchClassProgress(topicId) {
  return dispatch('fetchClassProgress', { topicId });
}
export async function createNewStudent(username, password, displayName, grade) {
  return dispatch('createNewStudent', { username, password, displayName, grade });
}
export async function updateStudentPassword(studentId, newPassword) {
  return dispatch('updateStudentPassword', { studentId, newPassword });
}
export async function saveLevelResult(studentId, topicId, levelId, { solved, timeSeconds, disqualified }) {
  return dispatch('saveLevelResult', { studentId, topicId, levelId, solved, timeSeconds, disqualified });
}
export async function fetchMyProgress(studentId) {
  return dispatch('fetchMyProgress', { studentId });
}
export async function fetchGrades() {
  return dispatch('fetchGrades', {});
}
export async function fetchTopicLevelStats(topicId) {
  return dispatch('fetchTopicLevelStats', { topicId });
}
export async function changeMyPassword(studentId, currentPassword, newPassword) {
  return dispatch('changeMyPassword', { studentId, currentPassword, newPassword });
}
export async function submitReport(report) {
  return dispatch('submitReport', report);
}
export async function fetchReports() {
  return dispatch('fetchReports', {});
}
export async function toggleReportOpen(id) {
  return dispatch('toggleReportOpen', { id });
}
export async function revealChapter(grade, key) {
  return dispatch('revealChapter', { grade, key });
}
export async function hideChapter(grade, key) {
  return dispatch('hideChapter', { grade, key });
}
export function isDevMode() { return !CONFIG.API_URL; }
