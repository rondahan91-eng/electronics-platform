// ==========================================================================
// dashboard.js - פאנל הניהול למורה: מעקב כיתתי, חשיפת פרקים לתלמידים,
// עיון ותרגול חופשי בתוכן, ייבוא תלמידים מ-Excel וניהול סיסמאות.
// ==========================================================================
import {
  fetchClassProgress, fetchGrades, fetchTopicLevelStats, fetchReports, toggleReportOpen,
  createNewStudent, updateStudentPassword, changeMyPassword, revealChapter, hideChapter,
} from './api.js';
import { TOPICS, allGrades } from './curriculum.js';
import { SYLLABUS, chapterKey, chapterHasPractice, allChapters } from './syllabus.js';
import { parseStudentsExcel } from './excelImport.js';
import { mountTopic } from './game/gameEngine.js';
import { shellHtml, wireShell, toast, fmtTime, escapeHtml } from './ui.js';

const TABS = [
  { key: 'track', label: 'מעקב כיתתי' },
  { key: 'reports', label: 'דיווחי תקלות' },
  { key: 'curriculum', label: 'תוכנית לימודים' },
  { key: 'preview', label: 'עיון ותרגול' },
  { key: 'import', label: 'ייבוא מ-Excel' },
  { key: 'students', label: 'תלמידים וסיסמאות' },
];

// פרקים בני-תרגול בלבד, כל אחד קשור ל-topicId שממנו נשלף המעקב הכיתתי -
// גם לפרק עם כמה תת-נושאים (זרם חשמלי) יש topicId משותף אחד לכולם.
function practicableChapters() {
  return allChapters()
    .filter(c => chapterHasPractice(c.item))
    .map(c => ({
      key: c.key,
      label: `${c.item.n}. ${c.item.title}`,
      topicId: c.item.subs.find(sb => sb.topicId).topicId,
      item: c.item,
    }));
}

