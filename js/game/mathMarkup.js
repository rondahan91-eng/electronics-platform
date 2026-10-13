// ==========================================================================
// mathMarkup.js - כתיב "בקומות" (שבר עומד) לחילוק, בטקסטים של שלבים, רמזים ונוסחאות.
//
// הסימון בטקסט (במקום "/" כסימן חילוק):   ⟦מונה⁄מכנה⟧
//   ⟦ = U+27E6   ⁄ = U+2044 (FRACTION SLASH, לא "/")   ⟧ = U+27E7
// אפשר לשלב שבר בתוך מונה או מכנה, ושבר בתוך סוגריים וחזקה: (⟦r₁⁄r₂⟧)².
// יחידות מידה (N/C, m/s², N·m²/C²) אינן פעולת חילוק בנוסחה ונשארות בכתיב רגיל.
//
// שלושה שימושים:
//   mathHtml(str)      -> מחרוזת HTML (שאר ה-HTML שבטקסט נשאר כפי שהוא) - להזרקה ב-innerHTML
//   mathFragment(str)  -> DocumentFragment (טקסט + span לשבר) - לבניית DOM בלי innerHTML
//   mathPlain(str)     -> טקסט רגיל "מונה / מכנה" - לכותרות, aria-label ופיסות טקסט בלבד
// שבר שלא נסגר כראוי (חסר ⟧ או ⁄) נשאר טקסט כמו שהוא, כך שאין "נפילה" של מסך.
// ==========================================================================
export const FR_OPEN = '⟦';
export const FR_CLOSE = '⟧';
export const FR_SEP = '⁄';

function parseFrac(s, i) {            // i = האינדקס שאחרי ⟦
  const num = parseSeq(s, i, FR_SEP);
  if (!num) return null;
  const den = parseSeq(s, num.next, FR_CLOSE);
  if (!den) return null;
  return { node: { num: num.nodes, den: den.nodes }, next: den.next };
}

