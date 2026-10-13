// ==========================================================================
// answerInput.js - כתיב מקוצר ולחצני סימנים לשדה התשובה המספרית.
//
// parseAnswer(text) -> { ok: true, value } | { ok: false, error }
//   מקבל מספר רגיל (0.0004, 1,5), כתיב מדעי (4e-4), ביטוי עם כפל/חילוק/שבר/חזקה
//   (4×10⁻⁴, 4*10^-4, 3.6e-7/9e-4, (2e-8·5e-9)/(0.03)^2), וגם "F₂ = 1.8×10⁻⁴" (מה שאחרי
//   ה-"=" נקרא). אין eval: מנתח רקורסיבי קטן. לא מנחשים: קלט עמום (פסיק של אלפים, חזקה בלי
//   ^, כפל סימנים, יחידה כתובה) נדחה בהודעה מפורשת - כדי שטעות הקלדה לא תהפוך בשקט למספר אחר.
//
// mountAnswerToolbar(input, host) - שורת לחצנים מתחת לשדה: ×, ÷, שבר, חזקה, ×10ⁿ, כתיב עילי,
//   כתיב תחתי, מינוס, סוגריים, ניקוי; ושורת "נקרא כ-..." חיה. הלחצנים לא גונבים פוקוס מהשדה
//   בלחיצת עכבר/מגע (mousedown נמנע); בהפעלה במקלדת הפוקוס נשאר על הלחצן.
// ==========================================================================

const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₋': '-', '₊': '+' };
const TO_SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺' };
const TO_SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '-': '₋', '+': '₊' };

import { mathFragment } from './mathMarkup.js';

const E_EMPTY = 'נא להזין מספר.';
const E_GENERIC = 'לא הצלחתי לקרוא את הביטוי. אפשר להקליד מספר, כתיב מדעי (4e-4) או לשלב ×, ÷, שבר וחזקה.';
const E_UNIT = 'הקלידו מספר בלבד, בלי יחידה: היחידה כבר מופיעה ליד השדה.';
const E_SUB = 'כתיב תחתי אינו חלק ממספר. אפשר לכתוב אותו רק לפני סימן "=".';
const E_RANGE = 'התוצאה אינה מספר סופי (חילוק באפס או חזקה גדולה מדי).';
const E_COMMA = 'פסיק עם שלוש ספרות אחריו עמום: לאלפים כתבו בלי פסיק (1500), ולעשרוני כתבו נקודה (1.502).';
const E_EXP = 'נראה שהתכוונתם לחזקה: השתמשו בלחצן ×10ⁿ, או כתבו 10^-4 (עם ^).';
const E_SIGN = 'שני סימנים רצופים (למשל --). הוסיפו סוגריים אם התכוונתם לכך.';
const E_COEF = 'חסר מספר לפני ×10. הקלידו קודם את המקדם, למשל 4×10⁻⁴.';

// תווים בלתי נראים שמגיעים מהדבקה (LRM/RLM, ZWSP, בקרות כיוון, BOM)
const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿]/g;
const MINUS_VARIANTS = /[−‐-―־﹣－]/g;
const TIMES_VARIANTS = /[×⋅·∙∗•⨯＊*]/g;

