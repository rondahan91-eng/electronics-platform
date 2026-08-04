// ==========================================================================
// gameEngine.js - מפת השלבים בתוך נושא לימוד יחיד, מסך המשחק, בדיקת תשובות
// ומנגנון השריפה. גנרי לחלוטין ביחס לנושא - מקבל אובייקט topic (ראו curriculum.js).
// ==========================================================================
import { triggerBurnAnimation, clearBurnMarks } from './circuitRenderer.js';
import { findNode } from './circuitEngine.js';
import { playSuccess, playError, playBurn, playClick } from './audio.js';
import { saveLevelResult, fetchMyProgress } from '../api.js';
import { CONFIG } from '../config.js';
import { topbarHtml, wireLogout, toast, fmtTime } from '../ui.js';

export async function mountTopic(app, session, topic, onBack, onLogout) {
  const state = { progress: { highestLevel: 0, levels: {} }, levelId: null, startTs: null, hintsShown: 0 };
  try {
    const all = await fetchMyProgress(session.studentId);
    state.progress = (all && all[topic.id]) || { highestLevel: 0, levels: {} };
  } catch (e) { toast('שגיאה בטעינת התקדמות: ' + e.message, true); }

  renderMap();

  function renderMap() {
    const highest = state.progress.highestLevel || 0;
    const nodes = [];
    for (let id = 1; id <= topic.totalLevels; id++) {
      const done = !!(state.progress.levels[id] && state.progress.levels[id].solved);
      const locked = id > highest + 1;
      const current = id === highest + 1;
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
        <button class="secondary" id="back-home" style="margin-bottom:14px;">→ כל הנושאים</button>
        <div class="glass" style="padding:20px 24px;margin-bottom:24px;">
          <h1 class="neon-title" style="font-size:22px;">⚡ ${topic.title}</h1>
          <p style="color:var(--text-1);margin:0 0 4px;">${topic.subtitle || ''}</p>
          <p style="color:var(--text-1);margin:0;">השלב הגבוה ביותר שהושלם: <b style="color:var(--cyan)">${highest}</b> / ${topic.totalLevels}</p>
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
    state.levelId = id;
    state.startTs = performance.now();
    state.hintsShown = 0;
    renderLevel();
  }

  function renderLevel() {
    const level = topic.generateLevel(state.levelId);
    const q = level.question;
    // המעגל מוצג "פתוח" (סטטי, ללא זרימה) עד שהתלמיד/ה עונים נכון - ראו handleSuccess.
    const { svg } = topic.renderCircuit(level, false);

    app.innerHTML = `
      ${topbarHtml(session, topic.title)}
      <div class="game-wrap">
        <button class="secondary" id="back-map" style="margin-bottom:14px;">→ חזרה למפה</button>
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
          <div class="hint-line" id="hint-line"></div>
          <div class="qa-feedback" id="qa-feedback"></div>
        </div>
      </div>`;

    wireLogout(onLogout);
    document.getElementById('back-map').addEventListener('click', () => renderMap());
    document.getElementById('hint-btn').addEventListener('click', () => showHint(level));
    document.getElementById('submit-answer').addEventListener('click', () => checkAnswer(level));
    const input = document.getElementById('answer-input');
    input.addEventListener('keydown', e => { if (e.key === 'Enter') checkAnswer(level); });
    input.focus();
  }

  function showHint(level) {
    const hints = level.question.hints || [];
    const box = document.getElementById('hint-line');
    if (!hints.length) { box.textContent = 'אין רמז נוסף לשלב זה.'; return; }
    state.hintsShown = Math.min(state.hintsShown + 1, hints.length);
    box.innerHTML = hints.slice(0, state.hintsShown).map(h => `💡 ${h}`).join('<br>');
  }

  function checkAnswer(level) {
    const input = document.getElementById('answer-input');
    const val = parseFloat(input.value);
    const fb = document.getElementById('qa-feedback');
    if (Number.isNaN(val)) { fb.className = 'qa-feedback bad show'; fb.textContent = 'נא להזין מספר תקין.'; return; }

    // מנקים סימון "נשרף" מניסיון קודם - כל ניסיון חדש מתחיל עם מעגל "תקין" מחדש.
    const stageForClear = document.getElementById('circuit-stage');
    if (stageForClear) clearBurnMarks(stageForClear);

    const q = level.question;
    const target = q.targetId && level.circuitKind === 'tree' ? findNode(level.root, q.targetId) : null;

    // בדיקת עומס-יתר (הספק) - רלוונטית לשאלות זרם/מתח/הספק על נגד
    if (target && target.kind === 'r' && ['current', 'voltage', 'power'].includes(q.ask)) {
      let hypPower;
      if (q.ask === 'power') hypPower = val;
      else if (q.ask === 'current') hypPower = val * val * target.value;
      else hypPower = (val * val) / target.value;
      if (hypPower > target.maxPower) {
        handleBurn(level, target, hypPower);
        return;
      }
    }

    const tolerance = Math.max(Math.abs(q.answer) * CONFIG.ANSWER_TOLERANCE_PCT, 0.005);
    const correct = Math.abs(val - q.answer) <= tolerance;

    if (correct) handleSuccess(level);
    else {
      playError();
      fb.className = 'qa-feedback bad show';
      fb.textContent = '⚡ לא מדויק. בדקו שוב את הנוסחה ונסו שוב.';
      document.getElementById('circuit-stage').classList.add('shake');
      setTimeout(() => document.getElementById('circuit-stage').classList.remove('shake'), 400);
    }
  }

  async function handleBurn(level, target, hypPower) {
    playBurn();
    const stage = document.getElementById('circuit-stage');
    triggerBurnAnimation(stage, target.id);
    const fb = document.getElementById('qa-feedback');
    const pRounded = Math.round(hypPower * 100) / 100;
    fb.className = 'qa-feedback burn show';
    fb.innerHTML = `🔥 <b>${target.label} נשרף!</b> התשובה שהזנתם הייתה גורמת להספק של כ-${pRounded} W על רכיב שסובל עד ${target.maxPower} W בלבד. פוסלים את הניסיון - נסו שוב.`;
    const dqEl = document.getElementById('dq-count');
    dqEl.textContent = (parseInt(dqEl.textContent, 10) || 0) + 1;
    const lv = state.progress.levels[level.id] || { solved: false, timeSeconds: null, disqualifications: 0 };
    lv.disqualifications = (lv.disqualifications || 0) + 1;
    state.progress.levels[level.id] = lv;
    try { await saveLevelResult(session.studentId, topic.id, level.id, { solved: false, timeSeconds: null, disqualified: true }); }
    catch (e) { toast('שגיאה בשמירת נתונים: ' + e.message, true); }
  }

  async function handleSuccess(level) {
    playSuccess();
    const fb = document.getElementById('qa-feedback');
    fb.className = 'qa-feedback ok show';
    const elapsed = Math.round((performance.now() - state.startTs) / 1000);
    fb.innerHTML = `✅ מצוין! המעגל נסגר והזרם זורם בהצלחה (זמן פתרון: ${fmtTime(elapsed)}).`;

    // "סגירת המעגל" - רק עכשיו, לאחר תשובה נכונה, מריצים את זרימת הזרם/אמפר
    // (מתפצל באופן פרופורציוני לזרם האמיתי בכל ענף).
    const stageEl = document.getElementById('circuit-stage');
    if (stageEl) stageEl.innerHTML = topic.renderCircuit(level, true).svg;

    const lv = state.progress.levels[level.id] || { disqualifications: 0 };
    lv.solved = true;
    lv.timeSeconds = elapsed;
    state.progress.levels[level.id] = lv;
    state.progress.highestLevel = Math.max(state.progress.highestLevel || 0, level.id);

    try { await saveLevelResult(session.studentId, topic.id, level.id, { solved: true, timeSeconds: elapsed, disqualified: false }); }
    catch (e) { toast('שגיאה בשמירת נתונים: ' + e.message, true); }

    const panel = document.querySelector('.qa-panel');
    const nextBtn = document.createElement('div');
    nextBtn.style.marginTop = '14px';
    const hasNext = level.id < topic.totalLevels;
    nextBtn.innerHTML = `<button id="next-level">${hasNext ? 'לשלב הבא →' : 'סיימת את הנושא! חזרה לכל הנושאים 🏁'}</button>`;
    panel.appendChild(nextBtn);
    document.getElementById('submit-answer').disabled = true;
    document.getElementById('answer-input').disabled = true;
    document.getElementById('next-level').addEventListener('click', () => {
      if (hasNext) openLevel(level.id + 1); else onBack();
    });
  }
}
