// ==========================================================================
// currentRenderer.js - "זרם חשמלי". שני מנגנוני רינדור, לפי level.world.type:
//  - 'direct' find:'I' - תיל עם חתך רוחב מסומן: Q,t נתונים תמיד, זרימת
//    מטען+קריאה נחשפות רק אחרי בדיקה (I הוא התשובה - בלי רמז לפני).
//  - 'direct' find:'Q' - אותו תיל, אבל I,t הם הנתונים (ולכן זרימת המטען
//    *גלויה תמיד* בקצב הקבוע של I - זה נתון, לא תשובה); רק קריאת ה-Q
//    (התשובה) מוסתרת עד הבדיקה, ואינה משפיעה על קצב הזרימה עצמו.
//  - 'direction' - תיל בין שני הדקים A/B: זרימת אלקטרונים (בפועל) גלויה
//    תמיד (זה נתון), וזרם מוסכם (התשובה) נחשף רק אחרי בדיקה, זורם בכיוון
//    הנגזר מסימן הערך שהוזן (חיובי=A→B, שלילי=B→A).
// בכל המקרים - בלי רמזים לפני בדיקה לגבי *התשובה* עצמה, ואחרי בדיקה
// הקריאה/הצבע (ובמקרה של find:'I'/'direction' גם קצב/כיוון הזרימה) משקפים
// את הערך שהוזן בפועל, לא רק את התשובה הנכונה.
// ==========================================================================
import { GLOW_FILTERS, labeledText } from './svgUtils.js';

const W = 640, H = 300;

const dirArrowText = (dir) => (dir === 'AtoB' ? 'A → B' : 'B → A');

/** זרם חבילות מטען חוצות את התיל, בקצב שנגזר מהיחס בין val לגודל-ייחוס -
 * ערך גבוה מדי → זרם צפוף ומהיר בלתי-סביר, נמוך מדי → זורם באיטיות.
 * reverse=true הופך את כיוון הזרימה החזותי (למשל כשהערך שהוזן שלילי). */
function chargeStream(x1, x2, y, val, refAbs, color, reverse = false) {
  const path = reverse ? `M${x2},${y} L${x1},${y}` : `M${x1},${y} L${x2},${y}`;
  const ratio = refAbs > 0 ? Math.abs(val) / refAbs : Math.abs(val);
  const speed = Math.max(0.15, Math.min(ratio || 0.15, 6));
  const dur = Math.max(0.35, Math.min(2.6 / speed, 6));
  const stagger = Math.max(0.08, Math.min(dur / 4, 1.1));
  const n = 6;
  return Array.from({ length: n }).map((_, i) => `
    <circle r="6.5" fill="${color}" filter="url(#dotglow)">
      <animateMotion dur="${dur.toFixed(2)}s" begin="${(i * stagger).toFixed(2)}s" repeatCount="indefinite"
        path="${path}"/>
    </circle>`).join('');
}

function burnBurst(x, y) {
  return `
    <circle cx="${x}" cy="${y}" r="8" fill="#ffb020">
      <animate attributeName="r" from="8" to="50" dur="0.5s" fill="freeze"/>
      <animate attributeName="opacity" from="0.9" to="0" dur="0.5s" fill="freeze"/>
    </circle>
    ${[0, 1, 2, 3, 4].map(i => `<circle cx="${x + (i - 2) * 10}" cy="${y}" r="4" fill="#9aa3b5">
      <animate attributeName="cy" from="${y}" to="${y - 30 - i * 6}" dur="0.75s" fill="freeze"/>
      <animate attributeName="opacity" from="0.85" to="0" dur="0.75s" fill="freeze"/>
    </circle>`).join('')}
  `;
}

/** קריאה מספרית (I או Q) - מוצגת *רק* אחרי בדיקה (value != null), אין רמז
 * חי לפני זה. symbol קובע איזה גודל מוצג (I=אמפרמטר, Q=מונה מטען). */
function readoutGlyph(value, unit, color, symbol = 'I', dirText = null) {
  if (value == null) return '';
  const label = dirText ? `${symbol} = ${value}${unit}  (${dirText})` : `${symbol} = ${value}${unit}`;
  const boxW = dirText ? 200 : 130;
  return `<g id="readout">
    <rect x="${W / 2 - boxW / 2}" y="26" width="${boxW}" height="40" rx="10" fill="#080b16" fill-opacity="0.86" stroke="var(--line)"/>
    <text x="${W / 2}" y="52" text-anchor="middle" font-size="${dirText ? 16 : 19}" font-weight="900" fill="${color}">${label}</text>
  </g>`;
}

// -------------------------------------------------------- שלב 'direct'
const WIRE_Y = 160;
const X1 = 70, X2 = 570;
const XS_X = 340; // מיקום חתך הרוחב המסומן על התיל