function normalize(raw) {
  let s = String(raw).replace(INVISIBLE, '').replace(/[   ]/g, ' ').trim();
  if (!s) return { error: E_EMPTY };
  // "F₂ = 1.8×10⁻⁴": קוראים את מה שאחרי ה-"=" האחרון
  s = s.replace(/[≈≅]/g, '=');
  if (s.includes('=')) s = s.slice(s.lastIndexOf('=') + 1).trim();
  if (!s) return { error: E_EMPTY };
  if ([...s].some(ch => SUB[ch] !== undefined)) return { error: E_SUB };

  // כתיב עילי: רצף תווים עיליים אחרי אופרנד הופך ל-^(...); שני סימנים בתוך המעריך נדחים
  let out = '';
  for (let i = 0; i < s.length;) {
    if (SUP[s[i]] !== undefined) {
      let run = '';
      while (i < s.length && SUP[s[i]] !== undefined) { run += SUP[s[i]]; i += 1; }
      if ((run.match(/[+-]/g) || []).length > 1) return { error: E_SIGN };
      out += `^(${run})`;
    } else { out += s[i]; i += 1; }
  }
  s = out;

  // רווחים: "4 5" או "4, 5" או "2 .5" אינם מספר אחד; הקבצה של שלוש ספרות ("90 000") כן
  if (/^[+\-−]?\d{1,3}( \d{3})+(\.\d+)?$/.test(s)) s = s.replace(/ /g, '');
  if (/\d\s+\d/.test(s) || /\d\s+[.,]/.test(s) || /[.,]\s+\d/.test(s) || /[\d.,]\s+[eE]\s*[+-]?\s*\d/.test(s)) {
    return { error: E_GENERIC };
  }

  s = s
    .replace(MINUS_VARIANTS, '-')
    .replace(TIMES_VARIANTS, '*')
    .replace(/[÷⁄∕]/g, '/')
    .replace(/\*\*/g, '^')
    .replace(/([\d)])\s*[xX]\s*(?=[\d(])/g, '$1*')
    .replace(/\s+/g, '');

  // פסיק: קבוצות של אלפים (200,000,000) מוסרות; פסיק יחיד עם 3 ספרות אחריו עמום - נדחה;
  // כל פסיק אחר הוא נקודה עשרונית (1,5)
  s = s.replace(/(^|[^\d.,])([1-9]\d{0,2}(?:,\d{3}){2,})(?![\d,])/g, (m, pre, num) => pre + num.replace(/,/g, ''));
  if (/(^|[^\d.,])[1-9]\d{0,2},\d{3}(?![\d,])/.test(s)) return { error: E_COMMA };
  if (/,/.test(s)) {
    if (/\./.test(s) || /,.*,/.test(s)) return { error: E_GENERIC };
    s = s.replace(/,/g, '.');
  }

  // חזקה שנכתבה בלי ^ ("4×10-4"): לא מנחשים, כי זה היה נקרא 36
  if (/\*10[+-]\d/.test(s)) return { error: E_EXP };
  if (/[+-]{2,}/.test(s)) return { error: E_SIGN };
  if (/^\*/.test(s)) return { error: E_COEF };
  if (/[0-9)][eE]$/.test(s)) return { error: E_GENERIC };
  // יחידה כתובה בסוף ("3mN", "5kΩ", "30°")
  if (/\d/.test(s) && /[A-Za-zμµΩΩ°%֐-׿]+$/.test(s) && !/[0-9)][eE][+-]?\d+$/.test(s)) {
    return { error: E_UNIT };
  }
  return { text: s };
}

function tokenize(s) {
  const tokens = [];
  const re = /(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([+\-*/^()])/y;
  let i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) return null;
    if (m[1] !== undefined) tokens.push({ t: 'num', v: Number(m[1]) });
    else tokens.push({ t: 'op', v: m[2] });
    i = re.lastIndex;
  }
  return tokens;
}

// expr := term (('+'|'-') term)* ; term := unary (('*'|'/') unary)* ;
// unary := ('+'|'-') unary | power ; power := atom ('^' unary)? (ימין-אסוציאטיבי)
function evaluate(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const eatOp = v => { if (peek() && peek().t === 'op' && peek().v === v) { p += 1; return true; } return false; };
  function expr() {
    let x = term();
    for (;;) {
      if (eatOp('+')) x += term();
      else if (eatOp('-')) x -= term();
      else return x;
    }
  }
  function term() {
    let x = unary();
    for (;;) {
      if (eatOp('*')) x *= unary();
      else if (eatOp('/')) x /= unary();
      else return x;
    }
  }
  function unary() {
    if (eatOp('-')) return -unary();
    if (eatOp('+')) return unary();
    return power();
  }
  function power() {
    const base = atom();
    if (eatOp('^')) return Math.pow(base, unary());
    return base;
  }
  function atom() {
    const t = peek();
    if (!t) throw new Error('eof');
    if (t.t === 'num') { p += 1; return t.v; }
    if (eatOp('(')) {
      const x = expr();
      if (!eatOp(')')) throw new Error('paren');
      return x;
    }
    throw new Error('unexpected');
  }
  const v = expr();
  if (p !== tokens.length) throw new Error('trailing');
  return v;
}

