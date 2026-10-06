// ==========================================================================
// formulaSheet.js - בועה צפה "דף נוסחאות" למסכי התרגול של נושא.
//
// חוזה: topic.formulas = מערך סעיפים, כל סעיף { title, items: [{ label, expr?, note? }] }
//   label = שם קצר בעברית, expr = הנוסחה (LTR, בשורה משלה - אותיות לטיניות, מספרים וסמלים
//   בלבד, בלי מילים בעברית), note = הסבר קצר בעברית (אפשר לשלב בו סמלים לטיניים).
//   expr אופציונלי: פריט בלי expr מוצג כשורת כלל/הסבר.
// כשאין topic.formulas - לא מוצגת בועה. כל נושא חדש צריך להגדיר formulas (ראו
// staticChargeFormulas.js כדוגמה): הנוסחאות מוצגות אחת אחרי השנייה, בלי לשוניות.
//
// הבועה נפתחת בלחיצה ונסגרת בלחיצה (על הבועה או על ה-X; גם Esc). הלוח *לא* צף מעל
// התוכן: במסך רחב (1100px ומעלה) הוא הופך לעמודה בצד שמאל ודוחף את התוכן, ובמסך צר הוא
// גיליון תחתון והתוכן נגלל מעליו - כך תיבת התשובה והכפתורים תמיד נשארים חשופים. הכיתוב
// של המצב נעשה ע"י class "fx-open" על <html> (ראו css/style.css, בלוק .fx-*).
// gameEngine קורא ל-attachFormulaSheet אחרי כל רינדור של מסך, ושומר את המצב ב-state
// ({open, scrollTop}) כך שהלוח נשאר פתוח, באותו מקום גלילה, במעבר בין שלבים.
// ==========================================================================

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const HEBREW = /[֐-׿]/;
// רצפים של "מילים בלי עברית" (סמלים, מספרים, יחידות): נעטפים ב-span LTR כדי שבתוך משפט עברי
// הסדר שלהם לא יתהפך (למשל "F ב-N, Q ו-q ב-C").
const LTR_RUN = /[^֐-׿\s]+(?:\s+[^֐-׿\s]+)*/g;

function appendMixed(node, text) {
  let last = 0;
  for (const m of text.matchAll(LTR_RUN)) {
    let start = m.index;
    let run = m[0];
    // מקף שמחבר אות-יחס עברית (ב-, ו-, ל-) לסמל לטיני שייך לצד העברי
    if (run[0] === '-' && start > 0 && HEBREW.test(text[start - 1])) { start += 1; run = run.slice(1); }
    // פיסוק בסוף הרצף נשאר בצד העברי
    const trail = run.match(/[,.;:!?]+$/);
    if (trail) run = run.slice(0, -trail[0].length);
    if (!run) continue;
    if (start > last) node.appendChild(document.createTextNode(text.slice(last, start)));
    const span = document.createElement('span');
    span.setAttribute('dir', 'ltr');
    span.textContent = run;
    node.appendChild(span);
    last = start + run.length;
  }
  if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
  return node;
}

let current = null; // המופע הפעיל (בועה אחת לכל היותר)

// עטיפה בטוחה: טעות בנתוני הנוסחאות של נושא לא אמורה להפיל את מסך התרגול עצמו -
// במקרה כזה רק אין בועה, ומודפסת אזהרה לקונסול.
export function attachFormulaSheet(container, topic, state) {
  if (current) { current.dispose(); current = null; }
  const sections = topic && topic.formulas;
  if (sections == null) return null;
  if (!Array.isArray(sections)) {
    console.warn('formulaSheet: topic.formulas חייב להיות מערך סעיפים', topic && topic.id);
    return null;
  }
  if (!sections.length) return null;
  try {
    return build(container, topic, sections, state);
  } catch (err) {
    console.warn('formulaSheet: נכשלה בניית דף הנוסחאות של', topic && topic.id, err);
    if (current) { current.dispose(); current = null; }
    container.querySelectorAll('[data-fx]').forEach(n => n.remove());
    document.documentElement.classList.remove('fx-open', 'fx-has-sheet');
    return null;
  }
}

