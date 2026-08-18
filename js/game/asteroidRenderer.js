// ==========================================================================
// asteroidRenderer.js - הופך שלב "ניווט בין אסטרואידים טעונים" ל-SVG: ספינה
// מול אסטרואיד טעון, שעון עוצר עולה (זמן פעילות בלבד, לא דדליין), ואנימציות
// תוצאה. לפני בדיקת תשובה המנועים כבויים לגמרי (אין מד איזון, אין להבה) -
// כדי לא לאפשר "לנחש" את התשובה לפי משוב חי בזמן ההקלדה. רק אחרי לחיצה על
// "בדיקה" מוצגים סילון המנוע (בכיוון שמתאים בפועל לתשובה שהוזנה) ומד האיזון
// (במיקום שמתאים לערך שהוזן), והספינה עצמה (לא רפאון) נעה בהתאם. בהצלחה
// הספינה מתייצבת *במקומה* (השקול על מסלול מאוזן הוא תמיד אפס, בלי קשר
// לכיוון המשיכה/דחייה) - אין "מסע במרחב" לשום יעד.
// ==========================================================================
import { GLOW_FILTERS, labeledText } from './svgUtils.js';
import { CONFIG } from '../config.js';

const W = 640, H = 380;
const SHIP_X = 260, SHIP_Y = 230;
const SCALE = 4.2; // פיקסלים לס"מ - ממיר מיקומי אסטרואידים אמיתיים (x,y יחסית לספינה)

function toPx(xCm, yCm) { return { x: SHIP_X + xCm * SCALE, y: SHIP_Y - yCm * SCALE }; }

const JET_DEFS = `
  <linearGradient id="jetGradR" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#eafcff" stop-opacity="0.95"/>
    <stop offset="100%" stop-color="var(--px-brand-bright)" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="jetGradL" x1="1" y1="0" x2="0" y2="0">
    <stop offset="0%" stop-color="#eafcff" stop-opacity="0.95"/>
    <stop offset="100%" stop-color="var(--px-brand-bright)" stop-opacity="0"/>
  </linearGradient>`;

function chargeColor(q) { return q > 0 ? 'var(--px-coral)' : 'var(--px-brand-bright)'; }

/**
 * צד יציאת הסילון נגזר *ישירות* מסימן הכוח שהוזן (או, בהצלחה, מסימן
 * התשובה הנכונה) - לא מסימן המטען באסטרואיד. לפי חוק שלישי של ניוטון,
 * מנוע שדוחף את הספינה בכיוון -val צריך לפלוט סילון בכיוון val עצמו הפוך
 * (ראו הערה מפורטת ליד animateAsteroidIncorrect). נוסחה אחת, בלי הבחנת
 * מקרים בין דחייה/משיכה.
 */
function flameSideFor(val) { return val >= 0 ? -1 : 1; }

