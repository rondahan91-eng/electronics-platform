// ==========================================================================
// api.js - שכבת התקשורת מול השרת (Google Apps Script Web App).
// כל עוד CONFIG.API_URL ריק, פועל מצב פיתוח מקומי (DEV MODE) המדמה את
// אותה שכבה בדיוק באמצעות localStorage - כדי לאפשר בדיקה מלאה בדפדפן.
// ==========================================================================
import { CONFIG } from './config.js';
import { DEFAULT_CURRICULA, ALL_TOPIC_IDS, allGrades } from './curriculum.js';

const DB_KEY = 'masa-hazerem-devdb';

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- תקשורת אמיתית
async function callRemote(action, payload) {
  // משתמשים ב-Content-Type: text/plain כדי להימנע מ-CORS preflight (Apps Script לא תומך ב-OPTIONS)
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload }),
  });
  if (!res.ok) throw new Error('שגיאת רשת מול השרת (' + res.status + ')');
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'שגיאת שרת לא ידועה');
  return data.result;
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
  });
}

async function ensureSeeded() {
  let db = loadDB();
  if (db) { ensureGradesSeeded(db); return db; }
  db = { users: [], progress: {}, grades: {} };
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
    return { studentId: user.studentId, username: user.username, role: user.role, displayName: user.displayName, grade: user.grade || null };
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
    }));
  }

  if (action === 'advanceGradeTopic') {
    const { grade } = payload;
    if (!db.grades[grade]) db.grades[grade] = { unlockedCount: 1, topicIds: [...(DEFAULT_CURRICULA[grade] || [])] };
    const max = db.grades[grade].topicIds.length;
    db.grades[grade].unlockedCount = Math.min(db.grades[grade].unlockedCount + 1, max);
    saveDB(db);
    return { unlockedCount: db.grades[grade].unlockedCount };
  }

  if (action === 'assignTopicToGrade') {
    const { grade, topicId } = payload;
    if (!grade || !ALL_TOPIC_IDS.includes(topicId)) throw new Error('שכבה או נושא לא תקינים');
    if (!db.grades[grade]) db.grades[grade] = { unlockedCount: 1, topicIds: [] };
    if (!db.grades[grade].topicIds.includes(topicId)) db.grades[grade].topicIds.push(topicId);
    saveDB(db);
    return { topicIds: db.grades[grade].topicIds };
  }

  if (action === 'removeTopicFromGrade') {
    const { grade, topicId } = payload;
    if (!grade || !db.grades[grade]) throw new Error('שכבה לא נמצאה');
    db.grades[grade].topicIds = db.grades[grade].topicIds.filter(id => id !== topicId);
    db.grades[grade].unlockedCount = Math.min(db.grades[grade].unlockedCount, db.grades[grade].topicIds.length);
    saveDB(db);
    return { topicIds: db.grades[grade].topicIds, unlockedCount: db.grades[grade].unlockedCount };
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
export async function advanceGradeTopic(grade) {
  return dispatch('advanceGradeTopic', { grade });
}
export async function assignTopicToGrade(grade, topicId) {
  return dispatch('assignTopicToGrade', { grade, topicId });
}
export async function removeTopicFromGrade(grade, topicId) {
  return dispatch('removeTopicFromGrade', { grade, topicId });
}
export function isDevMode() { return !CONFIG.API_URL; }
