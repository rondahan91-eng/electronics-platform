// ==========================================================================
// deckPopup.js - חלון צף גדול שמציג מצגת (קובץ HTML באותו origin, בתוך iframe) ומזכיר באיזה שקף התלמיד/ה עצרו.
// המצגת היא "deck-stage" (assets/dc-circuits-deck.html): תומכת ב-#N (שקף N, מונה מ-1) בכתובת, מפרסמת את
// האינדקס הנוכחי כ-deck-stage.index, ו-goTo(i)/next()/prev(). לכן הכול נעשה בלי לשנות את קובץ המצגת.
//   createDeckViewer({ src, title, storageKey, persist }) -> { open({ auto }), close(), lastSlide(), autoShown(), markAutoShown(), isOpen() }
// storageKey: מפתח localStorage פר-תלמיד/ה ופר-נושא; נשמרים בו השקף האחרון (0-based) והאם החלון כבר קפץ אוטומטית.
// בנוסף יש מראה בזיכרון (memory): אם localStorage חסום או מלא, "פעם אחת" ו"שקף אחרון" עדיין נשמרים עד סגירת העמוד.
// נגישות: בזמן שהחלון פתוח #app ו-#toast הם inert (אי אפשר להגיע אליהם ב-Tab); Escape וחצים עובדים גם כשהפוקוס בתוך המצגת.
// ==========================================================================

const POLL_FAST_MS = 60;   // עד שהמצגת (שנפרקת אסינכרונית) מוכנה
const POLL_SLOW_MS = 350;  // אחר כך: מעקב אחרי השקף הנוכחי
const FAIL_AFTER_MS = 12000;

function readStore(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (e) { /* פרטיות/מכסה: נשארים עם המראה בזיכרון */ }
}

// מראה בזיכרון ברמת המודול: שורד יציאה מהנושא וכניסה חוזרת (ולא מתערבב בין תלמידים: מפתח לפי storageKey)
const MEMORY = new Map();

