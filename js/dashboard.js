// ==========================================================================
// dashboard.js - פאנל הניהול למורה: מעקב לפי נושא, ניהול משתמשים,
// וניהול קצב פתיחת תוכנית הלימודים לכל שכבה.
// ==========================================================================
import { fetchClassProgress, createNewStudent, updateStudentPassword, fetchGrades, advanceGradeTopic } from './api.js';
import { TOPICS, allGrades, curriculumForGrade } from './curriculum.js';
import { parseStudentsExcel } from './excelImport.js';
import { topbarHtml, wireLogout, toast, fmtTime, escapeHtml } from './ui.js';

export async function mountDashboard(app, session, onLogout) {
  const topicList = Object.values(TOPICS);
  const state = { students: [], grades: [], topicId: topicList[0]?.id || null, gradeFilter: 'all', importPreview: null, importOutcome: null };
  await refresh();

  async function refresh() {
    try {
      const [students, grades] = await Promise.all([
        fetchClassProgress(state.topicId),
        fetchGrades(),
      ]);
      state.students = students;
      state.grades = grades;
    } catch (e) {
      toast('שגיאה בטעינת נתוני כיתה: ' + e.message, true);
      state.students = state.students || [];
      state.grades = state.grades || [];
    }
    render();
  }

  function dqPill(n) {
    if (n === 0) return `<span class="pill ok">0</span>`;
    if (n <= 3) return `<span class="pill warn">${n}</span>`;
    return `<span class="pill bad">${n}</span>`;
  }

  function currentTopic() {
    return TOPICS[state.topicId] || topicList[0];
  }

  function renderImportPreview() {
    const p = state.importPreview;
    if (!p) return '';
    const validRows = p.valid.map(r => `
      <tr>
        <td>${escapeHtml(r.displayName)}</td>
        <td>${escapeHtml(r.grade)}</td>
        <td style="font-family:var(--font-mono);color:var(--cyan);">${escapeHtml(r.username)}</td>
        <td style="font-family:var(--font-mono);">${escapeHtml(r.password)}</td>
      </tr>`).join('');
    const invalidRows = p.invalid.map(r => `<li>שורה ${r.row}: ${escapeHtml(r.reason)}</li>`).join('');
    return `
      <div style="margin-top:14px;">
        <p class="form-note" style="margin-top:0;">נמצאו <b style="color:var(--green);">${p.valid.length}</b> שורות תקינות
          ${p.invalid.length ? `ו-<b style="color:var(--red);">${p.invalid.length}</b> שורות פסולות` : ''}.</p>
        ${p.valid.length ? `
          <div class="table-scroll" style="max-height:220px;">
            <table class="data-table">
              <thead><tr><th>שם מלא</th><th>כיתה</th><th>שם משתמש</th><th>סיסמה</th></tr></thead>
              <tbody>${validRows}</tbody>
            </table>
          </div>
          <button type="button" id="import-students-btn" style="width:100%;margin-top:10px;">ייבוא ${p.valid.length} תלמידים תקינים</button>
        ` : ''}
        ${p.invalid.length ? `<ul class="form-note" style="color:var(--red);margin-top:10px;">${invalidRows}</ul>` : ''}
      </div>`;
  }

  function renderImportOutcome() {
    const o = state.importOutcome;
    if (!o) return '';
    const createdRows = o.created.map(r => `
      <tr>
        <td>${escapeHtml(r.displayName)}</td>
        <td style="font-family:var(--font-mono);color:var(--cyan);">${escapeHtml(r.username)}</td>
        <td style="font-family:var(--font-mono);">${escapeHtml(r.password)}</td>
      </tr>`).join('');
    const failedRows = o.failed.map(r => `<li>${escapeHtml(r.displayName)}: ${escapeHtml(r.reason)}</li>`).join('');
    return `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line);">
        <p class="form-note" style="margin-top:0;">✅ נוצרו ${o.created.length} תלמידים. שמרו/הדפיסו את הטבלה הזו לחלוקת פרטי ההתחברות:</p>
        <div class="table-scroll" style="max-height:220px;">
          <table class="data-table">
            <thead><tr><th>שם מלא</th><th>שם משתמש</th><th>סיסמה</th></tr></thead>
            <tbody>${createdRows}</tbody>
          </table>
        </div>
        ${o.failed.length ? `<p class="form-note" style="color:var(--red);margin-top:10px;">נכשלו ${o.failed.length}:</p><ul class="form-note" style="color:var(--red);">${failedRows}</ul>` : ''}
      </div>`;
  }

  function render() {
    const topic = currentTopic();
    const filteredStudents = state.gradeFilter === 'all'
      ? state.students
      : state.students.filter(s => s.grade === state.gradeFilter);
    const rows = filteredStudents.length
      ? filteredStudents
          .slice()
          .sort((a, b) => b.highestLevel - a.highestLevel)
          .map(s => `
        <tr>
          <td>${escapeHtml(s.displayName || s.username)}</td>
          <td style="color:var(--text-1);font-family:var(--font-mono);">${escapeHtml(s.username)}</td>
          <td>${escapeHtml(s.grade || '—')}</td>
          <td><b style="color:var(--cyan);">${s.highestLevel}</b> / ${topic ? topic.totalLevels : '—'}</td>
          <td>${fmtTime(s.avgTimeSeconds)}</td>
          <td>${dqPill(s.disqualifications)}</td>
        </tr>`).join('')
      : `<tr><td colspan="6" class="center-msg">${state.students.length ? 'אין תלמידים בשכבה שנבחרה' : 'אין עדיין תלמידים רשומים במערכת'}</td></tr>`;

    const studentOptions = state.students
      .map(s => `<option value="${s.studentId}">${escapeHtml(s.displayName || s.username)} (${escapeHtml(s.username)})</option>`)
      .join('');

    const topicOptions = topicList
      .map(t => `<option value="${t.id}" ${t.id === state.topicId ? 'selected' : ''}>${escapeHtml(t.title)}</option>`)
      .join('');

    const gradeOptions = allGrades().map(g => `<option value="${g}">${escapeHtml(g)}</option>`).join('');
    const gradeFilterOptions = `<option value="all" ${state.gradeFilter === 'all' ? 'selected' : ''}>כל השכבות</option>` +
      allGrades().map(g => `<option value="${g}" ${g === state.gradeFilter ? 'selected' : ''}>כיתה ${escapeHtml(g)}</option>`).join('');

    const curriculaHtml = allGrades().map(grade => {
      const gradeState = state.grades.find(g => g.grade === grade) || { unlockedCount: 1 };
      const topics = curriculumForGrade(grade);
      const chips = topics.map((t, i) => {
        const unlocked = i < gradeState.unlockedCount;
        return `<span class="pill ${unlocked ? 'ok' : 'warn'}" style="margin-left:6px;">${unlocked ? '🔓' : '🔒'} ${escapeHtml(t.title)}</span>`;
      }).join('');
      const isFull = gradeState.unlockedCount >= topics.length;
      return `
        <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--line);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
            <b>כיתה ${escapeHtml(grade)}</b>
            <button type="button" class="secondary advance-grade-btn" data-grade="${grade}" ${isFull ? 'disabled' : ''} style="padding:6px 12px;font-size:12.5px;">
              ${isFull ? '✅ כל הנושאים פתוחים' : 'פתח את הנושא הבא ▶'}
            </button>
          </div>
          <div>${chips}</div>
        </div>`;
    }).join('') || `<p class="form-note">לא הוגדרו שכבות בתוכנית הלימודים.</p>`;

    app.innerHTML = `
      ${topbarHtml(session, 'פאנל ניהול למורה')}
      <div class="dash-wrap">
        <div class="glass" style="padding:18px 22px;margin-bottom:20px;">
          <h1 class="neon-title" style="font-size:22px;">🎓 לוח בקרה</h1>
          <p style="color:var(--text-1);margin:0;">מעקב אחרי התקדמות ${state.students.length} תלמידים, ניהול משתמשים וניהול תוכנית הלימודים.</p>
        </div>
        <div class="dash-grid">
          <div>
            <div class="panel glass">
              <h3>📊 מעקב כיתתי</h3>
              <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
                <div class="field" style="max-width:280px;margin-bottom:0;flex:1;">
                  <label>שכבה מוצגת בטבלה</label>
                  <select id="grade-filter">${gradeFilterOptions}</select>
                </div>
                <div class="field" style="max-width:280px;margin-bottom:0;flex:1;">
                  <label>נושא מוצג בטבלה</label>
                  <select id="topic-filter">${topicOptions}</select>
                </div>
              </div>
              <div class="table-scroll" id="table-scroll">
                <table class="data-table">
                  <thead><tr>
                    <th>שם תלמיד/ה</th><th>שם משתמש</th><th>שכבה</th><th>שלב מקסימלי</th>
                    <th>ממוצע זמן פתרון</th><th>פסילות (הספק יתר)</th>
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>

            <div class="panel glass">
              <h3>🗂️ ניהול תוכניות לימוד</h3>
              ${curriculaHtml}
              <p class="form-note">פתיחת נושא חלה על כל תלמידי השכבה יחד, בהתאם לקצב ההוראה בפועל בכיתה.</p>
            </div>
          </div>

          <div>
            <div class="panel glass">
              <h3>📥 ייבוא תלמידים מקובץ Excel</h3>
              <p class="form-note" style="margin-top:0;">עמודות נדרשות: שם פרטי, שם משפחה, ת.ז, תאריך לידה (DD/MM/YYYY), כיתה.
                שם משתמש ייגזר משם פרטי + 3 ספרות אחרונות של ת.ז, וסיסמה ראשונית מתאריך הלידה (DDMMYY).</p>
              <div class="field"><input type="file" id="excel-file-input" accept=".xlsx,.xls"></div>
              <button type="button" id="parse-excel-btn" class="secondary" style="width:100%;">נתח קובץ</button>
              ${renderImportPreview()}
              ${renderImportOutcome()}
            </div>

            <div class="panel glass">
              <h3>➕ הוספת תלמיד חדש</h3>
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
              <h3>🔑 שינוי סיסמה לתלמיד קיים</h3>
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
          </div>
        </div>
      </div>`;

    wireLogout(onLogout);

    document.getElementById('topic-filter').addEventListener('change', (e) => {
      state.topicId = e.target.value;
      refresh();
    });

    document.getElementById('grade-filter').addEventListener('change', (e) => {
      state.gradeFilter = e.target.value;
      render();
    });

    app.querySelectorAll('.advance-grade-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await advanceGradeTopic(btn.dataset.grade);
          toast(`נפתח הנושא הבא לכיתה ${btn.dataset.grade}`);
          await refresh();
        } catch (err) {
          toast('שגיאה: ' + err.message, true);
          btn.disabled = false;
        }
      });
    });

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
  }
}
