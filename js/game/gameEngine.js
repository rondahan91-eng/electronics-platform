// ==========================================================================
// gameEngine.js - מפת שלבים בתוך תת-נושא (syllabus.js), מסך המשחק, בדיקת
// תשובות. גנרי לחלוטין ביחס לנושא: מקבל אובייקט topic (ראו curriculum.js)
// שמספק generateLevel/render/evaluateAnswer משלו - gameEngine לא מכיר
// פיזיקה ספציפית כלל.
//
// opts.subtopic (אופציונלי) = {levelStart, levelEnd, chapterN, chapterTitle,
// n, title, color} - "חלון" תת-נושא על טווח שלבים בתוך ה-topic (ראו
// home.js). כשלא סופק (עדיין המצב ב-preview מהדשבורד, עד שלב 6) - נופלים
// חזרה ל"כל הנושא כטווח אחד", כמו לפני הפיצול לתת-נושאים.
// ==========================================================================
import { playSuccess, playError, playBurn, playClick } from './audio.js';
import { saveLevelResult, fetchMyProgress } from '../api.js';
import { CONFIG } from '../config.js';
import { shellHtml, wireShell, toast, fmtTime } from '../ui.js';

export async function mountTopic(app, session, topic, onBack, onLogout, opts = {}) {
  const preview = !!opts.preview;
  const sub = opts.subtopic || {
    levelStart: 1, levelEnd: topic.totalLevels,
    chapterN: null, chapterTitle: null, n: null, title: topic.title, color: null,
  };
  const windowStart = sub.levelStart;
  const windowEnd = sub.levelEnd;
  const windowSize = windowEnd - windowStart + 1;
  const toGlobal = local => windowStart + local - 1;
  const toLocal = global => global - windowStart + 1;

  const state = { progress: { highestLevel: 0, levels: {} }, allProgress: {}, levelId: null, startTs: null, hintsShown: 0 };
  let cleanupLevel = () => {};
  if (!preview) {
    try {
      const all = await fetchMyProgress(session.studentId);
      state.allProgress = all || {};
      state.progress = (all && all[topic.id]) || { highestLevel: 0, levels: {} };
    } catch (e) { toast('שגיאה בטעינת התקדמות: ' + e.message, true); }
  }

  function shellStats() {
    if (preview) return undefined;
    const points = Object.values(state.allProgress).reduce((sum, t) =>
      sum + Object.values(t.levels || {}).filter(l => l.solved).length, 0);
    return { streak: session.streakDays || 0, points };
  }

  function windowHighestLocal() {
    let max = 0;
    for (let i = 1; i <= windowSize; i++) {
      const gid = toGlobal(i);
      if (state.progress.levels[gid] && state.progress.levels[gid].solved) max = i;
    }
    return max;
  }

  function windowAvgSeconds() {
    const times = [];
    for (let i = 1; i <= windowSize; i++) {
      const lv = state.progress.levels[toGlobal(i)];
      if (lv && lv.solved && typeof lv.timeSeconds === 'number') times.push(lv.timeSeconds);
    }
    return times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  }

  const previewBanner = preview
    ? `<div class="glass" style="padding:10px 18px;margin-bottom:14px;border:1px solid var(--px-amber);color:#8a6d00;font-size:13.5px;">
        🧪 מצב תצוגה מקדימה למורה — כל השלבים פתוחים לניסיון, וההתקדמות/ניסיונות כאן <b>לא נשמרים</b> במעקב הכיתתי.
      </div>`
    : '';

  if (opts.previewLevel) {
    openLevel(toGlobal(Math.min(Math.max(1, opts.previewLevel), windowSize)));
  } else {
    renderMap();
  }

  function renderMap() {
    const highestLocal = windowHighestLocal();
    const doneCount = (() => { let c = 0; for (let i = 1; i <= windowSize; i++) if (state.progress.levels[toGlobal(i)]?.solved) c++; return c; })();
    const avgSecs = windowAvgSeconds();
    const nextLocal = Math.min(highestLocal + 1, windowSize);
    const breadcrumb = sub.chapterN ? `פרק ${sub.chapterN} · ${sub.chapterTitle}` : (topic.subtitle || '');
    const headTitle = sub.n ? `${sub.n} ${sub.title}` : sub.title;
    const progression = windowSize <= 4 ? 'הצבה ישירה → סידור נוסחה' : 'הצבה ישירה → סידור נוסחה → מספרים ריאליים';

    const nodes = [];
    for (let i = 1; i <= windowSize; i++) {
      const gid = toGlobal(i);
      const done = !!(state.progress.levels[gid] && state.progress.levels[gid].solved);
      const locked = !preview && i > highestLocal + 1;
      const current = !preview && i === highestLocal + 1;
      const cls = ['level-node'];
      if (locked) cls.push('locked');
      if (done) cls.push('done');
      if (current) cls.push('current');
      nodes.push(`<button type="button" class="${cls.join(' ')}" data-level="${gid}" ${locked ? 'disabled' : ''} title="שלב ${i}">
          <span class="level-num">${i}</span>
          <span class="level-tag">${locked ? 'נעול' : done ? 'הושלם' : current ? 'הבא' : ''}</span>
        </button>`);
    }

    app.innerHTML = shellHtml(session, session.role === 'admin' ? 'teacher' : 'home', `
      <div class="map-wrap">
        <button type="button" class="map-back" id="back-home">${preview ? '→ חזרה לפאנל הניהול' : '→ חזרה לפרקים'}</button>
        ${previewBanner}
        <div class="map-head-card" style="border-inline-start-color:${sub.color || 'var(--px-hairline)'};">
          <div>
            <div class="eyebrow">${breadcrumb}</div>
            <h1>${headTitle}</h1>
          </div>
          <div class="map-figures">
            <div><div class="map-figure-label">הושלמו</div><div class="map-figure-value">${doneCount}<span>/${windowSize}</span></div></div>
            <div><div class="map-figure-label">זמן ממוצע</div><div class="map-figure-value">${avgSecs != null ? fmtTime(avgSecs) : '—'}</div></div>
          </div>
        </div>
        <div class="map-caption-row">
          <span class="range">שלבים 1–${windowSize}</span>
          <span class="rule"></span>
          <span class="progression">${progression}</span>
        </div>
        <div class="level-grid">${nodes.join('')}</div>
        ${!preview ? `
        <div class="map-next-card">
          <div>
            <div class="map-next-label">השלב הבא שלך</div>
            <div class="map-next-title">שלב ${nextLocal} מתוך ${windowSize}${sub.title ? ' · ' + sub.title : ''}</div>
            <div class="map-next-sub">${breadcrumb}</div>
          </div>
          <button type="button" id="open-next">להתחיל</button>
        </div>` : ''}
      </div>
      <footer class="foot">${CONFIG.APP_NAME} ⚡ סימולטור למידה אינטראקטיבי</footer>`,
      { stats: shellStats() });

    wireShell(onLogout, onBack, { session, screen: `מפת השלבים · ${breadcrumb}` });
    document.getElementById('back-home').addEventListener('click', onBack);
    app.querySelectorAll('.level-node:not(.locked)').forEach(n => {
      n.addEventListener('click', () => { playClick(); openLevel(parseInt(n.dataset.level, 10)); });
    });
    const nextBtn = document.getElementById('open-next');
    if (nextBtn) nextBtn.addEventListener('click', () => { playClick(); openLevel(toGlobal(nextLocal)); });
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
    const localLevel = toLocal(state.levelId);
    const breadcrumb = sub.chapterN ? `פרק ${sub.chapterN} · ${sub.chapterTitle} · ${sub.n}` : (topic.subtitle || '');
    const dotColor = sub.color || 'var(--px-brand)';
    // הזירה מוצגת "פתוחה" (סטטית) עד שהתלמיד/ה עונים נכון - ראו handleSuccess.
    const { svg } = topic.render(level, false);
    const lv0 = state.progress.levels[level.id] || {};

    app.innerHTML = shellHtml(session, session.role === 'admin' ? 'teacher' : 'home', `
      <div class="game-wrap">
        <div class="game-top-row">
          <button type="button" class="map-back" id="back-map">→ חזרה למפת השלבים</button>
          <div class="game-top-meta">
            <span>שלב ${localLevel}/${windowSize}</span>
            <span class="sep"></span>
            <span>פסילות: <span id="dq-count">${lv0.disqualifications || 0}</span></span>
          </div>
        </div>
        ${previewBanner}
        <div class="game-intro">
          <div class="game-breadcrumb"><span class="dot" style="background:${dotColor};"></span><span>${breadcrumb} · שלב ${localLevel}</span></div>
          <h1>${level.title}</h1>
          <p>${level.description}</p>
        </div>

        <div class="arena-wrap">
          <div class="arena-halo"></div>
          <div class="arena-portal" id="arena-portal">
            <div class="circuit-stage" id="circuit-stage">${svg}</div>
          </div>
        </div>

        <div class="game-grid">
          <div class="qa-panel glass">
            <div class="qa-question">${q.prompt} <span class="ask-target">(יחידות: ${q.unit})</span></div>
            <div class="qa-row">
              <div class="field">
                <label>התשובה שלך</label>
                <div class="answer-shell">
                  <input type="number" step="any" id="answer-input" placeholder="הזינו מספר">
                  <span class="answer-unit">${q.unit}</span>
                </div>
              </div>
              <button id="submit-answer">בדיקה</button>
              <button class="secondary" id="hint-btn" type="button">רמז</button>
            </div>
            <p class="form-note" style="margin:9px 0 0;">ניתן להשתמש בכתיב מדעי, למשל <code>2.5e-3</code> במקום 0.0025.</p>
            <div class="qa-feedback" id="qa-feedback"></div>
            <div class="hero-figure" id="hero-figure"></div>
            <div class="game-next-row" id="game-next-row"></div>
          </div>
          <div class="game-side">
            <div class="hints-card" id="hints-card" style="display:none;">
              <div class="hints-card-label">רמזים · <span id="hints-count">0</span>/${(q.hints || []).length}</div>
              <div id="hint-list"></div>
            </div>
            <div class="stats-card glass">
              <div class="stats-card-label">מה קורה בשלב הזה</div>
              <div class="stats-row"><span>ניסיונות</span><b id="attempts-val">${lv0.attempts || 0}</b></div>
              <div class="stats-row"><span>פסילות</span><b id="dq-val" class="${lv0.disqualifications ? 'danger' : ''}">${lv0.disqualifications || 0}</b></div>
              <div class="stats-row"><span>זמן על השלב</span><b id="elapsed-val">0:00</b></div>
            </div>
          </div>
        </div>
      </div>`,
      { stats: shellStats() });

    wireShell(onLogout, onBack, { session, screen: `מסך תרגול · ${breadcrumb} · שלב ${localLevel}` });
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

  function updateStatsCard(level) {
    const lv = state.progress.levels[level.id] || {};
    const attemptsEl = document.getElementById('attempts-val');
    const dqEl = document.getElementById('dq-val');
    const dqTopEl = document.getElementById('dq-count');
    const elapsedEl = document.getElementById('elapsed-val');
    if (attemptsEl) attemptsEl.textContent = lv.attempts || 0;
    if (dqEl) { dqEl.textContent = lv.disqualifications || 0; dqEl.classList.toggle('danger', !!(lv.disqualifications)); }
    if (dqTopEl) dqTopEl.textContent = lv.disqualifications || 0;
    if (elapsedEl) elapsedEl.textContent = fmtTime(Math.round((performance.now() - state.startTs) / 1000));
  }

  function showHint(level) {
    const hints = level.question.hints || [];
    const card = document.getElementById('hints-card');
    if (!hints.length || !card) return;
    state.hintsShown = Math.min(state.hintsShown + 1, hints.length);
    card.style.display = 'block';
    document.getElementById('hints-count').textContent = state.hintsShown;
    document.getElementById('hint-list').innerHTML = hints.slice(0, state.hintsShown)
      .map(h => `<div class="hint-item"><span class="dot"></span><span class="text">${h}</span></div>`).join('');
  }

  function checkAnswer(level) {
    cleanupLevel();
    const input = document.getElementById('answer-input');
    const val = parseFloat(input.value);
    const fb = document.getElementById('qa-feedback');
    if (Number.isNaN(val)) {
      fb.className = 'qa-feedback bad show';
      fb.innerHTML = '<span class="fb-tag">≠</span><span class="fb-text">נא להזין מספר תקין.</span>';
      return;
    }

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
    fb.innerHTML = `<span class="fb-tag">≠</span><span class="fb-text">${result.message || '⚡ לא מדויק. בדקו שוב את הנוסחה ונסו שוב.'}</span>`;
    const stage = document.getElementById('circuit-stage');
    if (stage) {
      if (topic.animateIncorrect) topic.animateIncorrect(stage, level, result);
      else {
        stage.classList.add('shake');
        setTimeout(() => stage.classList.remove('shake'), 400);
      }
    }
    if (!preview) {
      const lv = state.progress.levels[level.id] || { solved: false, timeSeconds: null, disqualifications: 0, attempts: 0 };
      lv.attempts = (lv.attempts || 0) + 1;
      state.progress.levels[level.id] = lv;
    }
    updateStatsCard(level);
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
    fb.innerHTML = `<span class="fb-tag">!</span><span class="fb-text">${result.message}</span>`;
    const lv = state.progress.levels[level.id] || { solved: false, timeSeconds: null, disqualifications: 0, attempts: 0 };
    lv.attempts = (lv.attempts || 0) + 1;
    lv.disqualifications = (lv.disqualifications || 0) + 1;
    state.progress.levels[level.id] = lv;
    updateStatsCard(level);
    await recordAttempt(level, { solved: false, timeSeconds: null, disqualified: true });
  }

  async function handleSuccess(level) {
    playSuccess();
    const fb = document.getElementById('qa-feedback');
    fb.className = 'qa-feedback ok show';
    const elapsed = Math.round((performance.now() - state.startTs) / 1000);
    fb.innerHTML = `<span class="fb-tag">✓</span><span class="fb-text">${topic.successMessage
      ? topic.successMessage(level, elapsed)
      : `מצוין! פתרתם את השלב בהצלחה (זמן פתרון: ${fmtTime(elapsed)}).`}</span>`;

    // רק עכשיו, לאחר תשובה נכונה, מריצים את האנימציה/מצב ה"אנרגטי" של הזירה,
    // ומדגישים את מסגרת ה"פורטל" סביבה.
    const stageEl = document.getElementById('circuit-stage');
    if (stageEl) stageEl.innerHTML = topic.render(level, true).svg;
    const portalEl = document.getElementById('arena-portal');
    if (portalEl) portalEl.classList.add('solved');

    const heroEl = document.getElementById('hero-figure');
    if (heroEl) {
      heroEl.innerHTML = `<span dir="ltr" class="hero-value">${level.question.answer}${level.question.unit}</span><span class="hero-caption">התשובה הנכונה</span>`;
      heroEl.classList.add('show');
    }

    const lv = state.progress.levels[level.id] || { disqualifications: 0, attempts: 0 };
    lv.attempts = (lv.attempts || 0) + 1;
    lv.solved = true;
    lv.timeSeconds = elapsed;
    state.progress.levels[level.id] = lv;
    state.progress.highestLevel = Math.max(state.progress.highestLevel || 0, level.id);
    updateStatsCard(level);

    await recordAttempt(level, { solved: true, timeSeconds: elapsed, disqualified: false });

    // אם המשתמש/ת כבר ניווטו הלאה (למשל "חזרה למפה") בזמן שהשמירה
    // האסינכרונית לעיל עוד רצה - המסך הזה כבר לא קיים ב-DOM, אין מה להשלים.
    const row = document.getElementById('game-next-row');
    if (!row) return;
    const hasNext = state.levelId < windowEnd;
    const finishLabel = preview ? 'סיימת את הנושא! חזרה לפאנל הניהול 🏁' : 'סיימת את התת-נושא! חזרה לפרקים 🏁';
    row.innerHTML = `<button id="next-level" class="ground">${hasNext ? 'לשלב הבא →' : finishLabel}</button><button id="retry-level" class="secondary">לנסות שוב</button>`;
    document.getElementById('submit-answer').disabled = true;
    document.getElementById('answer-input').disabled = true;
    document.getElementById('next-level').addEventListener('click', () => {
      if (hasNext) openLevel(level.id + 1); else onBack();
    });
    document.getElementById('retry-level').addEventListener('click', () => openLevel(level.id));
  }
}