function wireBase(burnt) {
  const color = burnt ? 'var(--red)' : 'var(--line)';
  return `<line x1="${X1}" y1="${WIRE_Y}" x2="${X2}" y2="${WIRE_Y}" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`;
}

function crossSectionMark(burnt) {
  const color = burnt ? 'var(--red)' : 'var(--text-1)';
  return `
    <line x1="${XS_X}" y1="${WIRE_Y - 44}" x2="${XS_X}" y2="${WIRE_Y + 44}" stroke="${color}" stroke-width="2" stroke-dasharray="5,5"/>
    ${labeledText(XS_X, WIRE_Y - 56, 'חתך A', 'comp-label')}
  `;
}

function givenLabels(level) {
  const { t, I, Q, context } = level.world;
  const find = level.question.find;
  // מה שנתון (לא התשובה) תמיד גלוי - שני הגדלים האחרים מתוך {I,Q,t}.
  const [firstLabel, secondLabel] = find === 'Q' ? [`I = ${I}A`, `t = ${t} שנ'`]
    : find === 't' ? [`I = ${I}A`, `Q = ${Q}C`]
      : [`Q = ${Q}C`, `t = ${t} שנ'`];
  return `
    ${labeledText(X1 + 6, WIRE_Y + 48, firstLabel, 'comp-val', { anchor: 'start' })}
    ${labeledText(X1 + 6, WIRE_Y + 68, secondLabel, 'comp-val', { anchor: 'start' })}
    ${labeledText(X2 - 6, WIRE_Y - 58, context, 'comp-val', { anchor: 'end', fontSize: 11 })}
  `;
}

function buildScene(level, opts = {}) {
  const { I } = level.world;
  const find = level.question.find;
  const { readoutValue = null, readoutColor = 'var(--cyan)', flowVal = null, burnt = false } = opts;
  const out = [
    `<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`,
    wireBase(burnt),
    crossSectionMark(burnt),
    givenLabels(level),
  ];
  if (!burnt) {
    if (find === 'Q' || find === 't') {
      // I הוא נתון (לא תשובה) בשני המקרים - הזרימה גלויה תמיד בקצב הקבוע
      // שלו, ולא מושפעת מהערך שהתלמיד/ה מזינים (Q או t, לא קצב).
      out.push(chargeStream(X1 + 14, X2 - 14, WIRE_Y, I, Math.abs(I), 'var(--cyan)'));
    } else if (flowVal != null) {
      out.push(chargeStream(X1 + 14, X2 - 14, WIRE_Y, flowVal, Math.abs(level.question.answer), readoutColor));
    }
  }
  if (burnt) out.push(burnBurst(XS_X, WIRE_Y));
  const symbol = find === 'Q' ? 'Q' : (find === 't' ? 't' : 'I');
  out.push(readoutGlyph(readoutValue, level.question.unit, readoutColor, symbol));

  return `
  <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>${GLOW_FILTERS}</defs>
    ${out.join('\n')}
  </svg>`;
}

// -------------------------------------------------------- שלב 'direction'
const DIR_WIRE_Y = 190;
const DIR_X1 = 110, DIR_X2 = 530;
const DIR_ELECTRON_Y = DIR_WIRE_Y - 60;

function directionWireBase(burnt) {
  const color = burnt ? 'var(--red)' : 'var(--line)';
  return `<line x1="${DIR_X1}" y1="${DIR_WIRE_Y}" x2="${DIR_X2}" y2="${DIR_WIRE_Y}" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`;
}

function terminalMarkers() {
  return `
    <circle cx="${DIR_X1}" cy="${DIR_WIRE_Y}" r="6" fill="#e8ecff"/>
    <circle cx="${DIR_X2}" cy="${DIR_WIRE_Y}" r="6" fill="#e8ecff"/>
    ${labeledText(DIR_X1, DIR_WIRE_Y + 30, 'A', 'comp-label')}
    ${labeledText(DIR_X2, DIR_WIRE_Y + 30, 'B', 'comp-label')}
  `;
}

/** זרימת האלקטרונים בפועל - נתון קבוע של השלב, גלוי תמיד (גם לפני בדיקה),
 * בדיוק כמו תוויות Q/t - זו לא רמז לתשובה (שהיא כיוון ה*זרם המוסכם*, ההפוך). */
function electronStream(x1, x2, y, dir, color) {
  const path = dir === 'BtoA' ? `M${x2},${y} L${x1},${y}` : `M${x1},${y} L${x2},${y}`;
  const n = 5, dur = 1.7, stagger = 0.34;
  return Array.from({ length: n }).map((_, i) => `
    <circle r="6" fill="${color}" fill-opacity="0.88">
      <animateMotion dur="${dur}s" begin="${(i * stagger).toFixed(2)}s" repeatCount="indefinite" path="${path}"/>
    </circle>`).join('');
}

