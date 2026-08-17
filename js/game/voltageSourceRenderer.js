// ==========================================================================
// voltageSourceRenderer.js - "מקורות מתח": מקור עם התנגדות פנימית, מחובר
// בטור למכשיר (נורה). לפני בדיקה - אין קריאת מד מתח ואין חיווי הדלקה
// למכשיר (כדי לא לאפשר ניחוש, אותו עיקרון כמו במשחק האסטרואידים). רק אחרי
// לחיצה על "בדיקה" מוצגים מד המתח ומצב הנורה, ומשקפים את הערך שהוזן בפועל
// (ובהצלחה - את התשובה הנכונה).
// ==========================================================================
import { GLOW_FILTERS, labeledText } from './svgUtils.js';

const W = 640, H = 380;
const TOP_Y = 150, BOT_Y = 270;
const SRC_X = 190, BULB_X = 450;
const MID_Y = (TOP_Y + BOT_Y) / 2;

function wireLoop() {
  return `
    <line x1="${SRC_X}" y1="${TOP_Y}" x2="${BULB_X}" y2="${TOP_Y}" stroke="#e8ecff" stroke-width="3"/>
    <line x1="${SRC_X}" y1="${BOT_Y}" x2="${BULB_X}" y2="${BOT_Y}" stroke="#e8ecff" stroke-width="3"/>
    <line x1="${SRC_X}" y1="${TOP_Y}" x2="${SRC_X}" y2="${MID_Y - 14}" stroke="#e8ecff" stroke-width="3"/>
    <line x1="${SRC_X}" y1="${MID_Y + 6}" x2="${SRC_X}" y2="${BOT_Y}" stroke="#e8ecff" stroke-width="3"/>
    <line x1="${BULB_X}" y1="${TOP_Y}" x2="${BULB_X}" y2="${MID_Y - 24}" stroke="#e8ecff" stroke-width="3"/>
    <line x1="${BULB_X}" y1="${MID_Y + 24}" x2="${BULB_X}" y2="${BOT_Y}" stroke="#e8ecff" stroke-width="3"/>
  `;
}

function batterySymbol(emf, r) {
  // סימן סוללה סכמטי: פס ארוך ודק (+) ופס קצר ועבה (-), ניצבים לחוט האנכי.
  return `<g id="battery-symbol">
    <line x1="${SRC_X - 22}" y1="${MID_Y - 14}" x2="${SRC_X + 22}" y2="${MID_Y - 14}" stroke="#e8ecff" stroke-width="3"/>
    <line x1="${SRC_X - 12}" y1="${MID_Y + 6}" x2="${SRC_X + 12}" y2="${MID_Y + 6}" stroke="#e8ecff" stroke-width="8"/>
    ${labeledText(SRC_X - 75, MID_Y - 28, `ε=${emf}V`, 'comp-val')}
    ${labeledText(SRC_X - 75, MID_Y + 40, `r=${r}Ω`, 'comp-val')}
  </g>`;
}

/** מצב הנורה: null (כבויה/נייטרלית, לפני בדיקה) | 'on' (דולקת) | 'off' (לא הגיע מספיק מתח). */
function bulbSymbol(R, vMin, glow) {
  const rad = 22;
  const isOn = glow === 'on';
  const isOff = glow === 'off';
  const fill = isOn ? '#fff3c4' : (isOff ? '#3a3f52' : '#1b2033');
  const stroke = isOff ? 'var(--red)' : 'var(--line)';
  const filamentColor = isOn ? '#7a5b00' : 'var(--text-1)';
  return `<g id="bulb-symbol">
    <circle cx="${BULB_X}" cy="${MID_Y}" r="${rad}" fill="${fill}" stroke="${stroke}" stroke-width="2" ${isOn ? 'filter="url(#glow)"' : ''}/>
    <line x1="${BULB_X - 12}" y1="${MID_Y - 12}" x2="${BULB_X + 12}" y2="${MID_Y + 12}" stroke="${filamentColor}" stroke-width="2"/>
    <line x1="${BULB_X - 12}" y1="${MID_Y + 12}" x2="${BULB_X + 12}" y2="${MID_Y - 12}" stroke="${filamentColor}" stroke-width="2"/>
    ${labeledText(BULB_X + 68, MID_Y - 28, `R=${R}Ω`, 'comp-val')}
    ${labeledText(BULB_X + 68, MID_Y + 40, `דורש ≥${vMin}V`, 'comp-val')}
  </g>`;
}

