// רכיבי ממשק משותפים: פס עליון, טוסט הודעות, מודל דיווח תקלות, עזרי DOM קטנים.
import { CONFIG } from './config.js';
import { submitReport } from './api.js';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer = null;
export function toast(msg, isErr = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// מסלול ניווט יחיד לכל תפקיד (תלמיד/ה→נושאי הלימוד, מורה→לוח בקרה) - פרקים
// ותת-נושאים נכנסים מתוך העמוד עצמו, לא מה-rail (ראו Prism v2.1 README).
const NAV_BY_ROLE = {
  admin: [{ key: 'teacher', label: 'לוח בקרה', icon: '▦' }],
  student: [{ key: 'home', label: 'נושאי הלימוד', icon: '▦' }],
};

/** בונה את מעטפת האפליקציה (rail ניווט + main) סביב תוכן מסך נתון.
 * activeKey - 'home'|'teacher' (איזה פריט ניווט מודגש).
 * opts.stats - {streak, points} אמיתיים (לא נתוני דמו) - מוצגים רק
 * לתלמיד/ה כשסופקו; ראו home.js/gameEngine.js לחישוב בפועל. */
export function shellHtml(session, activeKey, mainHtml, opts = {}) {
  const isAdmin = session.role === 'admin';
  const roleLabel = isAdmin ? 'מורה' : 'תלמיד/ה';
  const navItems = NAV_BY_ROLE[isAdmin ? 'admin' : 'student'];
  const navButtons = navItems.map(n => `
    <button class="nav-item${n.key === activeKey ? ' active' : ''}" data-nav="${n.key}" title="${n.label}">
      <span class="nav-icon">${n.icon}</span><span class="nav-label">${n.label}</span>
    </button>`).join('');

  const statsHtml = (!isAdmin && opts.stats) ? `
    <div class="rail-stats">
      <div class="rail-stat-card">
        <div class="rail-stat-label">רצף</div>
        <div class="rail-stat-value">${opts.stats.streak}<span> ימים</span></div>
      </div>
      <div class="rail-stat-card">
        <div class="rail-stat-label">נקודות</div>
        <div class="rail-stat-value" style="color:var(--px-brand-bright);">${opts.stats.points}</div>
      </div>
    </div>` : '';

  return `
  <div class="app-shell">
    <nav class="app-rail">
      <div class="rail-top">
        <div>
          <div class="rail-brand-name">${CONFIG.APP_NAME}</div>
          <div class="rail-brand-role">${roleLabel} · ${escapeHtml(session.displayName || session.username)}</div>
        </div>
      </div>
      <div class="rail-nav">
        ${navButtons}
        <button class="nav-item nav-report" data-report title="דיווח על תקלה">
          <span class="nav-icon">⚑</span><span class="nav-label">דיווח על תקלה</span>
        </button>
      </div>
      <div class="rail-foot">
        ${statsHtml}
        <button class="rail-logout" id="logout-btn">התנתקות</button>
      </div>
    </nav>
    <main class="app-main">${mainHtml}</main>
  </div>`;
}

/** מחברת אירועים למעטפת: התנתקות + ניווט לשורש (נושאי הלימוד/לוח בקרה) +
 * כפתור דיווח תקלה. reportCtx = {session, screen} - screen הוא תיאור
 * קריא של המסך הנוכחי (למשל "מסך תרגול · זרם חשמלי · שלב 3"), נשמר עם
 * הדיווח כדי שהמורה ידע מאיפה הגיע. */
export function wireShell(onLogout, onNavHome, reportCtx) {
  wireLogout(onLogout);
  document.querySelectorAll('.nav-item[data-nav]').forEach(btn => {
    btn.addEventListener('click', onNavHome);
  });
  const reportBtn = document.querySelector('.nav-item[data-report]');
  if (reportBtn) reportBtn.addEventListener('click', () => openReportModal(reportCtx));
}

function openReportModal(reportCtx) {
  if (!reportCtx) return;
  const { session, screen } = reportCtx;
  const holder = document.createElement('div');
  holder.innerHTML = `
    <div class="modal-overlay" id="report-overlay">
      <div class="modal-card">
        <h3>דיווח על תקלה</h3>
        <p class="form-note" style="margin-top:0;">מדווח/ת מתוך: <b>${escapeHtml(screen)}</b></p>
        <div class="field">
          <label>מה קרה?</label>
          <textarea id="report-text" rows="4" placeholder="תארו בקצרה את התקלה או ההצעה..."></textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button type="button" class="secondary" id="report-cancel">ביטול</button>
          <button type="button" id="report-submit">שליחת דיווח</button>
        </div>
      </div>
    </div>`;
  const overlay = holder.firstElementChild;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('report-cancel').addEventListener('click', close);
  const textEl = document.getElementById('report-text');
  textEl.focus();
  document.getElementById('report-submit').addEventListener('click', async () => {
    const text = textEl.value.trim();
    if (!text) { toast('נא לכתוב תיאור קצר', true); return; }
    const btn = document.getElementById('report-submit');
    btn.disabled = true;
    try {
      await submitReport({
        studentId: session.studentId,
        studentName: session.displayName || session.username,
        grade: session.grade,
        screen,
        text,
      });
      toast('הדיווח נשלח, תודה!');
      close();
    } catch (err) {
      toast('שגיאה בשליחת הדיווח: ' + err.message, true);
      btn.disabled = false;
    }
  });
}

export function wireLogout(onLogout) {
  const btn = document.getElementById('logout-btn');
  if (btn) btn.addEventListener('click', onLogout);
}

export function fmtTime(sec) {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')} דק'` : `${s} שנ'`;
}