// קורא עד תו העצירה (stop) ברמת הקינון הנוכחית; stop = null: עד סוף המחרוזת.
function parseSeq(s, i, stop) {
  const nodes = [];
  let buf = '';
  while (i < s.length) {
    const ch = s[i];
    if (stop && ch === stop) {
      if (buf) nodes.push(buf);
      return { nodes, next: i + 1 };
    }
    if (ch === FR_OPEN) {
      const r = parseFrac(s, i + 1);
      if (r) {
        if (buf) { nodes.push(buf); buf = ''; }
        nodes.push(r.node);
        i = r.next;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  if (stop) return null;               // לא נסגר
  if (buf) nodes.push(buf);
  return { nodes, next: i };
}

function parseMath(str) {
  const r = parseSeq(String(str == null ? '' : str), 0, null);
  return r ? r.nodes : [String(str)];
}

export function hasMath(str) {
  return typeof str === 'string' && str.includes(FR_OPEN) && str.includes(FR_SEP);
}

function toHtml(nodes) {
  return nodes.map(n => (typeof n === 'string'
    ? n
    : `<span class="mfrac" dir="ltr"><span class="mfn">${toHtml(n.num).trim()}</span><span class="mfd">${toHtml(n.den).trim()}</span></span>`)).join('');
}

// ---- בידוד כיווניות. שבר הוא אובייקט "ניטרלי" בעיני אלגוריתם ה-bidi: בלי מעטפת, בתוך פסקה עברית
// הנוסחה "Q = ⟦…⟧" הייתה מוצגת בסדר הפוך. לכן כל רצף של מילים לטיניות/מספרים (בלי עברית)
// שמכיל שבר נעטף ב-<span dir="ltr"> (איזולט), וסימני פיסוק בקצותיו נשארים בחוץ.
const HEB = /[֐-׿]/;
const TAGLIKE = /<\/?[A-Za-z]|="[^"]*"?>?|\/>/;     // חלק מתג HTML: לא נוגעים

function chunkify(nodes) {
  const out = [];
  let cur = null;
  const push = () => { if (cur) { out.push(cur); cur = null; } };
  const fresh = () => ({ ws: false, parts: [], heb: false, frac: false });
  nodes.forEach(n => {
    if (typeof n !== 'string') {
      if (!cur) cur = fresh();
      cur.parts.push(n);
      cur.frac = true;
      return;
    }
    (n.match(/\s+|\S+/g) || []).forEach(piece => {
      if (/^\s+$/.test(piece)) { push(); out.push({ ws: true, text: piece }); return; }
      if (!cur) cur = fresh();
      cur.parts.push(piece);
      if (HEB.test(piece) || TAGLIKE.test(piece)) cur.heb = true;
    });
  });
  push();
  return out;
}

function groupRuns(chunks) {
  const segs = [];
  let i = 0;
  while (i < chunks.length) {
    const c = chunks[i];
    if (c.ws || c.heb) { segs.push({ wrap: false, items: [c] }); i += 1; continue; }
    const items = [c];
    let j = i;
    while (j + 2 < chunks.length && chunks[j + 1].ws && !chunks[j + 2].heb) {
      items.push(chunks[j + 1], chunks[j + 2]);
      j += 2;
    }
    segs.push({ wrap: items.some(x => !x.ws && x.frac), items });
    i = j + 1;
  }
  return segs;
}

// מחזיר {pre, items, post}: פיסוק בתחילת/סוף הרצף יוצא מחוץ לאיזולט
function trimPunct(items) {
  let pre = '';
  let post = '';
  const first = items[0];
  const last = items[items.length - 1];
  if (first && first.parts.length && typeof first.parts[0] === 'string') {
    const m = first.parts[0].match(/^[,.;:!?]+/);
    if (m && first.parts[0].length > m[0].length) { pre = m[0]; first.parts[0] = first.parts[0].slice(m[0].length); }
  }
  if (last && last.parts.length && typeof last.parts[last.parts.length - 1] === 'string') {
    const k = last.parts.length - 1;
    const m = last.parts[k].match(/[,.;:!?]+$/);
    if (m && last.parts[k].length > m[0].length) { post = m[0]; last.parts[k] = last.parts[k].slice(0, -m[0].length); }
    else if (m && last.parts[k].length === m[0].length && k > 0) { post = m[0]; last.parts.pop(); }
  }
  return { pre, post };
}

function itemsHtml(items) {
  return items.map(c => (c.ws ? c.text : c.parts.map(p => (typeof p === 'string' ? p : toHtml([p]))).join(''))).join('');
}

function topHtml(nodes) {
  if (!nodes.some(n => typeof n !== 'string')) return nodes.join('');
  return groupRuns(chunkify(nodes)).map(seg => {
    if (!seg.wrap) return itemsHtml(seg.items);
    const { pre, post } = trimPunct(seg.items);
    return `${pre}<span class="mexpr" dir="ltr">${itemsHtml(seg.items)}</span>${post}`;
  }).join('');
}

export function mathHtml(str) {
  if (!hasMath(str)) return str == null ? '' : String(str);
  return topHtml(parseMath(str));
}

export function mathFragment(str, doc = document) {
  // אותה בניית איזולטים כמו mathHtml: בונים HTML ומפענחים ל-DOM (הטקסט כאן הוא נוסחאות/הערות, לא קלט משתמש)
  const tpl = doc.createElement('template');
  tpl.innerHTML = mathHtml(str);
  return tpl.content;
}

const NEEDS_PARENS = /[\s+\-−·×*=]/;
function toPlain(nodes) {
  return nodes.map(n => {
    if (typeof n === 'string') return n;
    const a = toPlain(n.num).trim();
    const b = toPlain(n.den).trim();
    return `${NEEDS_PARENS.test(a) ? `(${a})` : a} / ${NEEDS_PARENS.test(b) ? `(${b})` : b}`;
  }).join('');
}

export function mathPlain(str) {
  return hasMath(str) ? toPlain(parseMath(str)) : (str == null ? '' : String(str));
}