function starfield() {
  // שדה כוכבים דקורטיבי קבוע (לא תלוי RNG של השלב) - רק אווירה.
  const seedPts = [
    [30, 40, 1.4], [90, 300, 1], [180, 60, 1.6], [260, 330, 1.1], [340, 30, 1.3],
    [400, 300, 1], [470, 60, 1.4], [560, 320, 1.6], [600, 90, 1.1], [40, 220, 1.2],
    [130, 150, 0.9], [230, 200, 1.3], [310, 260, 1], [390, 150, 1.2], [520, 200, 0.9],
    [590, 250, 1.3], [20, 340, 1], [610, 40, 1.2], [250, 100, 0.9], [450, 340, 1.1],
  ];
  return seedPts.map(([x, y, r]) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#cfe0ff" opacity="0.5"/>`).join('');
}

/**
 * סילון לחץ אמיתי - חרוט גרדיאנט (גוף הסילון) + חלקיקים שזורמים לאורכו
 * בלולאה (animateMotion), לא הבהוב שקיפות של צורה קבועה. side=+1 יוצא
 * ימינה, side=-1 יוצא שמאלה.
 */
function jetFlame(side, color) {
  const baseX = SHIP_X + side * 17;
  const tipX = baseX + side * 36;
  const gradId = side > 0 ? 'jetGradR' : 'jetGradL';
  const particles = [0, 1, 2].map(i => {
    const dur = (0.5 + i * 0.07).toFixed(2);
    const delay = (i * 0.17).toFixed(2);
    return `<circle r="3.2" fill="${color}">
      <animateMotion path="M${baseX},${SHIP_Y} L${tipX},${SHIP_Y}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.9;0.9;0" keyTimes="0;0.5;1" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>
      <animate attributeName="r" values="3.2;1" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>
    </circle>`;
  }).join('');
  return `
    <polygon points="${baseX},${SHIP_Y - 9} ${tipX},${SHIP_Y} ${baseX},${SHIP_Y + 9}" fill="url(#${gradId})"/>
    ${particles}`;
}

function shipGlyph(shipQUC, opts = {}) {
  const { dx = 0, flame = null, wobble = false } = opts;
  // שתי קבוצות מקוננות: החיצונית נושאת רק את אנימציית ה"התייצבות" האנכית
  // (בהצלחה), הפנימית נושאת את ההיסט הקבוע (dx) - כדי לא לערבב transform
  // סטטי עם animateTransform על אותו אלמנט.
  const wobbleAnim = wobble
    ? `<animateTransform attributeName="transform" type="translate"
        values="0,0; 0,-4; 0,2; 0,-1; 0,0" dur="0.6s" repeatCount="1" fill="freeze"/>`
    : '';
  return `<g id="ship-glyph">
    ${wobbleAnim}
    <g transform="translate(${dx},0)">
      ${flame ? jetFlame(flame.side, flame.color) : ''}
      <circle cx="${SHIP_X}" cy="${SHIP_Y}" r="17" fill="#e8ecff" filter="url(#glow)"/>
      ${labeledText(SHIP_X, SHIP_Y - 34, `q1=+${shipQUC}µC`, 'comp-val')}
      ${labeledText(SHIP_X, SHIP_Y + 32, 'הספינה שלך', 'comp-val')}
    </g>
  </g>`;
}

function asteroidGlyph(asteroid, label) {
  const { q: qUC, x: xCm, y: yCm } = asteroid;
  const p = toPx(xCm, yCm);
  const positive = qUC > 0;
  const color = chargeColor(qUC);
  const baseR = Math.min(30, 17 + Math.abs(qUC) * 1.1);
  const n = 9;
  let pts = '';
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const r = baseR * (i % 2 === 0 ? 1 : 0.72);
    pts += `${(p.x + r * Math.cos(ang)).toFixed(1)},${(p.y + r * Math.sin(ang)).toFixed(1)} `;
  }
  return `<g id="${label}">
    <polygon points="${pts.trim()}" fill="${color}" filter="url(#glow)"/>
    <text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-size="15" font-weight="900" fill="#05060a">${positive ? '+' : '−'}</text>
    ${labeledText(p.x, p.y + baseR + 18, `Q=${qUC > 0 ? '+' : ''}${qUC}µC`, 'comp-val')}
  </g>`;
}

