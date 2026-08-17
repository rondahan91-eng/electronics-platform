// ==========================================================================
// chargeRenderer.js - הופך שלב "מטען/כוח/שדה" ל-SVG: רשת עם צירים, מטענים
// זוהרים עם קווי שדה סטטיים (תמיד גלויים - זו התצוגה הפסיבית של יעד הלמידה
// "שדה חשמלי"), דיסקית מבחן, ושער יעד. אנימציות תוצאה: נכון = הדיסקית
// מגיעה ליעד; חלש/חזק-אך-בטוח = עוצרת באמצע/מעבר ליעד; פסילה = "מתרסקת"
// טסה מחוץ ללוח (באותו רעיון של אנימציית השריפה במעגלים, מותאם ל"התרסקות").
// ==========================================================================
import { resetPid, nextPid, GLOW_FILTERS, labeledText } from './svgUtils.js';

const W = 620, H = 600;
const CX = W / 2, CY = H / 2;
const SCALE = 4; // פיקסלים לס"מ
const GRID_EXTENT = 70; // ס"מ - כולל מקום למטענים דוחים שמוצבים הרחק מההתחלה

function toPx(xCm, yCm) { return { x: CX + xCm * SCALE, y: CY - yCm * SCALE }; }

function chargeColor(q) { return q > 0 ? 'var(--red)' : 'var(--cyan)'; }

function fieldLines(cx, cy, positive, color) {
  const n = 8, len1 = 10, len2 = 24;
  let out = '';
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const x1 = cx + (positive ? len1 : len2) * cos, y1 = cy + (positive ? len1 : len2) * sin;
    const x2 = cx + (positive ? len2 : len1) * cos, y2 = cy + (positive ? len2 : len1) * sin;
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="2" opacity="0.55" stroke-linecap="round"/>`;
  }
  return out;
}

function chargeGlyph(c) {
  const p = toPx(c.x, c.y);
  const positive = c.q > 0;
  const color = chargeColor(c.q);
  const r = Math.min(22, 13 + Math.abs(c.q) * 0.9);
  return `
    ${fieldLines(p.x, p.y, positive, color)}
    <circle cx="${p.x}" cy="${p.y}" r="${r.toFixed(1)}" fill="${color}" filter="url(#glow)"/>
    <text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-size="15" font-weight="900" fill="#05060a">${positive ? '+' : '−'}</text>
    ${labeledText(p.x, p.y + r + 16, `${c.label}=${c.q > 0 ? '+' : ''}${c.q}µC`, 'comp-val')}
  `;
}

function gridSvg() {
  let lines = '';
  for (let cm = -GRID_EXTENT; cm <= GRID_EXTENT; cm += 10) {
    const a = toPx(cm, -GRID_EXTENT), b = toPx(cm, GRID_EXTENT);
    const c = toPx(-GRID_EXTENT, cm), d = toPx(GRID_EXTENT, cm);
    const isAxis = cm === 0;
    lines += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${isAxis ? 'var(--line)' : 'rgba(255,255,255,.04)'}" stroke-width="${isAxis ? 1.5 : 1}"/>`;
    lines += `<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}" stroke="${isAxis ? 'var(--line)' : 'rgba(255,255,255,.04)'}" stroke-width="${isAxis ? 1.5 : 1}"/>`;
  }
  return `<g>${lines}</g>`;
}

function goalGlyph(goal) {
  const p = toPx(goal.x, goal.y);
  return `
    <line x1="${p.x - 34}" y1="${p.y}" x2="${p.x - 34}" y2="${p.y - 46}" stroke="var(--green)" stroke-width="5" filter="url(#glow)"/>
    <line x1="${p.x + 34}" y1="${p.y}" x2="${p.x + 34}" y2="${p.y - 46}" stroke="var(--green)" stroke-width="5" filter="url(#glow)"/>
    <line x1="${p.x - 34}" y1="${p.y - 46}" x2="${p.x + 34}" y2="${p.y - 46}" stroke="var(--green)" stroke-width="3" opacity="0.6"/>
    ${labeledText(p.x, p.y - 58, 'יעד', 'comp-val')}
  `;
}

function testDiscGlyph(start, testChargeUC) {
  const p = toPx(start.x, start.y);
  return `<g id="test-disc-static">
    <circle cx="${p.x}" cy="${p.y}" r="12" fill="#e8ecff" filter="url(#glow)"/>
    <text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="12" font-weight="900" fill="#05060a">+</text>
    ${labeledText(p.x, p.y + 26, `בוחן q=+${testChargeUC}µC`, 'comp-val')}
  </g>`;
}

function laneGuide(start, goal) {
  const a = toPx(start.x, start.y), b = toPx(goal.x, goal.y);
  return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--text-1)" stroke-width="2" stroke-dasharray="4,6" opacity="0.35"/>`;
}

/**
 * אנימציית "הצלחה" לשאלת שדה - השדה אינו תלוי במטען הבוחן כלל (זו בדיוק
 * הנקודה הפדגוגית), ולכן אין שום סיבה פיזיקלית שהדיסקית תזוז - לא לשער
 * ולא למטען. במקום זאת, הדיסקית משמשת "בוחן" נייח: מציגים טבעת מדידה
 * פועמת סביבה וקריאת המכשיר שהתקבלה, בלי שום תנועה.
 */
function fieldMeasurementEffect(start, readout) {
  const p = toPx(start.x, start.y);
  return `
    <circle cx="${p.x}" cy="${p.y}" r="16" fill="none" stroke="var(--amber)" stroke-width="3" filter="url(#glow)">
      <animate attributeName="r" values="14;30;14" dur="1.6s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.95;0.1;0.95" dur="1.6s" repeatCount="indefinite"/>
    </circle>
    ${labeledText(p.x, p.y - 34, `נמדד: ${readout} ✓`, 'comp-val')}
  `;
}

