// ==========================================================================
// gameEngine.js - מפת השלבים בתוך נושא לימוד יחיד, מסך המשחק, בדיקת תשובות.
// גנרי לחלוטין ביחס לנושא: מקבל אובייקט topic (ראו curriculum.js) שמספק
// generateLevel/render/evaluateAnswer משלו - gameEngine לא מכיר פיזיקה
// ספציפית (לא מעגלים, לא מטענים) כלל.
// ==========================================================================
import { playSuccess, playError, playBurn, playClick } from './audio.js';
import { saveLevelResult, fetchMyProgress } from '../api.js';
import { CONFIG } from '../config.js';
import { topbarHtml, wireLogout, toast, fmtTime } from '../ui.js';

export async function mountTopic(app, session, topic, onBack, onLogout, opts = {}) {
  const preview = !!opts.preview;
  const state = { progress: { highestLevel: 0, levels: {} }, levelId: null, startTs: null, hintsShown: 0 };
  let cleanupLevel = () => {};
  if (!preview) {
    try {
      const all = await fetchMyProgress(session.studentId);
      state.progress = (all && all[topic.id]) || { highestLevel: 0, levels: {} };
    } catch (e) { toast('שגיאה בטעינת התקדמות: ' + e.message, true); }
  }

  const previewBanner = preview
    ? `<div class="glass" style="padding:10px 18px;margin-bottom:14px;border:1px solid var(--amber);color:#8a6d00;font-size:13.5px;">
        🧪 מצב תצוגה מקדימה למורה — כל השלבים פתוחים לניסיון, וההתקדמות/ניסיונות כאן <b>לא נשמרים</b> במעקב הכיתתי.
      </div>`
    : '';

  renderMap();

  function renderMap() {
    const highest = state.progress.highestLevel || 0;
    const nodes = [];
    for (let id = 1; id <= topic.totalLevels; id++) {
      const done = !!(state.progress.levels[id] && state.progress.levels[id].solved);
      const locked = !preview && id > highest + 1;
      const current = !preview && id === highest + 1;
      const cls = ['level-node'];
      if (locked) cls.push('locked');
      if (done) cls.push('done');
      if (current) cls.push('current');
      nodes.push(`<div class="${cls.join(' ')}" data-level="${id}" title="שלב ${id}">
          ${done ? '<span class="check">✅</span>' : ''}
          <span>${id}</span>
          <span class="badge">${locked ? '🔒' : done ? 'הושלם' : 'פתוח'}</span>
        </div>`);
    }

    app.innerHTML = `
      ${topbarHtml(session, topic.title)}
      <div class="map-wrap">
        <button class="secondary" id="back-home" style="margin-bottom:14px;">${preview ? '→ חזרה לפאנל הניהול' : '→ כל הנושאים'}</button>
        ${previewBanner}
        <div class="glass" style="padding:20px 24px;margin-bottom:24px;">
          <h1 class="neon-title" style="font-size:22px;">⚡ ${topic.title}</h1>
          <p style="color:var(--ink-soft);margin:0 0 4px;">${topic.subtitle || ''}</p>
          ${preview ? '' : `<p style="color:var(--ink-soft);margin:0;">השלב הגבוה ביותר שהושלם: <b style="color:var(--accent-strong)">${highest}</b> / ${topic.totalLevels}</p>`}
        </div>
        <div class="tier-block">
          <div class="level-grid">${nodes.join('')}</div>
        </div>
      </div>
      <footer class="foot">${CONFIG.APP_NAME} ⚡ סימולטור למידה אינטראקטיבי</footer>`;

    wireLogout(onLogout);
    document.getElementById('back-home').addEventListener('click', onBack);
    app.querySelectorAll('.level-node:not(.locked)').forEach(n => {
      n.addEventListener('click', () => { playClick(); openLevel(parseInt(n.dataset.level, 10)); });
    });
  }

  function openLevel(id) {
    cleanupLevel();
    state.levelId = id;
    state.startTs = performance.now();
    state.hintsShown = 0;
    renderLevel();
  }

  function renderLevel() {
    const level = topic.generateLevel(state.levelId);
    const q = level.question;
    // הזירה מוצגת "פתוחה" (סטטית) עד שהתלמיד/ה עונים נכון - ראו handleSuccess.
    const { svg } = topic.render(level, false);

    app.innerHTML = `
      ${topbarHtml(session, topic.title)}
      <div class="game-wrap">
        <button class="secondary" id="back-map" style="margin-bottom:14px;">→ חזרה למפה</button>
        ${previewBanner}
        <div class="game-head">
          <div>
            <h2>שלב ${level.id}: ${level.title}</h2>
            <p>${level.description}</p>
          </div>
          <div class="game-stats">
            <div class="stat-chip">שלב<b>${level.id}/${topic.totalLevels}</b></div>
            <div class="stat-chip">פסילות כאן<b id="dq-count">${(state.progress.levels[level.id] && state.progress.levels[level.id].disqualifications) || 0}</b></div>
          </div>
        </div>

        <div class="circuit-stage glass" id="circuit-stage">${svg}</div>

        <div class="qa-panel glass">
          <div class="qa-question">${q.prompt} <span class="ask-target">(יחידות: ${q.unit})</span></div>
          <div class="qa-row">
            <div class="field">
              <label>התשובה שלך</label>
              <input type="number" step="any" id="answer-input" placeholder="הזינו מספר...">
            </div>
            <button id="submit-answer">בדיקה ⚡</button>
            <button class="secondary" id="hint-btn" type="button">💡 רמז</button>
          </div>
          <p class="form-note" style="margin:6px 0 0;">ניתן להשתמש בכתיב מדעי, למשל <code>2.5e-3</code> במקום 0.0025.</p>
          <div class="hint-line" id="hint-line"></div>
          <div class="qa-feedback" id="qa-feedback"></div>
        </div>
      </div>`;

    wireLogout(onLogout);
    document.getElementById('back-map').addEventListener('click', () => { cleanupLevel(); renderMap(); });
    document.getElementById('hint-btn').addEventListener('click', () => showHint(level));
    document.getElementById('submit-answer').addEventListener('click', () => checkAnswer(level));
    const input = document.getElementById('answer-input');
    input.addEventListener('keydown', e => { if (e.key === 'Enter') checkAnswer(level); });
    input.focus();

    // הזדמנות אופציונלית לנושא להריץ אפקט חי בזמן שהשלב פתוח (למשל שעון
    // עוצר) - gameEngine לא יודע/אכפת לו מה זה עושה, רק קורא ל-cleanup בעת יציאה.
    if (topic.onLevelMount) {
      cleanupLevel = topic.onLevelMount(document.getElementById('circuit-stage'), level) || (() => {});
    }
  }

  function showHint(level) {
    const hints = level.question.hints || [];
    const box = document.getElementById('hint-line');
    if (!hints.length) { box.textContent = 'אין רמז נוסף לשלב זה.'; return; }
    state.hintsShown = Math.min(state.hintsShown + 1, hints.length);
    box.innerHTML = hints.slice(0, state.hintsShown).map(h => `💡 ${h}`).join('<br>');
  }

  function checkAnswer(level) {
    cleanupLevel();
    const input = document.getElementById('answer-input');
    const val = parseFloat(input.value);
    const fb = document.getElementById('qa-feedback');
    if (Number.isNaN(val)) { fb.className = 'qa-feedback bad show'; fb.textContent = 'נא להזין מספר תקין.'; return; }

    const stage = document.getElementById('circuit-stage');
    // מנקים סימוני פסילה מניסיון קודם - כל ניסיון חדש מתחיל מ"מצב תקין".
    if (stage && topic.clearDisqualifyMarks) topic.clearDisqualifyMarks(stage);

    const result = topic.evaluateAnswer(level, val);

    if (result.outcome === 'disqualified') { handleDisqualify(level, result); return; }
    if (result.outcome === 'correct') { handleSuccess(level); return; }

    // incorrect (כולל variant קוסמטי אופציונלי, למשל 'weak')
    showIncorrectFeedback(level, result);
  }

  function showIncorrectFeedback(level, result) {
    playError();
    const fb = document.getElementById('qa-feedback');
    fb.className = 'qa-feedback bad show';
    fb.textContent = result.message || '⚡ לא מדויק. בדקו שוב את הנוסחה ונסו שוב.';
    const stage = document.getElementById('circuit-stage');
    if (stage) {
      if (topic.animateIncorrect) topic.animateIncorrect(stage, level, result);
      else {
        stage.classList.add('shake');
        setTimeout(() => stage.classList.remove('shake'), 400);
      }
    }
    recordAttempt(level, { solved: false, timeSeconds: null, disqualified: false });
  }

  async function recordAttempt(level, payload) {
    if (preview) return; // תצוגה מקדימה למורה - לא נשמר במעקב הכיתתי
    try { await saveLevelResult(session.studentId, topic.id, level.id, payload); }
    catch (e) { toast('שגיאה בשמירת נתונים: ' + e.message, true); }
  }

  async function handleDisqualify(level, result) {
    playBurn();
    const stage = document.getElementById('circuit-stage');
    if (topic.triggerDisqualifyAnimation) topic.triggerDisqualifyAnimation(stage, level, result);
    const fb = document.getElementById('qa-feedback');
    fb.className = 'qa-feedback burn show';
    fb.innerHTML = result.message;
    const dqEl = document.getElementById('dq-count');
    dqEl.textContent = (parseInt(dqEl.textContent, 10) || 0) + 1;
    const lv = state.progress.levels[level.id] || { solved: false, timeSeconds: null, disqualifications: 0 };
    lv.disqualifications = (lv.disqualifications || 0) + 1;
    state.progress.levels[level.id] = lv;
    await recordAttempt(level, { solved: false, timeSeconds: null, disqualified: true });
  }

  async function handleSuccess(level) {
    playSuccess();
    const fb = document.getElementById('qa-feedback');
    fb.className = 'qa-feedback ok show';
    const elapsed = Math.round((performance.now() - state.startTs) / 1000);
    fb.innerHTML = topic.successMessage
      ? topic.successMessage(level, elapsed)
      : `✅ מצוין! פתרתם את השלב בהצלחה (זמן פתרון: ${fmtTime(elapsed)}).`;

    // רק עכשיו, לאחר תשובה נכונה, מריצים את האנימציה/מצב ה"אנרגטי" של הזירה.
    const stageEl = document.getElementById('circuit-stage');
    if (stageEl) stageEl.innerHTML = topic.render(level, true).svg;

    const lv = state.progress.levels[level.id] || { disqualifications: 0 };
    lv.solved = true;
    lv.timeSeconds = elapsed;
    state.progress.levels[level.id] = lv;
    state.progress.highestLevel = Math.max(state.progress.highestLevel || 0, level.id);

    await recordAttempt(level, { solved: true, timeSeconds: elapsed, disqualified: false });

    // אם המשתמש/ת כבר ניווטו הלאה (למשל "חזרה למפה") בזמן שהשמירה
    // האסינכרונית לעיל עוד רצה - המסך הזה כבר לא קיים ב-DOM, אין מה להשלים.
    const panel = document.querySelector('.qa-panel');
    if (!panel) return;
    const nextBtn = document.createElement('div');
    nextBtn.style.marginTop = '14px';
    const hasNext = level.id < topic.totalLevels;
    const finishLabel = preview ? 'סיימת את הנושא! חזרה לפאנל הניהול 🏁' : 'סיימת את הנושא! חזרה לכל הנושאים 🏁';
    nextBtn.innerHTML = `<button id="next-level">${hasNext ? 'לשלב הבא →' : finishLabel}</button>`;
    panel.appendChild(nextBtn);
    document.getElementById('submit-answer').disabled = true;
    document.getElementById('answer-input').disabled = true;
    document.getElementById('next-level').addEventListener('click', () => {
      if (hasNext) openLevel(level.id + 1); else onBack();
    });
  }
}
