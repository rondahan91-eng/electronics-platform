// ==========================================================================
// digitalNumbersRenderer.js - "שיטות ספירה". סצנה אחת עקבית ("לוח רגיסטר",
// PCB כהה) לכל 5 תת-הנושאים, בנויה על שני צירים בלתי-תלויים:
//  - צורה = זהות האלף-בית: עיגול "נורית LED" = ביט בודד (מלא=1, חלול=0);
//    מלבן מעוגל "שבב-ספרה" עם גליף = ספרה עשרונית/הקסדצימלית.
//  - צבע = מצב הבדיקה (זהה בכל אלף-בית, אף פעם לא צבע-לפי-תוכן): נתון
//    (גלוי תמיד)=--px-sky; נעלם (לפני בדיקה)=אפור-רשת בלי גליף; אחרי
//    energized=true=--px-brand-bright+glow; שגוי רגיל=--px-amber (משקף את
//    מה שהוזן בפועל - כולל תאים חסרים/עודפים אם האורך שגוי); פסילה=
//    --px-coral.
// "given" (מה שנתון, לא התשובה) גלוי תמיד; "answer" (התשובה) מוסתר לגמרי
// עד בדיקה - אותו עיקרון בדיוק כמו currentRenderer.js/voltageSourceRenderer.js.
// ==========================================================================
import { GLOW_FILTERS, labeledText } from './svgUtils.js';

const W = 640, H = 300;

const COLOR = {
  given: 'var(--px-sky)',
  correct: 'var(--px-brand-bright)',
  incorrect: 'var(--px-amber)',
  disqualified: 'var(--px-coral)',
};

function outcomeColor(outcome) {
  if (outcome === 'correct') return COLOR.correct;
  if (outcome === 'incorrect') return COLOR.incorrect;
  if (outcome === 'disqualified') return COLOR.disqualified;
  return 'var(--px-brand-bright)';
}

const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const supPow = p => String(p).split('').map(d => SUP[+d]).join('');
const bcdDigits = bits => (bits.match(/.{4}/g) || []).map(nb => parseInt(nb, 2));

function twosComplementOf(n, width) {
  const positiveBin = Math.abs(n).toString(2).padStart(width, '0');
  const ones = positiveBin.split('').map(b => (b === '0' ? '1' : '0')).join('');
  let carry = 1;
  const bits = ones.split('').map(Number);
  for (let i = bits.length - 1; i >= 0 && carry; i--) { const s = bits[i] + carry; bits[i] = s % 2; carry = Math.floor(s / 2); }
  return bits.join('');
}

/** מפרק מחרוזת-תשובה שהוזנה בפועל (entered) ביחס לרוחב הרגיסטר (width):
 * תווים חסרים (entered קצר מדי) → "missing" בתוך גבול הרגיסטר; תווים
 * עודפים (entered ארוך מדי) → "extra" מחוץ לגבול, משמאל ל-MSB. מוחזר
 * left→right (המקום הגבוה ביותר קודם), תואם את כיוון תוויות המשקל. */
function analyzeCells(entered, width) {
  const chars = String(entered).split('');
  const n = Math.max(chars.length, width);
  const cells = [];
  for (let p = n - 1; p >= 0; p--) {
    const charIdx = chars.length - 1 - p;
    const ch = charIdx >= 0 ? chars[charIdx] : null;
    const inRegister = p < width;
    cells.push({ position: p, char: ch, missing: inRegister && ch === null, extra: !inRegister && ch !== null });
  }
  return cells;
}

function cellState(cell, outcome) {
  if (cell.missing) return 'missing';
  if (cell.extra) return outcome; // צבע התוצאה עצמה - קורל שמור בלעדית לפסילה (outcome==='disqualified')
  return outcome;
}

/** x של מקום (position, משקל 2^position) בתוך רגיסטר שעוגן ב-startX/pitch -
 * מקומות מעבר לרוחב הרגיסטר (position>=width, "עודף") יוצאים שמאלה מחוצה
 * לו באופן טבעי (ערך שלילי יחסית ל-startX). */