// ביטוי -> סימון בקומות (⟦מונה⁄מכנה⟧): מה שהתלמיד/ה הקלידו, כשחילוק מוצג כשבר עומד.
// null אם אין חילוק או שהביטוי לא נקרא. אותו דקדוק כמו evaluate.
export function expressionMarkup(raw) {
  const n = normalize(raw);
  if (n.error || !n.text.includes('/')) return null;
  const tokens = tokenize(n.text);
  if (!tokens || !tokens.length) return null;
  let p = 0;
  const peek = () => tokens[p];
  const eatOp = v => { if (peek() && peek().t === 'op' && peek().v === v) { p += 1; return true; } return false; };
  const wrap = nd => (nd.k === 'bin' && (nd.op === '+' || nd.op === '-') ? `(${show(nd)})` : show(nd));
  // מספר בכתיב מדעי (4×10⁻⁴) שנכפל באחר נכנס לסוגריים, כדי ש-"9×10⁹ × 2×10⁻⁸" לא יהיה מבלבל
  const wrapMul = nd => (nd.k === 'num' && formatParsed(nd.v).includes('×') ? `(${show(nd)})` : wrap(nd));
  const strip = nd => (nd.k === 'paren' ? show(nd.e) : show(nd));
  const supText = digits => String(digits).split('').map(c => TO_SUP[c] || c).join('');
  function show(nd) {
    switch (nd.k) {
      case 'num': return formatParsed(nd.v);
      case 'neg': return `−${wrap(nd.e)}`;
      case 'paren': return `(${show(nd.e)})`;
      case 'bin':
        if (nd.op === '/') return `⟦${strip(nd.l)}⁄${strip(nd.r)}⟧`;
        if (nd.op === '*') return `${wrapMul(nd.l)} × ${wrapMul(nd.r)}`;
        if (nd.op === '^') {
          const base = (nd.l.k === 'num' || nd.l.k === 'paren') ? show(nd.l) : `(${show(nd.l)})`;
          const e = nd.r;
          if (e.k === 'num' && Number.isInteger(e.v) && e.v >= 0) return base + supText(e.v);
          if (e.k === 'neg' && e.e.k === 'num' && Number.isInteger(e.e.v) && e.e.v >= 0) return `${base}⁻${supText(e.e.v)}`;
          return `${base}^(${show(e)})`;
        }
        return `${show(nd.l)} ${nd.op === '-' ? '−' : '+'} ${show(nd.r)}`;
      default: return '';
    }
  }
  function expr() {
    let x = term();
    for (;;) {
      if (eatOp('+')) x = { k: 'bin', op: '+', l: x, r: term() };
      else if (eatOp('-')) x = { k: 'bin', op: '-', l: x, r: term() };
      else return x;
    }
  }
  function term() {
    let x = unary();
    for (;;) {
      if (eatOp('*')) x = { k: 'bin', op: '*', l: x, r: unary() };
      else if (eatOp('/')) x = { k: 'bin', op: '/', l: x, r: unary() };
      else return x;
    }
  }
  function unary() {
    if (eatOp('-')) return { k: 'neg', e: unary() };
    if (eatOp('+')) return unary();
    return power();
  }
  function power() {
    const base = atom();
    if (eatOp('^')) return { k: 'bin', op: '^', l: base, r: unary() };
    return base;
  }
  function atom() {
    const tk = peek();
    if (!tk) throw new Error('eof');
    if (tk.t === 'num') { p += 1; return { k: 'num', v: tk.v }; }
    if (eatOp('(')) {
      const x = expr();
      if (!eatOp(')')) throw new Error('paren');
      return { k: 'paren', e: x };
    }
    throw new Error('unexpected');
  }
  try {
    const tree = expr();
    if (p !== tokens.length) return null;
    return show(tree);
  } catch (e) { return null; }
}

export function parseAnswer(raw) {
  const n = normalize(raw);
  if (n.error) return { ok: false, error: n.error };
  const tokens = tokenize(n.text);
  if (!tokens || !tokens.length) return { ok: false, error: E_GENERIC };
  let v;
  try { v = evaluate(tokens); } catch (e) { return { ok: false, error: E_GENERIC }; }
  if (!Number.isFinite(v)) return { ok: false, error: E_RANGE };
  // רעש נקודה צפה (0.07×10² = 7.000000000000001) נמחק, כדי שהשוואות === יעבדו על ביטוי נכון מתמטית
  const snapped = Number(v.toPrecision(15));
  return { ok: true, value: Number.isFinite(snapped) ? snapped : v };
}

/** מספר לתצוגה: עד 6 ספרות משמעותיות; קטן/גדול מאוד בכתיב ×10ⁿ. */
export function formatParsed(x) {
  if (x === 0) return '0';
  const a = Math.abs(x);
  const sign = x < 0 ? '−' : '';
  if (a < 0.001 || Number(a.toPrecision(6)) >= 1e6) {
    const [mant, exp] = a.toExponential(5).split('e');
    const e = String(parseInt(exp, 10)).split('').map(c => TO_SUP[c] || c).join('');
    return `${sign}${Number(mant)}×10${e}`;
  }
  return `${sign}${Number(a.toPrecision(6))}`;
}