/** מד מתח - מוצג *רק* אחרי בדיקה (value != null), אין רמז חי לפני זה. */
function voltmeterGlyph(value, unit, color) {
  if (value == null) return '';
  return `<g id="voltmeter">
    <rect x="${W / 2 - 62}" y="30" width="124" height="40" rx="10" fill="#080b16" fill-opacity="0.86" stroke="var(--line)"/>
    <text x="${W / 2}" y="56" text-anchor="middle" font-size="19" font-weight="900" fill="${color}">V = ${value}${unit}</text>
  </g>`;
}

function burstEffect(x, y, color) {
  return `
    <circle cx="${x}" cy="${y}" r="6" fill="${color}">
      <animate attributeName="r" from="6" to="46" dur="0.55s" fill="freeze"/>
      <animate attributeName="opacity" from="0.9" to="0" dur="0.55s" fill="freeze"/>
    </circle>
    ${[0, 1, 2, 3, 4].map(i => `<circle cx="${x + (i - 2) * 9}" cy="${y}" r="4" fill="#9aa3b5">
      <animate attributeName="cy" from="${y}" to="${y - 26 - i * 6}" dur="0.8s" fill="freeze"/>
      <animate attributeName="opacity" from="0.8" to="0" dur="0.8s" fill="freeze"/>
    </circle>`).join('')}
  `;
}

function buildScene(level, opts = {}) {
  const { emf, r, R, vMin } = level.world;
  const { voltmeterValue = null, voltmeterColor = 'var(--cyan)', bulbState = null, burst = false } = opts;
  const out = [
    `<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`,
    wireLoop(),
    batterySymbol(emf, r),
    bulbSymbol(R, vMin, bulbState),
    voltmeterGlyph(voltmeterValue, level.question.unit, voltmeterColor),
  ];
  if (burst) out.push(burstEffect(SRC_X, MID_Y, '#fff3c4'));

  return `
  <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>${GLOW_FILTERS}</defs>
    ${out.join('\n')}
  </svg>`;
}

export function renderVoltageSource(level, energized = false) {
  if (!energized) return { svg: buildScene(level), width: W, height: H };
  const q = level.question;
  const bulbState = q.answer >= q.vMin ? 'on' : 'off';
  const svg = buildScene(level, { voltmeterValue: q.answer, voltmeterColor: 'var(--green)', bulbState });
  return { svg, width: W, height: H };
}

export function clearVoltageMarks() {} // כל בדיקה מרנדרת מחדש את כל הזירה - אין overlay נפרד לניקוי

/** תשובה שגויה "רגילה" - מד המתח ומצב הנורה משקפים את הערך שהוזן בפועל. */
export function animateVoltageIncorrect(stageEl, level, result) {
  const q = level.question;
  const val = result.value;
  const bulbState = val >= q.vMin ? 'on' : 'off';
  const displayVal = Math.round(val * 1000) / 1000;
  stageEl.innerHTML = buildScene(level, { voltmeterValue: displayVal, voltmeterColor: 'var(--amber)', bulbState });
  stageEl.classList.remove('shake'); void stageEl.offsetWidth; stageEl.classList.add('shake');
}

/** פסילה - "התחממות יתר" במקור: פיצוץ במיקום הסוללה, הנורה כבויה. */
export function triggerVoltageDisqualifyAnimation(stageEl, level, result) {
  const displayVal = Math.round(result.value * 1000) / 1000;
  stageEl.innerHTML = buildScene(level, { voltmeterValue: displayVal, voltmeterColor: 'var(--red)', bulbState: 'off', burst: true });
  stageEl.classList.remove('shake'); void stageEl.offsetWidth; stageEl.classList.add('shake');
}