function posX(position, width, startX, pitch) { return startX + ((width - 1) - position) * pitch; }

function drawCell(cx, cy, shape, state, char) {
  if (shape === 'bit') {
    const r = 15;
    if (state === 'hidden') {
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--px-schem-grid)" stroke="var(--px-schem-border)" stroke-width="2"/>`;
    }
    if (state === 'missing') {
      return `<circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="none" stroke="var(--px-ink-inverse-soft)" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.55"/>`;
    }
    const color = COLOR[state] || COLOR.incorrect;
    const glow = state === 'correct' ? ' filter="url(#glow)"' : '';
    if (char === '1') return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"${glow}/>`;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--px-ground-raised)" stroke="${color}" stroke-width="3"${glow}/>`;
  }
  // shape === 'chip' - ספרה עשרונית/הקסדצימלית
  const cw = 32, ch = 36;
  if (state === 'hidden') {
    return `<g>
      <rect x="${cx - cw / 2}" y="${cy - ch / 2}" width="${cw}" height="${ch}" rx="8" fill="var(--px-schem-grid)" stroke="var(--px-schem-border)" stroke-width="2"/>
      <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-family="var(--font-mono)" font-size="16" fill="var(--px-ink-inverse-soft)" opacity="0.5">?</text>
    </g>`;
  }
  if (state === 'missing') {
    return `<rect x="${cx - cw / 2}" y="${cy - ch / 2}" width="${cw}" height="${ch}" rx="8" fill="none" stroke="var(--px-ink-inverse-soft)" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.55"/>`;
  }
  const color = COLOR[state] || COLOR.incorrect;
  const glow = state === 'correct' ? ' filter="url(#glow)"' : '';
  return `<g>
    <rect x="${cx - cw / 2}" y="${cy - ch / 2}" width="${cw}" height="${ch}" rx="8" fill="var(--px-ground-raised)" stroke="${color}" stroke-width="2.5"${glow}/>
    <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-family="var(--font-mono)" font-size="17" font-weight="700" fill="${color}">${char != null ? char : ''}</text>
  </g>`;
}

/** שורת רגיסטר גנרית - naten (mode:'given', תמיד גלוי) או answer
 * (mode:'answer', מוסתר עד ש-outcome מסופק). מחזיר {startX, pitch} כדי
 * שקוראים יוכלו למקם לידה תוויות/עיטורים נוספים באותו יישור בדיוק. */
function drawRegister(parts, { entered, width, shape, y, pitch, mode, outcome, weightFn, nibbleSize, signBit }) {
  const startX = W / 2 - ((width - 1) * pitch) / 2;
  let cells;
  if (mode === 'given') {
    cells = String(entered).split('').map((ch, i) => ({ position: width - 1 - i, char: ch, missing: false, extra: false }));
  } else if (!outcome) {
    cells = Array.from({ length: width }, (_, i) => ({ position: width - 1 - i, char: null, missing: false, extra: false }));
  } else {
    cells = analyzeCells(entered, width);
  }
  cells.forEach(cell => {
    const x = posX(cell.position, width, startX, pitch);
    const st = mode === 'given' ? 'given' : (outcome ? cellState(cell, outcome) : 'hidden');
    parts.push(drawCell(x, y, shape, st, cell.char));
  });
  if (weightFn) {
    for (let p = width - 1; p >= 0; p--) {
      // בסיבית הסימן (משלים ל-2) המשקל האמיתי שלילי - לא מציגים "128" מטעה
      // מעל העמודה שבה 1 תורם -128, לא +128.
      const label = (signBit && p === width - 1) ? '-' + weightFn(p) : weightFn(p);
      parts.push(labeledText(posX(p, width, startX, pitch), y - 26, label, 'comp-val', { fontSize: 10 }));
    }
  }
  if (signBit) {
    const x = posX(width - 1, width, startX, pitch);
    parts.push(`<line x1="${x}" y1="${y - 44}" x2="${x}" y2="${y - 34}" stroke="var(--px-lilac)" stroke-width="2"/>`);
    parts.push(labeledText(x, y - 52, 'סיבית סימן', 'comp-label', { fontSize: 10 }));
  }
  if (nibbleSize) {
    const nibbleCount = width / nibbleSize;
    for (let g = 0; g < nibbleCount; g++) {
      const hiPos = width - 1 - g * nibbleSize, loPos = hiPos - nibbleSize + 1;
      const xHi = posX(hiPos, width, startX, pitch), xLo = posX(loPos, width, startX, pitch);
      parts.push(`<path d="M${xHi - pitch * 0.32},${y + 20} L${xHi - pitch * 0.32},${y + 28} L${xLo + pitch * 0.32},${y + 28} L${xLo + pitch * 0.32},${y + 20}" fill="none" stroke="var(--px-ink-inverse-soft)" stroke-width="1.5"/>`);
    }
  }
  return { startX, pitch };
}