/** אנימציית "הצלחה" - דיסקית נעה מההתחלה ליעד בחלקות. */
function movingDisc(start, goal, opts = {}) {
  const a = toPx(start.x, start.y);
  const b = toPx(goal.x, goal.y);
  const fraction = opts.fraction ?? 1;
  const endX = a.x + (b.x - a.x) * fraction;
  const endY = a.y + (b.y - a.y) * fraction;
  const pathId = nextPid();
  const dur = opts.dur || 1.3;
  return `
    <path id="${pathId}" d="M${a.x},${a.y} L${endX.toFixed(1)},${endY.toFixed(1)}" fill="none"/>
    <g filter="url(#dotglow)">
      <animateMotion dur="${dur}s" repeatCount="1" fill="freeze"><mpath href="#${pathId}"/></animateMotion>
      <circle r="12" fill="${opts.color || '#e8ecff'}"/>
      <text text-anchor="middle" dy="4" font-size="12" font-weight="900" fill="#05060a">+</text>
    </g>`;
}

export function renderCharge(level, energized = false) {
  resetPid();
  const { start, goal, charges, hiddenCharges = [], successTarget } = level.world;
  const target = successTarget || goal;
  const out = [];

  out.push(gridSvg());
  out.push(laneGuide(start, goal));
  out.push(goalGlyph(goal));
  charges.forEach(c => out.push(chargeGlyph(c)));
  if (energized) hiddenCharges.forEach(c => out.push(chargeGlyph(c)));
  out.push(testDiscGlyph(start, level.testChargeUC));

  if (energized) {
    if (level.question.ask === 'field') {
      // שאלת שדה - השדה אינו תלוי במטען הבוחן, אז שום תנועה לא הגיונית
      // פיזיקלית כאן; מציגים מדידה נייחת בנקודת הבוחן במקום.
      const readout = `E = ${level.question.answer.toLocaleString('he-IL')} ${level.question.unit}`;
      out.push(fieldMeasurementEffect(start, readout));
    } else {
      // תוצאה נכונה - הדיסקית נעה עד יעד ההצלחה האמיתי: השער אם שום דבר לא
      // חוסם את הדרך (דחייה), או עד המטען המושך עצמו אם הוא זה שקורא לה.
      out.push(movingDisc(start, target, { fraction: 1, dur: 1.3, color: 'var(--green)' }));
    }
  }

  const svg = `
  <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>${GLOW_FILTERS}</defs>
    ${out.join('\n')}
  </svg>`;
  return { svg, width: W, height: H };
}

// ---------------------------------------------------------------- תוצאות ניסיון
const OVERLAY_ID = 'charge-outcome-overlay';

export function clearChargeDisqualifyMarks(stageEl) {
  stageEl?.querySelectorAll(`#${OVERLAY_ID}`).forEach(el => el.remove());
}

function appendOverlay(stageEl, innerSvg) {
  const svg = stageEl.querySelector('svg');
  if (!svg) return;
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('id', OVERLAY_ID);
  g.innerHTML = innerSvg;
  svg.appendChild(g);
}

function burstEffect(x, y, color) {
  return `
    <circle cx="${x}" cy="${y}" r="5" fill="${color}">
      <animate attributeName="r" from="5" to="46" dur="0.5s" fill="freeze"/>
      <animate attributeName="opacity" from="0.9" to="0" dur="0.5s" fill="freeze"/>
    </circle>
    ${[0, 1, 2, 3, 4].map(i => `<circle cx="${x + (i - 2) * 9}" cy="${y}" r="4" fill="#9aa3b5">
      <animate attributeName="cy" from="${y}" to="${y - 30 - i * 5}" dur="0.9s" fill="freeze"/>
      <animate attributeName="opacity" from="0.8" to="0" dur="0.9s" fill="freeze"/>
    </circle>`).join('')}
  `;
}

/** תשובה שגויה "רגילה" - חלשה מדי (עוצרת באמצע) או חזקה-אך-בטוחה (חולפת מעט מעבר ליעד). */
export function animateChargeIncorrect(stageEl, level, result) {
  stageEl.classList.remove('shake'); void stageEl.offsetWidth; stageEl.classList.add('shake');
  if (!stageEl.querySelector('svg')) return;
  const { start, goal, successTarget } = level.world;
  const target = successTarget || goal;
  if (!result.variant) return; // (למשל שאלת שדה) - הרעד מספיק, בלי תנועת דיסקית
  const fraction = result.variant === 'weak' ? 0.45 : 1.3;
  const color = result.variant === 'weak' ? 'var(--amber)' : 'var(--pink)';
  appendOverlay(stageEl, movingDisc(start, target, { fraction, dur: 0.9, color }));
}

/** פסילה - הדיסקית "מתרסקת": טסה הרחק מעבר ליעד ההצלחה האמיתי ומתפוצצת. */
export function triggerChargeDisqualifyAnimation(stageEl, level, result) {
  stageEl.classList.remove('shake'); void stageEl.offsetWidth; stageEl.classList.add('shake');
  if (!stageEl.querySelector('svg')) return;
  const { start, goal, successTarget } = level.world;
  const target = successTarget || goal;
  const overshoot = movingDisc(start, target, { fraction: 2.1, dur: 0.55, color: 'var(--red)' });
  const a = toPx(start.x, start.y), b = toPx(target.x, target.y);
  const burstX = a.x + (b.x - a.x) * 2.1, burstY = a.y + (b.y - a.y) * 2.1;
  const burst = burstEffect(burstX, burstY, '#fff3c4');
  appendOverlay(stageEl, overshoot + burst);
}
