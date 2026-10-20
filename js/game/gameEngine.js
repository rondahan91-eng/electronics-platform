// ==========================================================================
// gameEngine.js - מפת שלבים בתוך תת-נושא (syllabus.js), מסך המשחק, בדיקת
// תשובות. גנרי לחלוטין ביחס לנושא: מקבל אובייקט topic (ראו curriculum.js)
// שמספק generateLevel/render/evaluateAnswer משלו - gameEngine לא מכיר
// פיזיקה ספציפית כלל.
//
// topic.formulas (אופציונלי): דף נוסחאות לבועה הצפה - ראו formulaSheet.js. כל נושא חדש צריך להגדיר אותו.
// opts.knownTopicIds (אופציונלי): מזהי נושאים קיימים - שורות התקדמות של נושאים שהוחלפו לא נספרות בנקודות.
// topic.progression (אופציונלי): כיתוב מדרגת הקושי במפת השלבים. topic.formatAnswer(level) (אופציונלי):
// איך מוצגת התשובה הנכונה אחרי פתרון (ברירת מחדל: answer + unit).
//
// הרחבות אופציונליות לנושא שבו כל שלב דורש כמה תשובות (למשל כמה זרמים), ראו meshLevelGenerator.js:
//   question.lines = [{key, label, unit}]  - שורת תשובה וכפתור בדיקה לכל גודל; אין שדה תשובה יחיד ואין סרגל כתיב.
//                    topic.evaluateLine(level, key, value) -> {outcome:'correct'|'incorrect', message}. השלב נפתר רק כשכל השורות אושרו.
//   topic.hintsOnCircuit = true - הרמזים נבנים על גבי הציור: topic.render(level, energized, {hints: n}) מצייר את n הרמזים (הטקסט
//                    של question.hints מוצג גם בכרטיס הרמזים).
//   topic.mountPanel(container, level, api) -> dispose - פאנל תשובה מותאם לגמרי (בנושא שבו הפתרון הוא אינטראקציה מורכבת, למשל
//                    צדיקים ונוכלים): במקום שאלה/שדה תשובה/רמזים הסטנדרטיים. api = { solved(), wrongAttempt(), preview }.
//                    solved() מריץ את זרימת ההצלחה הרגילה (הודעה, איור energized, שמירה, "לשלב הבא"); wrongAttempt() רושם ניסיון שגוי.
//   topic.theoryDeck = {src, title} - מצגת בחלון צף (deckPopup.js): קופצת אוטומטית פעם אחת, בתשובה השגויה הראשונה של
//                    התלמיד/ה בנושא, ולחצן "המצגת" פותח אותה שוב בשקף שבו עצרו.
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
import { attachFormulaSheet } from './formulaSheet.js';
import { parseAnswer, mountAnswerToolbar } from './answerInput.js';
import { mathHtml, mathPlain } from './mathMarkup.js';
import { createDeckViewer } from './deckPopup.js';

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
  let answerTools = null; // סרגל לחצני הכתיב של השלב הפתוח (answerInput.js)
  // בועת דף הנוסחאות (topic.formulas): מצב הפתיחה נשמר בין שלבים; הבועה עצמה נבנית מחדש אחרי כל רינדור.
  const formulaState = { open: false };
  // מצגת עזר של הנושא (topic.theoryDeck): נשמרים פר-תלמיד/ה: השקף האחרון, והאם כבר קפצה אוטומטית. בתצוגה מקדימה למורה - רק בזיכרון.
  const deck = topic.theoryDeck
    ? createDeckViewer({
      src: topic.theoryDeck.src, title: topic.theoryDeck.title, persist: !preview,
      storageKey: `electro.deck.${session.studentId || session.username || 'anon'}.${topic.id}${topic.theoryDeck.version ? '.v' + topic.theoryDeck.version : ''}`,
    })
    : null;
  const deckBtn = (cls = 'secondary') => (deck ? `<button type="button" class="${cls} deck-open-btn" data-deck-open>📖 המצגת</button>` : '');
  const wireDeckButtons = () => app.querySelectorAll('[data-deck-open]').forEach(b => b.addEventListener('click', () => { playClick(); deck.open(); }));
  // תשובה שגויה ראשונה אי-פעם בנושא: המצגת קופצת בחלון גדול (פעם אחת בלבד). "פעם אחת" נרשם רק כשהחלון באמת נפתח,
  // והטיימר מתבטל ביציאה מהשלב/מהנושא/מהמערכת, כדי שהחלון לא יקפוץ מעל מסך אחר.
  let autoDeckTimer = null;
  const leaveGuard = () => {
    if (autoDeckTimer) { clearTimeout(autoDeckTimer); autoDeckTimer = null; }
    if (deck) deck.close();
  };
  let hadAttemptsAtMount = false; // תלמיד/ה שכבר ניסו בנושא (גם במכשיר אחר): המצגת כבר לא קופצת, ויש את הלחצן
  const maybeAutoDeck = () => {
    if (!deck || deck.autoShown() || deck.isOpen() || autoDeckTimer || hadAttemptsAtMount) return;
    autoDeckTimer = setTimeout(() => { autoDeckTimer = null; deck.markAutoShown(); deck.open({ auto: true }); }, 450);
  };
  const origBack = onBack, origLogout = onLogout;
  onBack = (...a) => { leaveGuard(); return origBack(...a); };
  onLogout = (...a) => { leaveGuard(); return origLogout(...a); };
  if (!preview) {
    try {
      const all = await fetchMyProgress(session.studentId);
      state.allProgress = all || {};
      state.progress = (all && all[topic.id]) || { highestLevel: 0, levels: {} };
      hadAttemptsAtMount = Object.values(state.progress.levels || {}).some(l => (l.attempts || 0) > 0);
    } catch (e) { toast('שגיאה בטעינת התקדמות: ' + e.message, true); }
  }

  function shellStats() {
    if (preview) return undefined;
    const known = opts.knownTopicIds;
    const points = Object.entries(state.allProgress).reduce((sum, [topicId, t]) =>
      (known && !known.includes(topicId))
        ? sum
        : sum + Object.values(t.levels || {}).filter(l => l.solved).length, 0);
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
    leaveGuard();
    const highestLocal = windowHighestLocal();
    const doneCount = (() => { let c = 0; for (let i = 1; i <= windowSize; i++) if (state.progress.levels[toGlobal(i)]?.solved) c++; return c; })();
    const avgSecs = windowAvgSeconds();
    const nextLocal = Math.min(highestLocal + 1, windowSize);
    const breadcrumbText = sub.chapterN ? `פרק ${sub.chapterN} · ${sub.chapterTitle}` : (topic.subtitle || '');
    const breadcrumb = mathHtml(breadcrumbText);
    const headTitle = sub.n ? `${sub.n} ${sub.title}` : sub.title;
    const progression = topic.progression
      || (windowSize <= 4 ? 'הצבה ישירה → סידור נוסחה' : 'הצבה ישירה → סידור נוסחה → מספרים ריאליים');

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
        ${deck ? `<div class="deck-row">${deckBtn()}<span class="deck-row-note">המצגת נפתחת בשקף שבו עצרתם בפעם האחרונה.</span></div>` : ''}
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

    wireShell(onLogout, onBack, { session, screen: `מפת השלבים · ${mathPlain(breadcrumbText)}` });
    attachFormulaSheet(app, topic, formulaState);
    wireDeckButtons();
    document.getElementById('back-home').addEventListener('click', onBack);
    app.querySelectorAll('.level-node:not(.locked)').forEach(n => {
      n.addEventListener('click', () => { playClick(); openLevel(parseInt(n.dataset.level, 10)); });
    });
    const nextBtn = document.getElementById('open-next');
    if (nextBtn) nextBtn.addEventListener('click', () => { playClick(); openLevel(toGlobal(nextLocal)); });
  }

  function openLevel(id) {
    leaveGuard();
    cleanupLevel();
    state.levelId = id;
    state.startTs = performance.now();
    state.hintsShown = 0;
    state.solvedLock = false; // נעילה אחרי תשובה נכונה: מונעת ספירה כפולה (Enter חוזר בזמן שמירה)
    renderLevel();
  }

  function renderLevel() {
    const level = topic.generateLevel(state.levelId);
    const q = level.question;
    // סרגל לחצני הכתיב: רק בשדה מספרי, ורק בנושא שלא כיבה אותו (topic.answerTools === false)
    // שלב עם כמה תשובות (question.lines): שורת בדיקה לכל גודל, בלי שדה יחיד ובלי סרגל כתיב
    // opt-in של הנושא (topic.evaluateLine) ושורות שהן אובייקטים: בנושא הלוגיקה question.lines הוא מערך מחרוזות (שורות תצוגה של המשפט)
    const lines = (typeof topic.evaluateLine === 'function' && Array.isArray(q.lines) && q.lines.length && typeof q.lines[0] === 'object') ? q.lines : null;
    const custom = typeof topic.mountPanel === 'function'; // פאנל תשובה מותאם (opt-in של הנושא)
    const useTools = !lines && !custom && q.inputMode !== 'text' && topic.answerTools !== false;
    const localLevel = toLocal(state.levelId);
    const breadcrumbText = sub.chapterN ? `פרק ${sub.chapterN} · ${sub.chapterTitle} · ${sub.n}` : (topic.subtitle || '');
    const breadcrumb = mathHtml(breadcrumbText);
    const dotColor = sub.color || 'var(--px-brand)';
    // הזירה מוצגת "פתוחה" (סטטית) עד שהתלמיד/ה עונים נכון - ראו handleSuccess.
    const { svg } = topic.render(level, false, { hints: 0 });
    const lv0 = state.progress.levels[level.id] || {};
    state.linesDone = {};
    const linesHtml = lines ? `
            <div class="qa-lines" id="qa-lines">
              ${lines.map(l => `<div class="qa-line" data-key="${l.key}">
                <label for="line-input-${l.key}">${mathHtml(l.label)}</label>
                <div class="qa-line-row">
                  <div class="answer-shell">
                    <input type="text" inputmode="decimal" dir="ltr" id="line-input-${l.key}" data-key="${l.key}" placeholder="מספר (גם שלילי)" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="line-fb-${l.key}">
                    ${l.unit ? `<span class="answer-unit">${l.unit}</span>` : ''}
                  </div>
                  <button type="button" class="line-neg secondary" data-key="${l.key}" aria-label="החלפת סימן: פלוס או מינוס" title="החלפת סימן">±</button>
                  <button type="button" class="line-check" data-key="${l.key}" aria-label="בדיקת ${mathPlain(l.label)}">בדיקה</button>
                  <span class="line-status" id="line-status-${l.key}" aria-hidden="true"></span>
                </div>
                <div class="line-feedback" id="line-fb-${l.key}" role="status" aria-live="polite"></div>
              </div>`).join('')}
            </div>
            <div class="qa-row qa-row-tools"><button class="secondary" id="hint-btn" type="button">רמז</button>${deckBtn()}</div>` : '';
    // נושא יכול להצהיר על question.data = [{label, value}] - כל נתון בשורה נפרדת
    // משלו מתחת לשאלה (ולא משולב בתוך משפט). בלי data - לא מוצג דבר.
    const dataRows = Array.isArray(q.data) && q.data.length
      ? `<ul class="q-data">${q.data.map(d => `<li><span class="q-data-label">${mathHtml(d.label)}</span><b class="q-data-value" dir="ltr">${mathHtml(d.value)}</b></li>`).join('')}</ul>`
      : '';

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
          <button type="button" class="intro-toggle" id="intro-toggle" aria-expanded="false">💡 הסבר על השלב</button>
          <p class="game-intro-desc" id="game-intro-desc" hidden>${mathHtml(level.description)}</p>
        </div>

        <div class="arena-wrap${topic.flatStage ? ' flat' : ''}">
          <div class="arena-halo"></div>
          <div class="arena-portal" id="arena-portal">
            <div class="circuit-stage" id="circuit-stage">${svg}</div>
          </div>
          ${topic.hintsOnCircuit ? `<button type="button" class="arena-hint-btn" id="arena-hint-btn" aria-label="רמז: מופיע על גבי המעגל">💡 רמז <span id="arena-hint-count">0</span>/${(q.hints || []).length}</button>` : ''}
        </div>

        <div class="game-grid">
          <div class="qa-panel glass${custom ? ' qa-panel-custom' : ''}">
            ${custom ? '<div class="custom-panel" id="custom-panel"></div>' : `<div class="qa-question">${mathHtml(q.prompt)}${q.unit ? ` <span class="ask-target">(יחידות: ${q.unit})</span>` : ''}${dataRows}</div>
            ${lines ? linesHtml : `<div class="qa-row">
              <div class="field">
                <label>התשובה שלך</label>
                <div class="answer-shell">
                  ${q.inputMode === 'text'
                    ? `<input type="text" id="answer-input" placeholder="הזינו תשובה" autocomplete="off" autocapitalize="off" spellcheck="false">`
                    : `<input type="text" inputmode="decimal" dir="ltr" id="answer-input" placeholder="${useTools ? 'מספר או ביטוי' : 'הזינו מספר'}" autocomplete="off" autocapitalize="off" spellcheck="false"${useTools ? ' aria-describedby="ans-preview"' : ''}>`}
                  ${q.unit ? `<span class="answer-unit">${q.unit}</span>` : ''}
                </div>
              </div>
              <button id="submit-answer">בדיקה</button>
              <button class="secondary" id="hint-btn" type="button">רמז</button>${deckBtn()}
            </div>`}
            ${!useTools ? '' : `<div id="answer-tools-host"></div><p class="form-note" style="margin:9px 0 0;">אפשר להקליד מספר רגיל, כתיב מדעי (<code>2.5e-3</code>) או ביטוי עם הלחצנים: <code>×10ⁿ</code>, שבר, חזקה, כפל וחילוק.</p>`}
            <div class="hints-card" id="hints-card" style="display:none;">
              <div class="hints-card-label">רמזים · <span id="hints-count">0</span>/${(q.hints || []).length}</div>
              <div id="hint-list"></div>
            </div>`}
            <div class="qa-feedback" id="qa-feedback" role="status" aria-live="polite"></div>
            <div class="hero-figure" id="hero-figure"></div>
            <div class="game-next-row" id="game-next-row"></div>
          </div>
        </div>

        <div class="floating-stats glass" id="floating-stats" title="מה קורה בשלב הזה">
          <div class="floating-stats-item"><span>ניסיונות</span><b id="attempts-val">${lv0.attempts || 0}</b></div>
          <div class="floating-stats-item"><span>פסילות</span><b id="dq-val" class="${lv0.disqualifications ? 'danger' : ''}">${lv0.disqualifications || 0}</b></div>
          <div class="floating-stats-item"><span>זמן</span><b id="elapsed-val">0:00</b></div>
        </div>
      </div>`,
      { stats: shellStats() });

    wireShell(onLogout, onBack, { session, screen: `מסך תרגול · ${mathPlain(breadcrumbText)} · שלב ${localLevel}` });
    if (custom) {
      // פאנל מותאם הוא רחב (טבלאות): הריבוע הצף היה מכסה את העמודה השמאלית שלהן, ולכן הוא יושב בזרימה מתחת לכותרת
      const fs = document.getElementById('floating-stats'), intro = app.querySelector('.game-intro');
      if (fs && intro) { fs.classList.add('fs-inline'); intro.after(fs); }
    }
    attachFormulaSheet(app, topic, formulaState);
    wireDeckButtons();
    document.getElementById('back-map').addEventListener('click', () => { cleanupLevel(); renderMap(); });
    const panelHint = document.getElementById('hint-btn');
    if (panelHint) panelHint.addEventListener('click', () => showHint(level, 'panel'));
    const arenaHint = document.getElementById('arena-hint-btn');
    if (arenaHint) arenaHint.addEventListener('click', () => showHint(level, 'arena'));
    const introToggle = document.getElementById('intro-toggle');
    introToggle.addEventListener('click', () => {
      const descEl = document.getElementById('game-intro-desc');
      descEl.hidden = !descEl.hidden;
      introToggle.setAttribute('aria-expanded', String(!descEl.hidden));
      introToggle.classList.toggle('open', !descEl.hidden);
    });
    if (custom) {
      answerTools = null;
      const api = {
        preview,
        solved: () => { if (!state.solvedLock) handleSuccess(level); },
        wrongAttempt: () => registerWrongAttempt(level),
      };
      const dispose = topic.mountPanel(document.getElementById('custom-panel'), level, api);
      cleanupLevel = () => { try { if (typeof dispose === 'function') dispose(); } catch (e) { console.warn('mountPanel dispose', e); } };
    } else if (lines) {
      answerTools = null;
      lines.forEach(l => {
        const lineInput = document.getElementById(`line-input-${l.key}`);
        lineInput.addEventListener('keydown', e => { if (e.key === 'Enter') checkLine(level, l); });
        app.querySelector(`.line-check[data-key="${l.key}"]`).addEventListener('click', () => checkLine(level, l));
        // מקלדת הנייד העשרונית אינה כוללת מינוס: הלחצן מוסיף/מסיר מינוס בתחילת השדה
        app.querySelector(`.line-neg[data-key="${l.key}"]`).addEventListener('click', () => {
          const v = lineInput.value.trim();
          lineInput.value = /^[-−+]/.test(v) ? v.replace(/^[-−+]\s*/, '') : '-' + v;
          lineInput.focus();
        });
      });
      // הפוקוס לא גולל את הדף: במעגל עם רמזים על גביו, המעגל צריך להישאר בתצוגה
      if (topic.hintsOnCircuit) { const wrap = app.querySelector('.game-wrap'); if (wrap) wrap.scrollIntoView({ block: 'start' }); }
      document.getElementById(`line-input-${lines[0].key}`).focus({ preventScroll: true });
    } else {
      document.getElementById('submit-answer').addEventListener('click', () => checkAnswer(level));
      const input = document.getElementById('answer-input');
      input.addEventListener('keydown', e => { if (e.key === 'Enter') checkAnswer(level); });
      const toolsHost = document.getElementById('answer-tools-host');
      answerTools = (toolsHost && useTools) ? mountAnswerToolbar(input, toolsHost) : null;
      input.focus();
    }

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

  // ניסיון שגוי בפאנל מותאם: אותה הנהלת חשבונות כמו בתשובה שגויה בשדה רגיל (ספירה, שמירה, מצגת עזר אם יש)
  function registerWrongAttempt(level) {
    playError();
    if (!preview) {
      const lv = state.progress.levels[level.id] || { solved: false, timeSeconds: null, disqualifications: 0, attempts: 0 };
      lv.attempts = (lv.attempts || 0) + 1;
      state.progress.levels[level.id] = lv;
    }
    updateStatsCard(level);
    recordAttempt(level, { solved: false, timeSeconds: null, disqualified: false });
    maybeAutoDeck();
  }

  function showHint(level, source) {
    const hints = level.question.hints || [];
    const card = document.getElementById('hints-card');
    if (!hints.length || !card) return;
    // כל הרמזים כבר פתוחים: אין מה לצייר מחדש (בלי הבהוב של הרמז האחרון על המעגל)
    if (topic.hintsOnCircuit && state.hintsShown >= hints.length) return;
    state.hintsShown = Math.min(state.hintsShown + 1, hints.length);
    card.style.display = 'block';
    document.getElementById('hints-count').textContent = state.hintsShown;
    const arenaCount = document.getElementById('arena-hint-count');
    if (arenaCount) arenaCount.textContent = state.hintsShown;
    const arenaBtn = document.getElementById('arena-hint-btn');
    if (arenaBtn) arenaBtn.setAttribute('aria-label', `רמז: מופיע על גבי המעגל. נפתחו ${state.hintsShown} מתוך ${hints.length}`);
    document.getElementById('hint-list').innerHTML = hints.slice(0, state.hintsShown)
      .map(h => `<div class="hint-item"><span class="dot"></span><span class="text">${mathHtml(h)}</span></div>`).join('');
    // רמזים על גבי המעגל: מציירים מחדש את הזירה עם n הרמזים הפתוחים (הציור, המשוואות...)
    if (topic.hintsOnCircuit) {
      const stage = document.getElementById('circuit-stage');
      if (stage) stage.innerHTML = topic.render(level, !!state.solvedLock, { hints: state.hintsShown }).svg;
      // לא גוללים אל כרטיס הרמזים: התלמיד/ה צריכים לראות את מה שנוסף על המעגל. מהלחצן שבתוך הפאנל (רחוק מהמעגל) מביאים את המעגל לתצוגה
      if (source === 'panel' && stage) stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    revealNearest(card);
  }

  // ---- שלב עם כמה שורות תשובה (question.lines): כל שורה נבדקת בנפרד, והשלב נפתר כשכולן אושרו
  function checkLine(level, line) {
    if (state.solvedLock || state.linesDone[line.key]) return;
    if (typeof topic.evaluateLine !== 'function') throw new Error(`topic ${topic.id}: question.lines דורש topic.evaluateLine`);
    const input = document.getElementById(`line-input-${line.key}`);
    const fb = document.getElementById(`line-fb-${line.key}`);
    const parsed = parseAnswer(input.value);
    if (!parsed.ok) {
      fb.className = 'line-feedback bad show';
      fb.textContent = 'נא להזין מספר, למשל 2.5 או -3 (אפשר להשתמש בלחצן ± למינוס).';
      return;
    }
    const result = topic.evaluateLine(level, line.key, parsed.value);
    if (result.outcome === 'correct') {
      state.linesDone[line.key] = true;
      playClick();
      const row = app.querySelector(`.qa-line[data-key="${line.key}"]`);
      row.classList.add('done');
      input.disabled = true;
      app.querySelector(`.line-check[data-key="${line.key}"]`).disabled = true;
      app.querySelector(`.line-neg[data-key="${line.key}"]`).disabled = true;
      document.getElementById(`line-status-${line.key}`).textContent = '✓';
      fb.className = 'line-feedback ok show';
      fb.textContent = 'מאושר ✓';
      const next = (level.question.lines || []).find(l => !state.linesDone[l.key]);
      if (next) document.getElementById(`line-input-${next.key}`).focus({ preventScroll: true });
      else handleSuccess(level);
      return;
    }
    // שגוי: ההודעה מתחת לשורה עצמה, וניסיון נרשם בדיוק כמו בשדה תשובה יחיד
    playError();
    fb.className = 'line-feedback bad show';
    fb.innerHTML = `<span class="fb-tag">≠</span><span class="fb-text">${mathHtml(result.message || '⚡ לא מדויק. בדקו שוב ונסו שוב.')}</span>`;
    const stage = document.getElementById('circuit-stage');
    if (stage) { stage.classList.add('shake'); setTimeout(() => stage.classList.remove('shake'), 400); }
    if (!preview) {
      const lv = state.progress.levels[level.id] || { solved: false, timeSeconds: null, disqualifications: 0, attempts: 0 };
      lv.attempts = (lv.attempts || 0) + 1;
      state.progress.levels[level.id] = lv;
    }
    updateStatsCard(level);
    recordAttempt(level, { solved: false, timeSeconds: null, disqualified: false });
    maybeAutoDeck();
  }

  // מגלל (בעדינות) כך שהמשוב/הרמזים יהיו גלויים גם במסך נמוך שבו שורת הלחצנים דוחקת אותם למטה
  function revealNearest(el) {
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function checkAnswer(level) {
    if (state.solvedLock) return;
    cleanupLevel();
    const input = document.getElementById('answer-input');
    const fb = document.getElementById('qa-feedback');
    // ברירת מחדל: קלט מספרי (כל הנושאים הקיימים). נושא יכול להצהיר per-level
    // על question.inputMode='text' (למשל תשובה בבסיס בינארי/הקסדצימלי שבה
    // אפסים מובילים משמעותיים, או תווים לא-מספריים כמו A-F) - level.question
    // ולא topic, כי אותו topic יכול לערבב שני הסוגים בין שלביו.
    const textMode = level.question.inputMode === 'text';
    // מספרי: מספר רגיל, כתיב מדעי או ביטוי (כפל/חילוק/שבר/חזקה) - ראו answerInput.js
    const parsed = textMode ? null : parseAnswer(input.value);
    const val = textMode ? input.value.trim() : (parsed.ok ? parsed.value : NaN);
    const invalid = textMode ? !val : !parsed.ok;
    if (invalid) {
      const msg = textMode ? 'נא להזין תשובה.' : (parsed.error || 'נא להזין מספר תקין.');
      fb.className = 'qa-feedback bad show';
      fb.innerHTML = `<span class="fb-tag">≠</span><span class="fb-text">${msg}</span>`;
      revealNearest(fb);
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
    fb.innerHTML = `<span class="fb-tag">≠</span><span class="fb-text">${mathHtml(result.message || '⚡ לא מדויק. בדקו שוב את הנוסחה ונסו שוב.')}</span>`;
    revealNearest(fb);
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
    maybeAutoDeck();
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
    fb.innerHTML = `<span class="fb-tag">!</span><span class="fb-text">${mathHtml(result.message)}</span>`;
    const lv = state.progress.levels[level.id] || { solved: false, timeSeconds: null, disqualifications: 0, attempts: 0 };
    lv.attempts = (lv.attempts || 0) + 1;
    lv.disqualifications = (lv.disqualifications || 0) + 1;
    state.progress.levels[level.id] = lv;
    updateStatsCard(level);
    await recordAttempt(level, { solved: false, timeSeconds: null, disqualified: true });
  }

  async function handleSuccess(level) {
    playSuccess();
    // נועלים מיד (לפני ה-await של השמירה): בלי זה Enter/לחיצה נוספת בזמן השמירה הייתה נספרת שוב
    state.solvedLock = true;
    const submitBtn = document.getElementById('submit-answer');
    const answerEl = document.getElementById('answer-input');
    if (submitBtn) submitBtn.disabled = true;
    if (answerEl) answerEl.disabled = true;
    app.querySelectorAll('.qa-line input, .qa-line button').forEach(el => { el.disabled = true; });
    if (answerTools) answerTools.disable();
    const fb = document.getElementById('qa-feedback');
    fb.className = 'qa-feedback ok show';
    const elapsed = Math.round((performance.now() - state.startTs) / 1000);
    fb.innerHTML = `<span class="fb-tag">✓</span><span class="fb-text">${topic.successMessage
      ? mathHtml(topic.successMessage(level, elapsed))
      : `מצוין! פתרתם את השלב בהצלחה (זמן פתרון: ${fmtTime(elapsed)}).`}</span>`;

    // רק עכשיו, לאחר תשובה נכונה, מריצים את האנימציה/מצב ה"אנרגטי" של הזירה,
    // ומדגישים את מסגרת ה"פורטל" סביבה.
    const stageEl = document.getElementById('circuit-stage');
    if (stageEl) stageEl.innerHTML = topic.render(level, true, { hints: state.hintsShown, noFade: true }).svg;
    const portalEl = document.getElementById('arena-portal');
    if (portalEl) portalEl.classList.add('solved');

    const heroEl = document.getElementById('hero-figure');
    if (heroEl) {
      const heroText = typeof topic.formatAnswer === 'function'
        ? topic.formatAnswer(level)
        : `${level.question.answer}${level.question.unit}`;
      heroEl.innerHTML = `<span dir="ltr" class="hero-value">${heroText}</span><span class="hero-caption">התשובה הנכונה</span>`;
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
    const submitEl = document.getElementById('submit-answer');
    const answerInputEl = document.getElementById('answer-input');
    if (submitEl) submitEl.disabled = true;
    if (answerInputEl) answerInputEl.disabled = true;
    if (answerTools) answerTools.disable();
    document.getElementById('next-level').addEventListener('click', () => {
      if (hasNext) openLevel(level.id + 1); else onBack();
    });
    document.getElementById('retry-level').addEventListener('click', () => openLevel(level.id));
    document.getElementById('next-level').focus({ preventScroll: false }); // הפוקוס עובר ל"לשלב הבא" (המקלדת/קורא מסך)
  }
}