/** שבבי-ספרה קטנים מתחת לכל נבל, אחד לכל קבוצה - נחשפים רק אחרי בדיקה
 * (כמו כל תשובה), גם כשהרגיסטר עצמו הוא "נתון" (פענוח BCD) - כי הפירוק
 * לספרות בפועל הוא חלק מהתשובה, לא נתון גולמי. */
function nibbleDecorationChips(parts, { width, pitch, y, digits, outcome, startX }) {
  const nibbleCount = width / 4;
  for (let g = 0; g < nibbleCount; g++) {
    const hiPos = width - 1 - g * 4, loPos = hiPos - 3;
    const cx = (posX(hiPos, width, startX, pitch) + posX(loPos, width, startX, pitch)) / 2;
    parts.push(drawCell(cx, y, 'chip', outcome || 'hidden', outcome ? String(digits[g]) : null));
  }
}

/** קורא-רגיסטר גלובלי - הערך העשרוני השקול, מוצג רק אחרי בדיקה. */
function readoutGlyph(value, color) {
  if (value == null) return '';
  const text = String(value);
  const boxW = Math.max(90, 40 + text.length * 13);
  return `<g id="readout">
    <rect x="${W / 2 - boxW / 2}" y="18" width="${boxW}" height="38" rx="10" fill="#080b16" fill-opacity="0.86" stroke="var(--px-schem-border)"/>
    <text x="${W / 2}" y="43" text-anchor="middle" font-size="18" font-weight="900" fill="${color}" font-family="var(--font-mono)">${text}</text>
  </g>`;
}

function wrapSvg(parts) {
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${GLOW_FILTERS}</defs>${parts.join('\n')}</svg>`;
}

// -------------------------------------------------- פסילה: "גלישת רגיסטר"
function burnBurst(x, y) {
  return `
    <circle cx="${x}" cy="${y}" r="8" fill="#ffb020">
      <animate attributeName="r" from="8" to="46" dur="0.5s" fill="freeze"/>
      <animate attributeName="opacity" from="0.9" to="0" dur="0.5s" fill="freeze"/>
    </circle>
    ${[0, 1, 2, 3, 4].map(i => `<circle cx="${x + (i - 2) * 9}" cy="${y}" r="4" fill="#9aa3b5">
      <animate attributeName="cy" from="${y}" to="${y - 28 - i * 6}" dur="0.75s" fill="freeze"/>
      <animate attributeName="opacity" from="0.85" to="0" dur="0.75s" fill="freeze"/>
    </circle>`).join('')}
  `;
}

function disqualifyBorder(x, y, w, h) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="var(--px-coral)" stroke-width="3" rx="10">
    <animate attributeName="opacity" values="1;0.25;1" dur="0.6s" repeatCount="3"/>
  </rect>`;
}