export function createDeckViewer({ src, title, storageKey, persist = true }) {
  const memory = persist ? (MEMORY.get(storageKey) || MEMORY.set(storageKey, {}).get(storageKey)) : {};
  const get = (k, d) => {
    if (k in memory) return memory[k];
    if (persist) { const v = readStore(`${storageKey}.${k}`); if (v !== null) return v; }
    return d;
  };
  const set = (k, v) => { memory[k] = String(v); if (persist) writeStore(`${storageKey}.${k}`, v); };

  let overlay = null;
  let timer = null;
  let slide = Math.max(0, parseInt(get('slide', '0'), 10) || 0);
  let total = 0;
  let returnFocus = null;
  const inertEls = [];

  const stageOf = iframe => {
    try { return iframe.contentDocument && iframe.contentDocument.querySelector('deck-stage'); } catch (e) { return null; }
  };

  function close() {
    if (!overlay) return;
    clearTimeout(timer); timer = null;
    const iframe = overlay.querySelector('iframe');
    const stage = iframe && stageOf(iframe);
    if (stage && typeof stage.index === 'number') { slide = stage.index; set('slide', slide); }
    document.removeEventListener('keydown', onKey, true);
    overlay.remove(); overlay = null;
    inertEls.splice(0).forEach(el => el.removeAttribute('inert'));
    document.documentElement.classList.remove('deck-open');
    if (returnFocus && returnFocus.isConnected && returnFocus.focus) { try { returnFocus.focus(); } catch (e) { /* אין לאן להחזיר */ } }
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }

  function open({ auto = false } = {}) {
    if (overlay) return;
    returnFocus = document.activeElement;
    // הקפיצה האוטומטית פותחת מההתחלה (עוברים על כולה); פתיחה ידנית ממשיכה מהשקף שבו עצרו
    const startSlide = auto ? 0 : slide;
    if (auto) { slide = 0; set('slide', 0); }
    overlay = document.createElement('div');
    overlay.className = 'deck-overlay';
    overlay.innerHTML = `
      <div class="deck-dialog" role="dialog" aria-modal="true" aria-labelledby="deck-title" tabindex="-1">
        <div class="deck-head">
          <div class="deck-head-text">
            <div class="deck-title" id="deck-title">${title}</div>
            <p class="deck-intro">${auto
              ? 'התשובה לא מדויקת. לפני שמנסים שוב, עברו על המצגת עד הסוף (אפשר להתקדם בלחצנים או בחצים במקלדת), ואז חזרו לנסות שוב.'
              : (startSlide > 0 ? 'המצגת נפתחה בשקף שבו עצרתם בפעם הקודמת.' : 'עוברים על המצגת בלחצנים או בחצים במקלדת.')}</p>
          </div>
          <button type="button" class="deck-x" id="deck-x" aria-label="סגירת המצגת">×</button>
        </div>
        <div class="deck-frame-wrap">
          <iframe class="deck-frame" title="${title}" src="${src}#${startSlide + 1}" loading="eager"></iframe>
          <div class="deck-loading" id="deck-loading" role="status">טוען את המצגת...</div>
        </div>
        <div class="deck-foot">
          <div class="deck-nav">
            <button type="button" class="secondary" id="deck-prev">שקף קודם</button>
            <span class="deck-count" id="deck-count" aria-live="polite">שקף ${startSlide + 1}</span>
            <button type="button" class="secondary" id="deck-next">שקף הבא</button>
            <a class="deck-newtab" id="deck-newtab" href="${src}#${startSlide + 1}" target="_blank" rel="noopener">פתיחה במסך מלא</a>
          </div>
          <button type="button" id="deck-done">${auto ? 'סיימנו, חוזרים לנסות שוב' : 'סגירת המצגת'}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.documentElement.classList.add('deck-open');
    ['app', 'toast'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.hasAttribute('inert')) { el.setAttribute('inert', ''); inertEls.push(el); }
    });
    document.addEventListener('keydown', onKey, true);

    const dialog = overlay.querySelector('.deck-dialog');
    const iframe = overlay.querySelector('iframe');
    const countEl = overlay.querySelector('#deck-count');
    const loadingEl = overlay.querySelector('#deck-loading');
    const startedAt = Date.now();
    let ready = false;
    dialog.focus({ preventScroll: true });

    const sync = () => {
      if (!overlay) return;
      const stage = stageOf(iframe);
      if (stage && typeof stage.index === 'number') {
        if (!ready) {
          ready = true;
          if (loadingEl) loadingEl.remove();
          stage.setAttribute('no-rail', ''); // בחלון צף אין מקום לעמודת התמונות הממוזערות
          try {
            // Escape וחצים עובדים גם כשהפוקוס בתוך המצגת; ומעבירים אליה את הפוקוס כדי שהחצים יעבדו מיד
            iframe.contentDocument.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
            iframe.contentWindow.focus();
          } catch (e) { /* לא באותו origin (למשל file://): ממשיכים בלי */ }
        }
        total = stage.length || total;
        if (stage.index !== slide) { slide = stage.index; set('slide', slide); }
        const text = `שקף ${slide + 1}${total ? ' מתוך ' + total : ''}`;
        if (countEl.textContent !== text) countEl.textContent = text;
        const nt = overlay.querySelector('#deck-newtab');
        if (nt) nt.setAttribute('href', `${src}#${slide + 1}`);
      } else if (!ready && loadingEl && Date.now() - startedAt > FAIL_AFTER_MS) {
        loadingEl.classList.add('failed');
        loadingEl.innerHTML = `<div>לא הצלחנו לטעון את המצגת. <a href="${src}#${startSlide + 1}" target="_blank" rel="noopener">פתיחה בלשונית חדשה</a></div>`;
      }
    };
    const loop = () => { sync(); if (overlay) timer = setTimeout(loop, ready ? POLL_SLOW_MS : POLL_FAST_MS); };
    timer = setTimeout(loop, POLL_FAST_MS);

    // אחרי לחיצה על לחצן הניווט הפוקוס חוזר למצגת, כדי שהחצים במקלדת ימשיכו לעבוד
    const withStage = fn => { const st = stageOf(iframe); if (st) { fn(st); sync(); try { iframe.contentWindow.focus(); } catch (e) { /* לא באותו origin */ } } };
    overlay.querySelector('#deck-prev').addEventListener('click', () => withStage(st => st.prev()));
    overlay.querySelector('#deck-next').addEventListener('click', () => withStage(st => st.next()));
    overlay.querySelector('#deck-x').addEventListener('click', close);
    overlay.querySelector('#deck-done').addEventListener('click', close);
  }

  return {
    open, close,
    isOpen: () => !!overlay,
    lastSlide: () => slide,
    autoShown: () => get('auto', '0') === '1',
    markAutoShown: () => set('auto', '1'),
  };
}