// ביטוי לא גמור (אופרטור/סוגר פתוח/חזקה חסרה): בזמן הקלדה לא מציגים שגיאה
function looksIncomplete(raw) {
  const t = raw.replace(INVISIBLE, '').trim();
  if (!t) return false;
  if (/[+\-−*×÷/^(=,.·]$/.test(t) || /[eE]$/.test(t)) return true;
  if (/\(\s*\)/.test(t)) return true;
  const open = (t.match(/\(/g) || []).length;
  const close = (t.match(/\)/g) || []).length;
  if (open > close) return true;
  if (/[*×·]\s*10$/.test(t)) return true;
  return /^[*×·]/.test(t) && t.replace(/[*×·\s]/g, '').length < 3;
}

// ---------------------------------------------------------------- סרגל הלחצנים
function insertAtCaret(input, text, caretOffset, focus = true) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(text, start, end, 'end');
  if (typeof caretOffset === 'number') {
    const pos = start + caretOffset;
    input.setSelectionRange(pos, pos);
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (focus) input.focus();
}

export function mountAnswerToolbar(input, host) {
  if (!input || !host) return null;
  const state = { mode: null }; // null | 'sup' | 'sub'

  const bar = document.createElement('div');
  bar.className = 'ans-tools';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'כלי כתיב לתשובה');

  const preview = document.createElement('div');
  preview.className = 'ans-preview';
  preview.id = 'ans-preview';
  preview.setAttribute('aria-live', 'polite');

  const buttons = {};
  const order = [];
  // onClick(focusInput): focusInput=false בהפעלה במקלדת - הפוקוס נשאר על הלחצן
  function addKey(id, label, title, onClick, toggle = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ans-key';
    b.dataset.key = id;
    if (id === 'frac') {                       // פני הלחצן: שבר עומד (a מעל b), לא a/b
      b.innerHTML = '<span class="mfrac" dir="ltr" aria-hidden="true"><span class="mfn">a</span><span class="mfd">b</span></span>';
    } else {
      b.textContent = label;
    }
    b.title = title;
    b.setAttribute('aria-label', `${id === 'frac' ? 'שבר' : label} ${title}`);
    b.tabIndex = order.length === 0 ? 0 : -1;
    if (toggle) b.setAttribute('aria-pressed', 'false');
    // לא גונבים פוקוס/סמן מהשדה בלחיצת עכבר/מגע
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', e => onClick(e.detail !== 0));
    bar.appendChild(b);
    buttons[id] = b;
    order.push(b);
    return b;
  }
  function setMode(mode, focus = true) {
    state.mode = mode;
    buttons.sup.setAttribute('aria-pressed', String(mode === 'sup'));
    buttons.sub.setAttribute('aria-pressed', String(mode === 'sub'));
    if (focus) input.focus();
  }
  // לחצני אופרטור יוצאים ממצב עילי/תחתי (אחרת "÷" ואז "2" ייכתבו כ-÷²)
  const op = (text, caret) => focus => { setMode(null, false); insertAtCaret(input, text, caret, focus); };

  addKey('mul', '×', 'כפל', op('×'));
  addKey('div', '÷', 'חילוק', op('÷'));
  addKey('frac', 'a/b', 'שבר: מונה ומכנה', focus => {
    setMode(null, false);
    const s = input.selectionStart ?? 0, e = input.selectionEnd ?? s;
    const sel = input.value.slice(s, e);
    if (sel) { insertAtCaret(input, `(${sel})/()`, sel.length + 4, focus); return; }   // הסמן במכנה
    if (input.value.trim() && s === input.value.length) {                               // כל מה שנכתב הופך למונה
      input.setRangeText(`(${input.value})/()`, 0, input.value.length, 'end');
      const pos = input.value.length - 1;
      input.setSelectionRange(pos, pos);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (focus) input.focus();
      return;
    }
    insertAtCaret(input, '()/()', 1, focus);                                           // הסמן במונה
  });
  addKey('pow', 'xⁿ', 'חזקה (^)', op('^'));
  addKey('sci', '×10ⁿ', 'כתיב מדעי: ×10 ואחריו מעריך', focus => {
    insertAtCaret(input, '×10', undefined, focus);
    setMode('sup', focus);
  });
  addKey('sup', 'x²', 'כתיב עילי (מעריך): הספרות והסימן הבאים נכתבים למעלה', focus => setMode(state.mode === 'sup' ? null : 'sup', focus), true);
  addKey('sub', 'x₂', 'כתיב תחתי: הספרות הבאות נכתבות למטה (לפני "=" בלבד)', focus => setMode(state.mode === 'sub' ? null : 'sub', focus), true);
  addKey('neg', '−', 'סימן מינוס', focus => insertAtCaret(input, state.mode === 'sup' ? '⁻' : state.mode === 'sub' ? '₋' : '−', undefined, focus));
  addKey('par', '( )', 'סוגריים', focus => {
    setMode(null, false);
    const s = input.selectionStart ?? 0, e = input.selectionEnd ?? s;
    const sel = input.value.slice(s, e);
    if (sel) insertAtCaret(input, `(${sel})`, sel.length + 2, focus);
    else insertAtCaret(input, '()', 1, focus);
  });
  addKey('clr', 'נקה', 'ניקוי השדה', focus => {
    input.value = '';
    setMode(null, false);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (focus) input.focus();
  });
  buttons.clr.classList.add('danger');

  // ניווט בחיצים בתוך הסרגל (עצירת Tab אחת): בעברית החץ השמאלי מתקדם
  bar.addEventListener('keydown', e => {
    const i = order.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowLeft') j = Math.min(order.length - 1, i + 1);
    else if (e.key === 'ArrowRight') j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = order.length - 1;
    if (j === null) return;
    e.preventDefault();
    order.forEach((b, k) => { b.tabIndex = k === j ? 0 : -1; });
    order[j].focus();
  });

  // במצב עילי/תחתי ספרות וסימנים שמוקלדים מומרים לתווים העיליים/התחתיים; כל תו אחר מכבה את המצב.
  // data יכול להיות כמה תווים בבת אחת (הדבקה, מקלדת וירטואלית): מומר רק אם כולם ספרות/סימן.
  input.addEventListener('beforeinput', e => {
    if (!state.mode) return;
    if (e.inputType !== 'insertText' && e.inputType !== 'insertCompositionText') {
      if (e.inputType && e.inputType.startsWith('insertFrom')) setMode(null, false); // הדבקה/גרירה
      return;
    }
    if (!e.data) return;
    const table = state.mode === 'sup' ? TO_SUP : TO_SUB;
    const chars = [...e.data].map(c => (c === '−' ? '-' : c));
    if (chars.every(c => table[c] !== undefined)) {
      e.preventDefault();
      insertAtCaret(input, chars.map(c => table[c]).join(''));
    } else {
      setMode(null, false);
    }
  });

  // גיבוי למקלדות שלא מפעילות beforeinput לפני הוספה: ממירים בדיעבד את מה שנוסף
  let prev = { value: input.value };
  function afterInput() {
    if (state.mode && input.value.length > prev.value.length) {
      const added = input.value.length - prev.value.length;
      const pos = input.selectionStart ?? input.value.length;
      const seg = input.value.slice(pos - added, pos);
      if (/^[0-9+\-−]+$/.test(seg)) {
        const table = state.mode === 'sup' ? TO_SUP : TO_SUB;
        const conv = [...seg].map(c => table[c === '−' ? '-' : c]).join('');
        input.setRangeText(conv, pos - added, pos, 'end');
      }
    }
    prev = { value: input.value };
  }

  function refreshPreview() {
    afterInput();
    const raw = input.value;
    if (!raw.trim()) { preview.textContent = ''; preview.className = 'ans-preview'; return; }
    const r = parseAnswer(raw);
    if (r.ok) {
      preview.className = 'ans-preview ok';
      const num = document.createElement('bdi');
      num.setAttribute('dir', 'ltr');
      // חילוק מוצג בקומות: "⟦3⁄4⟧ = 0.75"; בלי חילוק - רק הערך, כמו קודם
      const shown = expressionMarkup(raw);
      if (shown) num.appendChild(mathFragment(`${shown} = ${formatParsed(r.value)}`));
      else num.textContent = formatParsed(r.value);
      preview.replaceChildren(document.createTextNode('נקרא כ: '), num);
    } else if (looksIncomplete(raw)) {
      preview.className = 'ans-preview';        // באמצע כתיבה - בלי שגיאה
      preview.textContent = '';
    } else {
      preview.className = 'ans-preview bad';
      preview.textContent = r.error;
    }
  }
  input.addEventListener('input', refreshPreview);

  host.appendChild(bar);
  host.appendChild(preview);

  return {
    disable() {
      Object.values(buttons).forEach(b => { b.disabled = true; });
    },
    refresh: refreshPreview,
  };
}