// ============================================================== 1.1 (1-4)
function scene11(level, outcome, entered) {
  const w = level.world;
  const color = outcomeColor(outcome);
  const parts = [`<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`];

  if (w.kind === 'reconstruct') {
    const n = w.terms.length;
    const pitch = 110;
    const startX = W / 2 - ((n - 1) * pitch) / 2;
    w.terms.forEach(([c, p], i) => {
      const x = startX + i * pitch;
      parts.push(drawCell(x, 170, 'chip', 'given', String(c)));
      parts.push(labeledText(x, 205, `×10${supPow(p)}`, 'comp-val'));
    });
  } else {
    const digitsArr = String(w.number).split('');
    const n = digitsArr.length;
    const pitch = 56;
    const startX = W / 2 - ((n - 1) * pitch) / 2;
    digitsArr.forEach((d, i) => {
      const x = startX + i * pitch;
      const p = n - 1 - i;
      parts.push(drawCell(x, 170, 'chip', 'given', d));
      parts.push(labeledText(x, 140, `10${supPow(p)}`, 'comp-val', { fontSize: 10 }));
      if (p === w.power) {
        parts.push(`<line x1="${x}" y1="192" x2="${x}" y2="207" stroke="var(--px-lilac)" stroke-width="2" stroke-dasharray="4,3"/>`);
        parts.push(labeledText(x, 224, 'המקום שנשאל', 'comp-label', { fontSize: 10 }));
      }
    });
  }

  parts.push(readoutGlyph(outcome ? entered : null, color));
  return wrapSvg(parts);
}

// ============================================================= 1.2 (5-10)
function scene12(level, outcome, entered) {
  const w = level.world;
  const color = outcomeColor(outcome);
  const parts = [`<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`];

  if (w.kind === 'decToBin') {
    parts.push(labeledText(W / 2, 55, `המספר הנתון: ${w.number}`, 'comp-label', { fontSize: 13 }));
    const pitch = w.width === 8 ? 46 : 60;
    drawRegister(parts, { entered, width: w.width, shape: 'bit', y: 175, pitch, mode: 'answer', outcome, weightFn: p => String(2 ** p) });
  } else if (w.kind === 'binToDec') {
    drawRegister(parts, { entered: w.bits, width: w.bits.length, shape: 'bit', y: 175, pitch: 60, mode: 'given', weightFn: p => String(2 ** p) });
    parts.push(readoutGlyph(outcome ? entered : null, color));
  } else if (w.kind === 'decToHex1') {
    parts.push(labeledText(W / 2, 100, `המספר הנתון: ${w.number}`, 'comp-label', { fontSize: 13 }));
    parts.push(drawCell(W / 2, 190, 'chip', outcome || 'hidden', outcome ? entered : null));
  } else if (w.kind === 'hexToDec1') {
    parts.push(drawCell(W / 2, 175, 'chip', 'given', w.hexChar));
    parts.push(readoutGlyph(outcome ? entered : null, color));
  } else {
    // binToHexNibble - נתון: רגיסטר 8 סיביות עם קיבוץ לנבלים; תשובה: 2 שבבי הקס
    drawRegister(parts, { entered: w.bits, width: 8, shape: 'bit', y: 125, pitch: 40, mode: 'given', nibbleSize: 4 });
    const { startX, pitch } = drawRegister(parts, { entered, width: 2, shape: 'chip', y: 225, pitch: 70, mode: 'answer', outcome });
    parts.push(labeledText(startX, 195, '16¹', 'comp-val', { fontSize: 10 }));
    parts.push(labeledText(startX + pitch, 195, '16⁰', 'comp-val', { fontSize: 10 }));
  }
  return wrapSvg(parts);
}