function build(container, topic, sections, state) {
  const root = el('div', 'fx-root');
  root.dataset.fx = 'formula-sheet';

  // ---- הבועה (ראשונה ב-DOM, כדי שבמקלדת Tab ממנה יגיע ל-X ולגוף הלוח; חזותית היא למטה - column-reverse)
  const bubble = el('button', 'fx-bubble');
  bubble.type = 'button';
  bubble.setAttribute('aria-controls', 'fx-panel');
  bubble.setAttribute('aria-label', 'דף נוסחאות');
  bubble.title = 'דף נוסחאות';
  const icon = el('span', 'fx-bubble-icon', 'ƒ');
  icon.setAttribute('aria-hidden', 'true');
  const label = el('span', 'fx-bubble-label');
  label.setAttribute('aria-hidden', 'true');
  bubble.appendChild(icon);
  bubble.appendChild(label);

  // ---- הלוח
  const panel = el('section', 'fx-panel glass');
  panel.id = 'fx-panel';
  const sheetTitle = topic.title ? `דף נוסחאות · ${topic.title}` : 'דף נוסחאות';
  panel.setAttribute('aria-label', sheetTitle);

  const head = el('header', 'fx-head');
  head.appendChild(el('span', 'fx-title', sheetTitle));
  const closeBtn = el('button', 'fx-close', '×');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'סגירת דף הנוסחאות');
  head.appendChild(closeBtn);
  panel.appendChild(head);

  const body = el('div', 'fx-body');
  body.tabIndex = 0;
  body.setAttribute('role', 'region');
  body.setAttribute('aria-label', 'רשימת הנוסחאות');
  sections.forEach(sec => {
    const secEl = el('div', 'fx-section');
    secEl.appendChild(el('h4', 'fx-section-title', sec.title));
    (sec.items || []).forEach(it => {
      const row = el('div', 'fx-item');
      row.appendChild(appendMixed(el('div', 'fx-label'), it.label));
      if (it.expr) {
        const expr = el('div', 'fx-expr', it.expr);
        expr.setAttribute('dir', 'ltr');
        row.appendChild(expr);
      }
      if (it.note) row.appendChild(appendMixed(el('div', 'fx-note'), it.note));
      secEl.appendChild(row);
    });
    body.appendChild(secEl);
  });
  panel.appendChild(body);

  root.appendChild(bubble);
  root.appendChild(panel);
  container.appendChild(root);

  const html = document.documentElement;
  html.classList.add('fx-has-sheet');

  function sync() {
    const open = !!state.open;
    panel.hidden = !open;
    root.classList.toggle('open', open);
    html.classList.toggle('fx-open', open);
    bubble.setAttribute('aria-expanded', String(open));
    bubble.classList.toggle('open', open);
    label.textContent = open ? 'סגירה' : 'נוסחאות';
  }
  function toggle(force) {
    state.open = typeof force === 'boolean' ? force : !state.open;
    sync();
  }

  bubble.addEventListener('click', () => toggle());
  closeBtn.addEventListener('click', () => { toggle(false); bubble.focus(); });
  body.addEventListener('scroll', () => { state.scrollTop = body.scrollTop; }, { passive: true });

  // Esc סוגר. לא נוגעים בפוקוס אלא אם הוא היה בתוך הבועה/הלוח (כדי ש-Enter בתיבת התשובה
  // ימשיך לשלוח), ולא מתערבים כש-Esc שייך לחלון אחר (למשל "דיווח על תקלה").
  function onKey(e) {
    if (e.key !== 'Escape' || !state.open || e.defaultPrevented) return;
    if (e.target && e.target.closest && e.target.closest('.modal-overlay')) return;
    const inside = root.contains(document.activeElement);
    toggle(false);
    if (inside) bubble.focus();
  }
  document.addEventListener('keydown', onKey);

  // בטלפון (עד 600px) הגיליון התחתון והמקלדת הווירטואלית לא משאירים מקום לתיבת התשובה, ולכן
  // כשמתחילים להקליד תשובה הלוח נסגר (הבועה נשארת, ואפשר לפתוח שוב). במסכים רחבים הלוח נשאר פתוח.
  const phone = window.matchMedia('(max-width: 600px)');
  function onFocusIn(e) {
    if (!state.open || !phone.matches) return;
    const t = e.target;
    if (t && t.matches && t.matches('input, textarea, select') && !root.contains(t)) toggle(false);
  }
  document.addEventListener('focusin', onFocusIn);

  // כשהמסך מוחלף (app.innerHTML) והבועה כבר לא מחוברת - מסירים מאזין ו-classים מ-<html>.
  const observer = new MutationObserver(() => { if (!root.isConnected) dispose(); });
  observer.observe(container, { childList: true });

  function dispose() {
    observer.disconnect();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('focusin', onFocusIn);
    html.classList.remove('fx-open', 'fx-has-sheet');
    root.remove();
    if (current === inst) current = null;
  }

  sync();
  if (state.open && state.scrollTop) body.scrollTop = state.scrollTop;

  const inst = { toggle, dispose, root };
  current = inst;
  return inst;
}