function distanceRuler(asteroid) {
  // קו מדידה בודד (לא "מסלול הטיסה" - זה תפקידו של verticalPathLine) - רק
  // כשיש אסטרואיד יחיד ישירות בצד המסלול (y=0, טייר 1). עם כמה אסטרואידים
  // במיקומים שרירותיים, המרחקים המדויקים כבר כתובים בטקסט השאלה.
  const p = toPx(asteroid.x, asteroid.y);
  return `
    <line x1="${SHIP_X + 24}" y1="${SHIP_Y}" x2="${p.x - 34}" y2="${p.y}" stroke="var(--px-ink-inverse-soft)" stroke-width="1.5" stroke-dasharray="3,5" opacity="0.3"/>
    ${labeledText((SHIP_X + p.x) / 2, SHIP_Y - 20, `r = ${asteroid.x} ס"מ`, 'comp-val')}
  `;
}

function verticalPathLine() {
  // מסלול הטיסה האמיתי של הספינה - כלפי מעלה. האסטרואיד מפעיל כוח *צדדי*
  // עליה, וזה בדיוק מה שהמנועים צריכים לאזן כדי שהיא לא תסטה ממסלול זה.
  return `<line x1="${SHIP_X}" y1="${SHIP_Y - 22}" x2="${SHIP_X}" y2="55" stroke="var(--px-brand-bright)" stroke-width="2" stroke-dasharray="5,7" opacity="0.5"/>`;
}

function stopwatchGlyph() {
  // סופר *מעלה* את זמן הפעילות בתרגיל הנוכחי - אין כאן שום "תוצאה" אם
  // הזמן מתארך, זה רק מדד מידע/אתגר אישי (כמו "זמן פתרון") ולא דדליין.
  return `<g id="stopwatch-group">
    <rect x="${W / 2 - 54}" y="10" width="108" height="36" rx="10" fill="#080b16" fill-opacity="0.86" stroke="var(--px-schem-border)"/>
    <text id="stopwatch-text" x="${W / 2}" y="35" text-anchor="middle" font-size="18" font-weight="900" fill="var(--px-brand-bright)">⏱ 0:00</text>
  </g>`;
}

/**
 * מד איזון - מוצג *רק* אחרי בדיקה (value != null), במיקום/צבע שמתאים
 * לערך שהוזן בפועל. לפני בדיקה מוחזר מחרוזת ריקה לגמרי - אין שום רמז חי
 * בזמן ההקלדה, כדי לא לאפשר "לנחש" את התשובה לפי תזוזת המחוג.
 */
function balanceGaugeGlyph(level, value) {
  if (value == null) return '';
  const q = level.question;
  // נורמליזציה לפי *גודל* התשובה (לא הסימן שלה) - כך שהמחוג תמיד קורא
  // כמו ציר מספרים פשוט: שמאל = ערך נמוך מדי, ימין = ערך גבוה מדי,
  // בלי קשר לכך שהתשובה הנכונה עצמה חיובית או שלילית.
  const denom = Math.abs(q.trueForceN) || 1;
  const normalized = Math.max(-1, Math.min(1, (value - q.answer) / denom));
  const tolerance = Math.max(Math.abs(q.trueForceN) * CONFIG.ANSWER_TOLERANCE_PCT, 1e-9);
  let color;
  if (Math.abs(value - q.answer) <= tolerance) color = 'var(--px-brand-bright)';
  else if (Math.abs(value) > q.crashThreshold) color = 'var(--px-coral)';
  else color = 'var(--px-amber)';
  const gy = SHIP_Y + 100;
  return `<g id="balance-gauge" transform="translate(${SHIP_X},${gy})">
    ${labeledText(0, -20, 'מד איזון כוחות', 'comp-val')}
    <rect x="-80" y="-9" width="160" height="18" rx="9" fill="#080b16" fill-opacity="0.78" stroke="var(--px-schem-border)"/>
    <line x1="0" y1="-13" x2="0" y2="13" stroke="var(--px-ink-inverse-soft)" stroke-width="1.5" opacity="0.6"/>
    <circle cx="${(normalized * 72).toFixed(1)}" cy="0" r="9" fill="${color}" filter="url(#glow)"/>
  </g>`;
}

function burstEffect(x, y, color) {
  return `
    <circle cx="${x}" cy="${y}" r="6" fill="${color}">
      <animate attributeName="r" from="6" to="50" dur="0.55s" fill="freeze"/>
      <animate attributeName="opacity" from="0.9" to="0" dur="0.55s" fill="freeze"/>
    </circle>
    ${[0, 1, 2, 3, 4].map(i => `<circle cx="${x + (i - 2) * 10}" cy="${y}" r="4" fill="#9aa3b5">
      <animate attributeName="cy" from="${y}" to="${y - 26 - i * 6}" dur="0.8s" fill="freeze"/>
      <animate attributeName="opacity" from="0.8" to="0" dur="0.8s" fill="freeze"/>
    </circle>`).join('')}
  `;
}

function buildScene(level, opts = {}) {
  const { shipQUC, asteroids } = level.world;
  const { dx = 0, flame = null, gaugeValue = null, wobble = false, burst = false } = opts;
  const out = [
    `<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`,
    starfield(),
    asteroids.length === 1 && asteroids[0].y === 0 ? distanceRuler(asteroids[0]) : '',
    verticalPathLine(),
    ...asteroids.map((a, i) => asteroidGlyph(a, `asteroid-glyph-${i}`)),
    shipGlyph(shipQUC, { dx, flame, wobble }),
    balanceGaugeGlyph(level, gaugeValue),
    stopwatchGlyph(),
  ];
  if (burst) out.push(burstEffect(SHIP_X + dx, SHIP_Y, '#fff3c4'));

  return `
  <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>${GLOW_FILTERS}${JET_DEFS}</defs>
    ${out.join('\n')}
  </svg>`;
}

export function renderAsteroid(level, energized = false) {
  if (!energized) {
    // לפני בדיקה - מנועים כבויים, בלי מד איזון ובלי סילון. שום משוב חי.
    return { svg: buildScene(level), width: W, height: H };
  }
  // הצלחה - הכוח מאוזן: הסילון יוצא בדיוק בכיוון שנגזר מהתשובה הנכונה
  // (אותה נוסחה בדיוק כמו בתשובה שגויה - ראו flameSideFor), הספינה נשארת
  // במקומה (רק רעד התייצבות אנכי), ומד האיזון נעול במרכז בירוק.
  const svg = buildScene(level, {
    flame: { side: flameSideFor(level.question.answer), color: 'var(--px-brand-bright)' },
    gaugeValue: level.question.answer,
    wobble: true,
  });
  return { svg, width: W, height: H };
}

export function clearAsteroidMarks() {} // אין יותר overlay נפרד לניקוי - כל בדיקה מרנדרת מחדש את כל הזירה

/**
 * תשובה שגויה - הכל נגזר מנוסחה אחת: השארית העולמית על הספינה היא
 * `שהוזן - תשובה_אמיתית` (שני הערכים חתומים באותה קונבנציה - חיובי=דחייה,
 * שלילי=משיכה - ראו הערת הכותרת של הקובץ). אין יותר הבחנה נפרדת בין
 * "חלש/חזק" או היפוך כיוון ידני: תשובה עם סימן נכון אך גודל לא מדויק
 * נותנת שארית קטנה; תשובה עם סימן *הפוך* (טעות נפוצה במציאות) נותנת
 * שארית גדולה באותו כיוון של המשיכה/דחייה האמיתית, כי המנוע יורה הפוך
 * ומחזק את הבעיה במקום לבטל אותה - בדיוק ההשלכה הפיזיקלית הנכונה.
 */
export function animateAsteroidIncorrect(stageEl, level, result) {
  const q = level.question;
  const val = result.value;
  const residual = val - q.trueForceN; // חיובי = שקול לעבר האסטרואיד, שלילי = הרחק ממנו
  const dx = Math.max(-40, Math.min(40, (residual / (Math.abs(q.trueForceN) || 1)) * 30));
  const wrongSign = val !== 0 && Math.sign(val) !== Math.sign(q.answer);
  const color = wrongSign ? 'var(--px-coral)' : 'var(--px-amber)';

  stageEl.innerHTML = buildScene(level, {
    dx,
    flame: { side: flameSideFor(val), color },
    gaugeValue: val,
  });
  stageEl.classList.remove('shake'); void stageEl.offsetWidth; stageEl.classList.add('shake');
}

/** פסילה - "התחממות יתר" במנוע: פיצוץ במיקום הספינה עצמה. */
export function triggerAsteroidDisqualifyAnimation(stageEl, level, result) {
  stageEl.innerHTML = buildScene(level, { gaugeValue: result.value, burst: true });
  stageEl.classList.remove('shake'); void stageEl.offsetWidth; stageEl.classList.add('shake');
}

// ---------------------------------------------------------------- שעון עוצר (עולה)
export function mountAsteroidStopwatch(stageEl) {
  const textEl = stageEl && stageEl.querySelector('#stopwatch-text');
  if (!textEl) return () => {};
  let seconds = 0;
  const tick = () => {
    seconds += 1;
    const m = Math.floor(seconds / 60), s = seconds % 60;
    textEl.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
  };
  const intervalId = setInterval(tick, 1000);
  let stopped = false;
  return function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(intervalId);
  };
}