// ============================================================ 1.3 (11-15)
function scene13(level, outcome, entered) {
  const w = level.world;
  const color = outcomeColor(outcome);
  const parts = [`<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`];
  const pitch = w.width === 8 ? 46 : 60;

  if (w.kind === 'decode2s') {
    drawRegister(parts, { entered: w.bits, width: w.width, shape: 'bit', y: 190, pitch, mode: 'given', weightFn: p => String(2 ** p), signBit: true });
    parts.push(readoutGlyph(outcome ? entered : null, color));
  } else {
    parts.push(labeledText(W / 2, 90, `המספר הנתון: ${w.n}`, 'comp-label', { fontSize: 13 }));
    drawRegister(parts, { entered, width: w.width, shape: 'bit', y: 190, pitch, mode: 'answer', outcome, weightFn: p => String(2 ** p), signBit: true });
  }
  return wrapSvg(parts);
}

// ============================================================ 1.4 (16-21)
/** מקומות (0=LSB) שבהם התקבל נשא-החוצה בפועל בחישוב החיבור (add, או
 * sub-דרך-משלים-ל-2 שהוא מבחינה אריתמטית תמיד "A + מספר-מה") - משמש רק
 * לאנימציית נקודות-הנשא ה"קופצות" במצב energized (הצלחה). שיטת החיסור
 * הישיר (שאלה) לא מיוצגת כאן - אין נשא-הוספה מוגדר לאנימציה שם. */
function carryPositions(w) {
  let aStr, bStr;
  if (w.op === 'add') { aStr = w.a; bStr = w.b; }
  else if (w.method === 'complement') { aStr = w.a; bStr = twosComplementOf(parseInt(w.b, 2), w.width); }
  else return [];
  const a = aStr.split('').map(Number).reverse();
  const b = bStr.split('').map(Number).reverse();
  let carry = 0;
  const positions = [];
  for (let i = 0; i < w.width; i++) {
    const sum = a[i] + b[i] + carry;
    carry = sum >= 2 ? 1 : 0;
    if (carry && i + 1 <= w.width - 1) positions.push(i + 1);
  }
  return positions;
}

function scene14(level, outcome, entered) {
  const w = level.world.forAddSub;
  const width = w.width;
  const pitch = 60;
  const yA = 95, yB = 148, yR = 232;
  const parts = [`<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`];
  const startX = W / 2 - ((width - 1) * pitch) / 2;
  const sideX = startX - 55;

  drawRegister(parts, { entered: w.a, width, shape: 'bit', y: yA, pitch, mode: 'given', weightFn: p => String(2 ** p) });
  drawRegister(parts, { entered: w.b, width, shape: 'bit', y: yB, pitch, mode: 'given' });
  parts.push(labeledText(sideX, yA, 'A', 'comp-label'));
  parts.push(labeledText(sideX, yB, 'B', 'comp-label'));

  const sigY = (yA + yB) / 2 + 14;
  parts.push(`<rect x="${sideX - 16}" y="${sigY - 14}" width="32" height="28" rx="6" fill="var(--px-ground-raised)" stroke="var(--px-schem-border)" stroke-width="2"/>`);
  parts.push(`<text x="${sideX}" y="${sigY + 6}" text-anchor="middle" font-family="var(--font-mono)" font-size="16" font-weight="700" fill="var(--px-ink-inverse)">Σ</text>`);

  const lineY = yB + 42;
  parts.push(`<line x1="${startX - width * pitch / 2}" y1="${lineY}" x2="${startX + width * pitch / 2}" y2="${lineY}" stroke="var(--px-schem-border)" stroke-width="2"/>`);

  drawRegister(parts, { entered, width, shape: 'bit', y: yR, pitch, mode: 'answer', outcome });
  parts.push(labeledText(sideX, yR, 'תוצאה', 'comp-label', { fontSize: 10 }));

  if (outcome === 'correct') {
    carryPositions(w).forEach(p => {
      const x = posX(p, width, startX, pitch);
      const xTo = posX(p - 1, width, startX, pitch);
      parts.push(`<circle r="5" fill="var(--px-brand-bright)" filter="url(#dotglow)">
        <animateMotion dur="1.1s" repeatCount="indefinite" path="M${x},${yB + 14} L${xTo},${lineY - 4}"/>
      </circle>`);
    });
  }

  if (outcome === 'disqualified') {
    const cells = analyzeCells(entered, width);
    const leftmostPos = cells[0].position;
    const burstX = posX(leftmostPos, width, startX, pitch);
    const boxX = burstX - pitch / 2 - 6;
    const boxW = posX(0, width, startX, pitch) + pitch / 2 + 6 - boxX;
    parts.push(disqualifyBorder(boxX, yA - 30, boxW, yR - yA + 68));
    parts.push(burnBurst(burstX, yR));
    parts.push(`<circle cx="${startX}" cy="${yR}" r="10" fill="#7a1f14" opacity="0.5"/>`);
    parts.push(labeledText(burstX, yR - 46, '⚡ גלישת רגיסטר!', 'comp-label', { fontSize: 12 }));
  }

  return wrapSvg(parts);
}