function median(nums) {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function studentStatus(s, topic) {
  if (!s.highestLevel) return { label: 'לא התחיל/ה', cls: 'muted' };
  if (s.disqualifications >= 3) return { label: 'זקוק/ה לעזרה', cls: 'bad' };
  if (topic && s.highestLevel >= topic.totalLevels) return { label: 'סיים/ה', cls: 'ok' };
  if (topic && s.highestLevel / topic.totalLevels >= 0.66) return { label: 'מתקדם/ת', cls: 'ok' };
  return { label: 'בקצב', cls: 'warn' };
}

export async function mountDashboard(app, session, onLogout) {
  const chapters = practicableChapters();
  const state = {
    tab: 'track',
    gradeFilter: 'all',
    chapterKey: chapters[0] ? chapters[0].key : null,
    students: [], grades: [], levelStats: [], reports: [],
    curriculumExpanded: new Set(),
    pvChapterKey: chapters[0] ? chapters[0].key : null, pvSubIdx: 0, pvLevelLocal: 1,
    importPreview: null, importOutcome: null,
  };
  await refresh();

  function currentChapter() { return chapters.find(c => c.key === state.chapterKey) || chapters[0] || null; }
  function currentTopic() { const c = currentChapter(); return c ? TOPICS[c.topicId] : null; }

  async function refresh() {
    const topic = currentTopic();
    try {
      const [students, grades, levelStats, reports] = await Promise.all([
        fetchClassProgress(topic ? topic.id : null),
        fetchGrades(),
        topic ? fetchTopicLevelStats(topic.id) : Promise.resolve([]),
        fetchReports(),
      ]);
      state.students = students;
      state.grades = grades;
      state.levelStats = levelStats;
      state.reports = reports;
    } catch (e) {
      toast('שגיאה בטעינת נתוני כיתה: ' + e.message, true);
      state.students = state.students || [];
      state.grades = state.grades || [];
      state.levelStats = state.levelStats || [];
      state.reports = state.reports || [];
    }
    render();
  }

  // ------------------------------------------------------------ טאב: מעקב כיתתי
  function renderTrackTab() {
    const topic = currentTopic();
    const filtered = state.gradeFilter === 'all' ? state.students : state.students.filter(s => s.grade === state.gradeFilter);

    const now = Date.now();
    const active = filtered.filter(s => s.lastActiveDate && (now - new Date(s.lastActiveDate).getTime()) <= 7 * 86400000).length;
    const levels = filtered.map(s => s.highestLevel).filter(n => n > 0);
    const kpiMedian = median(levels);
    const needHelp = filtered.filter(s => s.disqualifications >= 3).length;
    const times = filtered.map(s => s.avgTimeSeconds).filter(n => n != null);
    const avgTime = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;

    const chapterOptions = chapters.map(c => `<option value="${c.key}" ${c.key === state.chapterKey ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('');

    const rows = filtered.length
      ? filtered.slice().sort((a, b) => b.highestLevel - a.highestLevel).map(s => {
          const st = studentStatus(s, topic);
          const pct = topic && topic.totalLevels ? Math.round((s.highestLevel / topic.totalLevels) * 100) : 0;
          return `
        <tr>
          <td>
            <div class="student-cell-name">${escapeHtml(s.displayName || s.username)}</div>
            <div class="student-cell-user">${escapeHtml(s.username)}</div>
          </td>
          <td><span class="pill ${st.cls}">${st.label}</span></td>
          <td>
            <div class="progress-cell">
              <span class="progress-cell-track"><span class="progress-cell-fill" style="background:var(--px-brand);width:${pct}%;"></span></span>
              <span class="progress-cell-label">${s.highestLevel}${topic ? '/' + topic.totalLevels : ''}</span>
            </div>
          </td>
          <td>${s.attempts ?? 0}</td>
          <td>${s.disqualifications ?? 0}</td>
          <td>${fmtTime(s.avgTimeSeconds)}</td>
        </tr>`;
        }).join('')
      : `<tr><td colspan="6" class="center-msg">${state.students.length ? 'אין תלמידים בשכבה שנבחרה' : 'אין עדיין תלמידים רשומים במערכת'}</td></tr>`;

    const maxDq = state.levelStats.reduce((m, l) => Math.max(m, l.dq), 0);
    const challenging = state.levelStats.filter(l => l.dq > 0).sort((a, b) => b.dq - a.dq).slice(0, 5);
    const challengeHtml = challenging.length
      ? challenging.map(l => `
        <div class="challenge-row">
          <div class="challenge-row-head"><span>שלב ${l.levelId}${topic ? ' מתוך ' + topic.totalLevels : ''}</span><b>${l.dq}</b></div>
          <div class="challenge-bar-track"><div class="challenge-bar-fill" style="width:${maxDq ? Math.round((l.dq / maxDq) * 100) : 0}%;"></div></div>
        </div>`).join('')
      : `<p class="form-note" style="margin-top:0;">אין עדיין מספיק פסילות בנושא הזה כדי לזהות שלבים מאתגרים.</p>`;

    return `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">תלמידים פעילים</div>
          <div class="kpi-value">${active}<span>/${filtered.length}</span></div>
          <div class="kpi-sub">בשבעת הימים האחרונים</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">שלב חציוני</div>
          <div class="kpi-value">${kpiMedian}<span>${topic ? '/' + topic.totalLevels : ''}</span></div>
          <div class="kpi-sub">${topic ? escapeHtml(topic.title) : '—'}</div>
        </div>
        <div class="kpi-card${needHelp ? ' warn' : ''}">
          <div class="kpi-label">זקוקים לעזרה</div>
          <div class="kpi-value">${needHelp}</div>
          <div class="kpi-sub">3+ פסילות (קצר חשמלי)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">זמן ממוצע לשלב</div>
          <div class="kpi-value">${avgTime != null ? fmtTime(avgTime) : '—'}</div>
          <div class="kpi-sub">מתוך שלבים שנפתרו</div>
        </div>
      </div>
      <div class="dash-grid">
        <div class="panel glass">
          <div class="panel-head-row">
            <h3 style="margin:0;">מעקב כיתתי</h3>
            <select id="track-chapter">${chapterOptions}</select>
          </div>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>תלמיד/ה</th><th>מצב</th><th>התקדמות</th><th>ניסיונות</th><th>פסילות</th><th>זמן ממוצע</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
        <div class="panel glass">
          <h3>השלבים המאתגרים ביותר</h3>
          ${challengeHtml}
        </div>
      </div>`;
  }

  // ------------------------------------------------------------ טאב: דיווחי תקלות
  function exportReportsCsv() {
    const headers = ['מזהה', 'תאריך', 'תלמיד/ה', 'שכבה', 'מסך', 'תיאור', 'סטטוס'];
    const rows = state.reports.map(r => [
      r.id, new Date(r.createdAt).toLocaleString('he-IL'), r.studentName, r.grade, r.screen, r.text, r.open ? 'פתוח' : 'טופל',
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'דיווחי-תקלות.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderReportsTab() {
    const total = state.reports.length;
    const openCount = state.reports.filter(r => r.open).length;
    const groups = {};
    state.reports.forEach(r => {
      const key = (r.screen || 'לא ידוע').split('·')[0].trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    const groupsHtml = Object.entries(groups).map(([screen, items]) => `
      <div>
        <div class="report-group-head"><span>${escapeHtml(screen)}</span><span>${items.length}</span></div>
        ${items.map(r => `
          <div class="report-row">
            <span class="report-row-id">${escapeHtml(r.id)}</span>
            <div style="flex:1;min-width:0;">
              <div class="report-row-text">${escapeHtml(r.text)}</div>
              <div class="report-row-meta">${escapeHtml(r.studentName)} · כיתה ${escapeHtml(r.grade)} · ${escapeHtml(new Date(r.createdAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</div>
            </div>
            <button type="button" class="report-toggle-btn${r.open ? ' open' : ''}" data-id="${r.id}">${r.open ? 'פתוח' : 'טופל'}</button>
          </div>`).join('')}
      </div>`).join('');

    return `
      <div class="panel glass" style="max-width:900px;padding:0;">
        <div class="reveal-head">
          <div>
            <div class="reveal-head-title">דיווחי תקלות מהתלמידים</div>
            <div class="reveal-head-meta">${openCount} פתוחים מתוך ${total} · מקובצים לפי המסך שממנו נשלחו</div>
          </div>
          <button type="button" class="secondary" id="export-reports-btn" ${!total ? 'disabled' : ''}>יצוא לקובץ CSV</button>
        </div>
        ${total ? groupsHtml : `<p class="form-note" style="padding:18px;margin:0;">עדיין לא התקבלו דיווחים.</p>`}
      </div>`;
  }

  // ------------------------------------------------------------ טאב: תוכנית לימודים
  function renderCurriculumTab() {
    let totalChapters = 0, totalRevealed = 0;
    const sectionsHtml = SYLLABUS.map(sec => {
      const grade = sec.key.split('-')[0];
      const gradeState = state.grades.find(g => g.grade === grade);
      const revealedSet = new Set(gradeState ? gradeState.revealed : []);
      const keys = sec.items.map(it => chapterKey(sec.key, it.n));
      const shown = keys.filter(k => revealedSet.has(k)).length;
      totalChapters += keys.length;
      totalRevealed += shown;

      const rowsHtml = sec.items.map(it => {
        const key = chapterKey(sec.key, it.n);
        const on = revealedSet.has(key);
        const subs = it.subs || [];
        const practiceLevels = subs.reduce((a, sb) => a + (sb.total || 0), 0);
        const meta = (it.h ? `${it.h} שעות` : 'ניסוי מעבדה') + ` · ${subs.length} תת-נושאים` + (practiceLevels ? ` · ${practiceLevels} שלבי תרגול` : ' · אין עדיין תרגול');
        const expanded = state.curriculumExpanded.has(key);
        const subsHtml = subs.length ? subs.map(sb => `
          <div class="reveal-sub-row">
            <span class="reveal-sub-n">${escapeHtml(sb.n)}</span>
            <span class="reveal-sub-title${sb.topicId ? '' : ' muted'}">${escapeHtml(sb.title)}</span>
            <span class="reveal-sub-meta${sb.topicId ? '' : ' muted'}">${sb.topicId ? `${sb.total} שלבי תרגול` : 'עיוני'}</span>
          </div>`).join('') : `<div class="reveal-sub-row"><span class="reveal-sub-title muted">אין עדיין פירוט תת-נושאים לפרק הזה</span></div>`;
        return `
        <div>
          <div class="reveal-row">
            <span class="reveal-row-n">${String(it.n).padStart(2, '0')}</span>
            <span class="reveal-row-dot" style="background:${it.color || 'var(--px-hairline-strong)'};"></span>
            <div style="flex:1;min-width:0;">
              <div class="reveal-row-title">${escapeHtml(it.title)}</div>
              <div class="reveal-row-meta">${meta}</div>
            </div>
            <button type="button" class="reveal-row-toggle${on ? ' on' : ''}" data-grade="${grade}" data-key="${key}" data-on="${on}">${on ? 'חשוף' : 'מוסתר'}</button>
            <button type="button" class="reveal-row-caret${expanded ? ' open' : ''}" data-expand="${key}" title="תת-נושאים">⌄</button>
          </div>
          ${expanded ? `<div class="reveal-subs">${subsHtml}</div>` : ''}
        </div>`;
      }).join('');

      return `
      <div class="panel glass" style="padding:0;">
        <div class="reveal-head">
          <div>
            <div class="reveal-head-title">${escapeHtml(sec.grade)} · ${escapeHtml(sec.part)}</div>
            <div class="reveal-head-meta">${sec.hours} שעות · ${sec.items.length} פרקים · ${shown} מתוך ${keys.length} חשופים</div>
          </div>
          <div class="reveal-head-actions">
            <button type="button" class="secondary reveal-all-btn" data-grade="${grade}" data-keys="${keys.join(',')}">לחשוף הכל</button>
            <button type="button" class="secondary hide-all-btn" data-grade="${grade}" data-keys="${keys.join(',')}">להסתיר הכל</button>
          </div>
        </div>
        ${rowsHtml}
      </div>`;
    }).join('');

    return `
      <div style="max-width:900px;">
        <div class="panel glass">
          <h3 style="margin-bottom:6px;">חשיפת פרקים לתלמידים</h3>
          <p class="form-note" style="margin-top:0;">החלוקה לפי תוכנית הלימודים "מבוא להנדסת אלקטרוניקה" (סמל 11.001). התלמידים רואים רק פרקים חשופים — ${totalRevealed} מתוך ${totalChapters} כרגע.</p>
        </div>
        ${sectionsHtml}
      </div>`;
  }

  // ------------------------------------------------------------ טאב: עיון ותרגול
  function renderPreviewTab() {
    const chapter = chapters.find(c => c.key === state.pvChapterKey) || chapters[0];
    const subs = chapter ? (chapter.item.subs || []).filter(sb => sb.topicId) : [];
    const sub = subs[state.pvSubIdx] || subs[0];
    const levelOptions = sub ? Array.from({ length: sub.total }, (_, i) => i + 1) : [];

    const chapterOptions = chapters.map(c => `<option value="${c.key}" ${c.key === (chapter && chapter.key) ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('');
    const subOptions = subs.map((sb, i) => `<option value="${i}" ${sb === sub ? 'selected' : ''}>${sb.n} · ${escapeHtml(sb.title)}</option>`).join('');
    const levelOpts = levelOptions.map(n => `<option value="${n}" ${n === state.pvLevelLocal ? 'selected' : ''}>שלב ${n}</option>`).join('');

    return `
      <div class="panel glass" style="max-width:680px;">
        <div class="preview-banner-note">
          <span style="font:700 10px var(--font-mono);letter-spacing:.1em;">תצוגה מקדימה</span>
          <span>ניסיונות כאן לא נשמרים במעקב הכיתתי</span>
        </div>
        <h3 style="margin-bottom:6px;">עיון ותרגול חופשי בתוכן</h3>
        <p class="form-note" style="margin-top:0;">כל השלבים פתוחים, כולל פרקים שעדיין לא נחשפו לכיתה — כדי להכין שיעור או לבדוק שאלה.</p>
        <div class="pv-cascade">
          <div class="field">
            <label>פרק</label>
            <select id="pv-chapter">${chapterOptions}</select>
          </div>
          <div class="field">
            <label>תת-נושא</label>
            <select id="pv-sub" ${!subs.length ? 'disabled' : ''}>${subOptions}</select>
          </div>
          <div class="field">
            <label>שלב</label>
            <select id="pv-level" ${!levelOptions.length ? 'disabled' : ''}>${levelOpts}</select>
          </div>
          <button type="button" id="pv-open-btn" ${!sub ? 'disabled' : ''}>לפתוח שלב</button>
        </div>
        ${!subs.length ? `<p class="form-note">לפרק הזה עדיין אין שלבי תרגול — אפשר לבחור פרק אחר.</p>` : ''}
      </div>`;
  }

  // ------------------------------------------------------------ טאב: ייבוא Excel
  function renderImportPreview() {
    const p = state.importPreview;
    if (!p) return '';
    const validRows = p.valid.map(r => `
      <tr>
        <td>${escapeHtml(r.displayName)}</td>
        <td>${escapeHtml(r.grade)}</td>
        <td style="font-family:var(--font-mono);color:var(--px-brand-deep);">${escapeHtml(r.username)}</td>
        <td style="font-family:var(--font-mono);">${escapeHtml(r.password)}</td>
      </tr>`).join('');
    const invalidRows = p.invalid.map(r => `<li>שורה ${r.row}: ${escapeHtml(r.reason)}</li>`).join('');
    return `
      <div style="margin-top:14px;">
        <p class="form-note" style="margin-top:0;">נמצאו <b style="color:var(--px-brand-deep);">${p.valid.length}</b> שורות תקינות
          ${p.invalid.length ? `ו-<b style="color:var(--px-coral-ink);">${p.invalid.length}</b> שורות פסולות` : ''}.</p>
        ${p.valid.length ? `
          <div class="table-scroll" style="max-height:220px;">
            <table class="data-table">
              <thead><tr><th>שם מלא</th><th>כיתה</th><th>שם משתמש</th><th>סיסמה</th></tr></thead>
              <tbody>${validRows}</tbody>
            </table>
          </div>
          <button type="button" id="import-students-btn" style="width:100%;margin-top:10px;">ייבוא ${p.valid.length} תלמידים תקינים</button>
        ` : ''}
        ${p.invalid.length ? `<ul class="form-note" style="color:var(--px-coral-ink);margin-top:10px;">${invalidRows}</ul>` : ''}
      </div>`;
  }

  function renderImportOutcome() {
    const o = state.importOutcome;
    if (!o) return '';
    const createdRows = o.created.map(r => `
      <tr>
        <td>${escapeHtml(r.displayName)}</td>
        <td style="font-family:var(--font-mono);color:var(--px-brand-deep);">${escapeHtml(r.username)}</td>
        <td style="font-family:var(--font-mono);">${escapeHtml(r.password)}</td>
      </tr>`).join('');
    const failedRows = o.failed.map(r => `<li>${escapeHtml(r.displayName)}: ${escapeHtml(r.reason)}</li>`).join('');
    return `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--px-hairline);">
        <p class="form-note" style="margin-top:0;">✅ נוצרו ${o.created.length} תלמידים. שמרו/הדפיסו את הטבלה הזו לחלוקת פרטי ההתחברות:</p>
        <div class="table-scroll" style="max-height:220px;">
          <table class="data-table">
            <thead><tr><th>שם מלא</th><th>שם משתמש</th><th>סיסמה</th></tr></thead>
            <tbody>${createdRows}</tbody>
          </table>
        </div>
        ${o.failed.length ? `<p class="form-note" style="color:var(--px-coral-ink);margin-top:10px;">נכשלו ${o.failed.length}:</p><ul class="form-note" style="color:var(--px-coral-ink);">${failedRows}</ul>` : ''}
      </div>`;
  }

  function renderImportTab() {
    return `
      <div class="panel glass" style="max-width:640px;">
        <h3>ייבוא תלמידים מקובץ Excel</h3>
        <p class="form-note" style="margin-top:0;">עמודות נדרשות: שם פרטי, שם משפחה, ת.ז, תאריך לידה (DD/MM/YYYY), כיתה.
          שם משתמש ייגזר משם פרטי + 3 ספרות אחרונות של ת.ז, וסיסמה ראשונית מתאריך הלידה (DDMMYY).</p>
        <div class="field"><input type="file" id="excel-file-input" accept=".xlsx,.xls"></div>
        <button type="button" id="parse-excel-btn" class="secondary" style="width:100%;">נתח קובץ</button>
        ${renderImportPreview()}
        ${renderImportOutcome()}
      </div>`;
  }

  // ------------------------------------------------------------ טאב: תלמידים וסיסמאות
  function renderStudentsTab() {
    const studentOptions = state.students
      .map(s => `<option value="${s.studentId}">${escapeHtml(s.displayName || s.username)} (${escapeHtml(s.username)})</option>`)
      .join('');
    const gradeOptions = allGrades().map(g => `<option value="${g}">${escapeHtml(g)}</option>`).join('');

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;align-items:start;">
        <div class="panel glass">
          <h3>הוספת תלמיד/ה</h3>
          <form id="add-student-form">
            <div class="field"><label>שם מלא (אופציונלי)</label><input type="text" id="new-display-name"></div>
            <div class="field"><label>שם משתמש</label><input type="text" id="new-username" required></div>
            <div class="field"><label>סיסמה ראשונית</label><input type="text" id="new-password" required minlength="4"></div>
            <div class="field"><label>שכבה</label>
              <select id="new-grade" required>
                <option value="">— בחרו שכבה —</option>
                ${gradeOptions}
              </select>
            </div>
            <button type="submit" style="width:100%;">הוספת תלמיד/ה</button>
          </form>
        </div>
        <div class="panel glass">
          <h3>שינוי סיסמה לתלמיד קיים</h3>
          <form id="change-pass-form">
            <div class="field"><label>בחירת תלמיד/ה</label>
              <select id="pw-student" required>
                <option value="">— בחרו תלמיד/ה —</option>
                ${studentOptions}
              </select>
            </div>
            <div class="field"><label>סיסמה חדשה</label><input type="text" id="new-pw-value" required minlength="4"></div>
            <button type="submit" class="secondary" style="width:100%;">עדכון סיסמה</button>
          </form>
          <p class="form-note">הסיסמאות נשמרות כגיבוב (hash) בלבד ולא כטקסט גלוי.</p>
        </div>
        <div class="panel glass">
          <h3>שינוי הסיסמה שלי</h3>
          <form id="change-my-pass-form">
            <div class="field"><label>סיסמה נוכחית</label><input type="password" id="my-current-pw" required></div>
            <div class="field"><label>סיסמה חדשה</label><input type="password" id="my-new-pw" required minlength="4"></div>
            <div class="field"><label>אימות סיסמה חדשה</label><input type="password" id="my-new-pw-confirm" required minlength="4"></div>
            <button type="submit" class="secondary" style="width:100%;">עדכון הסיסמה שלי</button>
          </form>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------ רינדור ראשי
  function render() {
    const gradeFilterOptions = `<option value="all" ${state.gradeFilter === 'all' ? 'selected' : ''}>כל השכבות</option>` +
      allGrades().map(g => `<option value="${g}" ${g === state.gradeFilter ? 'selected' : ''}>כיתה ${escapeHtml(g)}</option>`).join('');

    const tabsHtml = TABS.map(t => `<button type="button" class="dash-tab${t.key === state.tab ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('');

    let bodyHtml = '';
    if (state.tab === 'track') bodyHtml = renderTrackTab();
    else if (state.tab === 'reports') bodyHtml = renderReportsTab();
    else if (state.tab === 'curriculum') bodyHtml = renderCurriculumTab();
    else if (state.tab === 'preview') bodyHtml = renderPreviewTab();
    else if (state.tab === 'import') bodyHtml = renderImportTab();
    else if (state.tab === 'students') bodyHtml = renderStudentsTab();

    app.innerHTML = shellHtml(session, 'teacher', `
      <div class="dash-wrap">
        <div class="dash-head">
          <div>
            <div class="eyebrow">לוח בקרה</div>
            <h1>מעקב והוראה</h1>
          </div>
          <div class="field dash-grade-field">
            <label>שכבה</label>
            <select id="grade-filter">${gradeFilterOptions}</select>
          </div>
        </div>
        <div class="dash-tabs">${tabsHtml}</div>
        ${bodyHtml}
      </div>`);

    wireShell(onLogout, () => refresh(), { session, screen: 'לוח בקרה למורה' });

    document.getElementById('grade-filter').addEventListener('change', (e) => {
      state.gradeFilter = e.target.value;
      render();
    });

    app.querySelectorAll('.dash-tab').forEach(btn => {
      btn.addEventListener('click', () => { state.tab = btn.dataset.tab; render(); });
    });

    if (state.tab === 'track') wireTrackTab();
    else if (state.tab === 'reports') wireReportsTab();
    else if (state.tab === 'curriculum') wireCurriculumTab();
    else if (state.tab === 'preview') wirePreviewTab();
    else if (state.tab === 'import') wireImportTab();
    else if (state.tab === 'students') wireStudentsTab();
  }

  function wireTrackTab() {
    document.getElementById('track-chapter').addEventListener('change', (e) => {
      state.chapterKey = e.target.value;
      refresh();
    });
  }

  function wireReportsTab() {
    app.querySelectorAll('.report-toggle-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await toggleReportOpen(btn.dataset.id);
          await refresh();
        } catch (err) {
          toast('שגיאה: ' + err.message, true);
          btn.disabled = false;
        }
      });
    });
    const exportBtn = document.getElementById('export-reports-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportReportsCsv);
  }

  function wireCurriculumTab() {
    app.querySelectorAll('.reveal-row-caret').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.expand;
        if (state.curriculumExpanded.has(key)) state.curriculumExpanded.delete(key);
        else state.curriculumExpanded.add(key);
        render();
      });
    });
    app.querySelectorAll('.reveal-row-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const { grade, key, on } = btn.dataset;
        try {
          if (on === 'true') await hideChapter(grade, key);
          else await revealChapter(grade, key);
          await refresh();
        } catch (err) {
          toast('שגיאה: ' + err.message, true);
          btn.disabled = false;
        }
      });
    });
    app.querySelectorAll('.reveal-all-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const keys = btn.dataset.keys.split(',');
          await Promise.all(keys.map(k => revealChapter(btn.dataset.grade, k)));
          await refresh();
        } catch (err) {
          toast('שגיאה: ' + err.message, true);
          btn.disabled = false;
        }
      });
    });
    app.querySelectorAll('.hide-all-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const keys = btn.dataset.keys.split(',');
          await Promise.all(keys.map(k => hideChapter(btn.dataset.grade, k)));
          await refresh();
        } catch (err) {
          toast('שגיאה: ' + err.message, true);
          btn.disabled = false;
        }
      });
    });
  }

  function wirePreviewTab() {
    document.getElementById('pv-chapter').addEventListener('change', (e) => {
      state.pvChapterKey = e.target.value;
      state.pvSubIdx = 0;
      state.pvLevelLocal = 1;
      render();
    });
    document.getElementById('pv-sub').addEventListener('change', (e) => {
      state.pvSubIdx = parseInt(e.target.value, 10);
      state.pvLevelLocal = 1;
      render();
    });
    const levelSel = document.getElementById('pv-level');
    if (levelSel) levelSel.addEventListener('change', (e) => { state.pvLevelLocal = parseInt(e.target.value, 10); });
    const openBtn = document.getElementById('pv-open-btn');
    if (openBtn) openBtn.addEventListener('click', () => {
      const chapter = chapters.find(c => c.key === state.pvChapterKey) || chapters[0];
      const topic = TOPICS[chapter.topicId];
      const subs = (chapter.item.subs || []).filter(sb => sb.topicId);
      const sub = subs[state.pvSubIdx] || subs[0];
      if (!topic || !sub) return;
      const subtopic = {
        levelStart: sub.levelStart, levelEnd: sub.levelEnd,
        chapterN: chapter.item.n, chapterTitle: chapter.item.title, n: sub.n, title: sub.title, color: chapter.item.color,
      };
      mountTopic(app, session, topic, () => refresh(), onLogout, { preview: true, subtopic, previewLevel: state.pvLevelLocal });
    });
  }

  function wireImportTab() {
    document.getElementById('parse-excel-btn').addEventListener('click', async () => {
      const input = document.getElementById('excel-file-input');
      const file = input.files && input.files[0];
      if (!file) { toast('נא לבחור קובץ Excel קודם', true); return; }
      try {
        const existingUsernames = state.students.map(s => s.username);
        state.importPreview = await parseStudentsExcel(file, existingUsernames);
        state.importOutcome = null;
        render();
      } catch (err) {
        toast('שגיאה בקריאת הקובץ: ' + err.message, true);
      }
    });

    const importBtn = document.getElementById('import-students-btn');
    if (importBtn) {
      importBtn.addEventListener('click', async () => {
        importBtn.disabled = true;
        const rows = state.importPreview.valid;
        const created = [];
        const failed = [];
        for (const r of rows) {
          try {
            await createNewStudent(r.username, r.password, r.displayName, r.grade);
            created.push(r);
          } catch (err) {
            failed.push({ displayName: r.displayName, reason: err.message });
          }
        }
        state.importOutcome = { created, failed };
        state.importPreview = null;
        toast(`יובאו ${created.length} תלמידים בהצלחה${failed.length ? `, ${failed.length} נכשלו` : ''}`);
        await refresh();
      });
    }
  }

  function wireStudentsTab() {
    document.getElementById('add-student-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('new-username').value.trim();
      const password = document.getElementById('new-password').value;
      const displayName = document.getElementById('new-display-name').value.trim();
      const grade = document.getElementById('new-grade').value;
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        await createNewStudent(username, password, displayName, grade);
        toast(`התלמיד/ה "${username}" נוסף/ה בהצלחה`);
        await refresh();
      } catch (err) {
        toast('שגיאה: ' + err.message, true);
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('change-pass-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const studentId = document.getElementById('pw-student').value;
      const newPassword = document.getElementById('new-pw-value').value;
      if (!studentId) { toast('נא לבחור תלמיד/ה', true); return; }
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        await updateStudentPassword(studentId, newPassword);
        toast('הסיסמה עודכנה בהצלחה');
        e.target.reset();
      } catch (err) {
        toast('שגיאה: ' + err.message, true);
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('change-my-pass-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const current = document.getElementById('my-current-pw').value;
      const next = document.getElementById('my-new-pw').value;
      const confirmValue = document.getElementById('my-new-pw-confirm').value;
      if (next !== confirmValue) { toast('הסיסמאות החדשות אינן תואמות', true); return; }
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        await changeMyPassword(session.studentId, current, next);
        toast('הסיסמה שלך עודכנה בהצלחה');
        e.target.reset();
      } catch (err) {
        toast('שגיאה: ' + err.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  }
}