function buildDirectionScene(level, opts = {}) {
  const { Q, t, context, electronDir } = level.world;
  const { readoutValue = null, readoutColor = 'var(--cyan)', flowVal = null, dirText = null, burnt = false } = opts;
  const out = [
    `<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`,
    directionWireBase(burnt),
    terminalMarkers(),
    labeledText((DIR_X1 + DIR_X2) / 2, DIR_ELECTRON_Y - 16, `אלקטרונים (בפועל): ${dirArrowText(electronDir)}`, 'comp-label'),
    labeledText(DIR_X1 + 6, DIR_WIRE_Y + 50, `Q = ${Q}C`, 'comp-val', { anchor: 'start' }),
    labeledText(DIR_X1 + 6, DIR_WIRE_Y + 70, `t = ${t} שנ'`, 'comp-val', { anchor: 'start' }),
    labeledText(DIR_X2 - 6, DIR_WIRE_Y + 50, context, 'comp-val', { anchor: 'end', fontSize: 10 }),
  ];
  if (!burnt) out.push(electronStream(DIR_X1 + 20, DIR_X2 - 20, DIR_ELECTRON_Y, electronDir, 'var(--violet)'));
  if (flowVal != null && !burnt) {
    out.push(chargeStream(DIR_X1 + 14, DIR_X2 - 14, DIR_WIRE_Y, flowVal, Math.abs(level.question.answer), readoutColor, flowVal < 0));
  }
  if (burnt) out.push(burnBurst((DIR_X1 + DIR_X2) / 2, DIR_WIRE_Y));
  out.push(readoutGlyph(readoutValue, level.question.unit, readoutColor, 'I', dirText));

  return `
  <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>${GLOW_FILTERS}</defs>
    ${out.join('\n')}
  </svg>`;
}

// -------------------------------------------------------------- ייצוא (חוזה)
export function renderCurrent(level, energized = false) {
  const q = level.question;
  if (level.world.type === 'direction') {
    if (!energized) return { svg: buildDirectionScene(level), width: W, height: H };
    const svg = buildDirectionScene(level, {
      readoutValue: Math.abs(q.answer), readoutColor: 'var(--green)',
      flowVal: q.answer, dirText: dirArrowText(q.currentDir),
    });
    return { svg, width: W, height: H };
  }
  if (q.find === 'Q' || q.find === 't') {
    if (!energized) return { svg: buildScene(level), width: W, height: H };
    const svg = buildScene(level, { readoutValue: q.answer, readoutColor: 'var(--green)' });
    return { svg, width: W, height: H };
  }
  if (!energized) return { svg: buildScene(level), width: W, height: H };
  const svg = buildScene(level, { readoutValue: q.answer, readoutColor: 'var(--green)', flowVal: q.answer });
  return { svg, width: W, height: H };
}

export function clearCurrentMarks() {} // כל בדיקה מרנדרת מחדש את כל הזירה - אין overlay נפרד לניקוי

/** תשובה שגויה "רגילה" - הקריאה (ובמקרה של find:'I'/'direction' גם קצב/כיוון
 * הזרימה) משקפים את הערך שהוזן בפועל. */
export function animateCurrentIncorrect(stageEl, level, result) {
  const val = result.value;
  const q = level.question;
  if (level.world.type === 'direction') {
    const displayVal = Math.round(Math.abs(val) * 1000) / 1000;
    const dirText = dirArrowText(val < 0 ? 'BtoA' : 'AtoB');
    stageEl.innerHTML = buildDirectionScene(level, { readoutValue: displayVal, readoutColor: 'var(--amber)', flowVal: val, dirText });
  } else if (q.find === 'Q' || q.find === 't') {
    const displayVal = Math.round(val * 1000) / 1000;
    stageEl.innerHTML = buildScene(level, { readoutValue: displayVal, readoutColor: 'var(--amber)' });
  } else {
    const displayVal = Math.round(Math.abs(val) * 1000) / 1000;
    stageEl.innerHTML = buildScene(level, { readoutValue: displayVal, readoutColor: 'var(--amber)', flowVal: val });
  }
  stageEl.classList.remove('shake'); void stageEl.offsetWidth; stageEl.classList.add('shake');
}

/** פסילה - "קצר חשמלי": פיצוץ ניצוצות בתיל, שהופך לאדום ונשרף (רלוונטי רק
 * ל-find:'I' ול-'direction' - לא ל-find:'Q', ראו currentLevelGenerator.js). */
export function triggerCurrentDisqualifyAnimation(stageEl, level, result) {
  const displayVal = Math.round(Math.abs(result.value) * 1000) / 1000;
  if (level.world.type === 'direction') {
    stageEl.innerHTML = buildDirectionScene(level, { readoutValue: displayVal, readoutColor: 'var(--red)', burnt: true });
  } else {
    stageEl.innerHTML = buildScene(level, { readoutValue: displayVal, readoutColor: 'var(--red)', burnt: true });
  }
  stageEl.classList.remove('shake'); void stageEl.offsetWidth; stageEl.classList.add('shake');
}