// ============================================================ 1.5 (22-25)
function scene15(level, outcome, entered) {
  const w = level.world;
  const color = outcomeColor(outcome);
  const parts = [`<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`];

  if (w.kind === 'encodeBcd') {
    parts.push(labeledText(W / 2, 55, `המספר הנתון: ${w.number}`, 'comp-label', { fontSize: 13 }));
    const pitch = w.width === 8 ? 46 : 60;
    const { startX } = drawRegister(parts, { entered, width: w.width, shape: 'bit', y: 165, pitch, mode: 'answer', outcome, nibbleSize: 4 });
    const digitsArr = String(w.number).padStart(w.width / 4, '0').split('').map(Number);
    nibbleDecorationChips(parts, { width: w.width, pitch, y: 225, digits: digitsArr, outcome, startX });
  } else {
    const pitch = w.width >= 12 ? 36 : 46;
    const { startX } = drawRegister(parts, { entered: w.bits, width: w.width, shape: 'bit', y: 150, pitch, mode: 'given', nibbleSize: 4 });
    nibbleDecorationChips(parts, { width: w.width, pitch, y: 205, digits: bcdDigits(w.bits), outcome, startX });
    parts.push(readoutGlyph(outcome ? entered : null, color));
  }
  return wrapSvg(parts);
}

// -------------------------------------------------------------- דיספצ'ר
function buildScene(level, outcome, entered) {
  switch (level.world.group) {
    case '1.1': return scene11(level, outcome, entered);
    case '1.2': return scene12(level, outcome, entered);
    case '1.3': return scene13(level, outcome, entered);
    case '1.4': return scene14(level, outcome, entered);
    default: return scene15(level, outcome, entered);
  }
}

// -------------------------------------------------------------- ייצוא (חוזה)
export function renderDigitalNumbers(level, energized = false) {
  if (!energized) return { svg: buildScene(level, null, null), width: W, height: H };
  return { svg: buildScene(level, 'correct', level.question.answer), width: W, height: H };
}

export function clearDigitalNumbersMarks() {} // כל בדיקה מרנדרת מחדש את כל הזירה - אין overlay נפרד לניקוי

export function animateDigitalNumbersIncorrect(stageEl, level, result) {
  stageEl.innerHTML = buildScene(level, 'incorrect', result.value);
  stageEl.classList.remove('shake'); void stageEl.offsetWidth; stageEl.classList.add('shake');
}

/** פסילה - "גלישת רגיסטר" (שלב 18 בלבד בכל הטופיק): מסגרת מהבהבת, פרץ
 * ניצוצות בקצה (איפה שהתא ה-9... ה"חמישי" היה צריך לשבת), כתם צריבה על
 * ה-MSB, ולוחית-כיתוב - אותו אוצר אנימציות בדיוק כמו triggerCurrentDisqualifyAnimation. */
export function triggerDigitalNumbersDisqualifyAnimation(stageEl, level, result) {
  stageEl.innerHTML = buildScene(level, 'disqualified', result.value);
  stageEl.classList.remove('shake'); void stageEl.offsetWidth; stageEl.classList.add('shake');
}
