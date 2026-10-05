// ==========================================================================
// staticChargeRenderer.js - "מטען, כוח ושדה חשמלי" (פרק 1): ניסויי חשמל סטטי
// פשוטים. מחליף את הדמיית החללית הקודמת. שלוש סצנות קבועות, אותה שפה חזותית:
//   ruler_paper   - סרגל טעון מעל פיסות נייר על שולחן
//   balloon_wall  - בלון טעון ליד קיר
//   water_balloon - בלון טעון ליד זרם מים דק מברז
// הכללים (מתוך ה-spec):
//  - אין אף ספרה בציור. רק סימני +/− על הגופים הטעונים, סמן מרחק r (בשלב 4 גם
//    r′), ותווית "?" לגודל הנעלם. הסימנים נגזרים מ-world.source.sign /
//    world.target.sign, כלומר זהים לנתוני השאלה.
//  - render(level, false) = מצב מנוחה: בלי תנועה, בלי חץ כוח ובלי קווי שדה
//    (הם היו חושפים משיכה/דחייה לפני שהתלמיד חישב).
//  - render(level, true) = מצב הצלחה: אנימציית SMIL של עד ~1.2 שניות
//    (animate/animateMotion/animateTransform, כמו currentRenderer.js), ורק אחריה
//    מופיעים חץ כוח (ירוק), חץ משקל או קווי שדה. הכיוון נגזר מהפיזיקה של השלב
//    (world.interaction, world.success).
//  - אין מנגנון פסילה. תשובה שגויה = ריטוט ברירת המחדל של gameEngine.
// ==========================================================================
import { GLOW_FILTERS, labeledText } from './svgUtils.js';

const W = 640, H = 300;

const C = {
  neg: 'var(--px-sky)',
  pos: 'var(--px-coral)',
  force: 'var(--px-brand-bright)',
  weight: 'var(--px-amber)',
  trace: 'var(--px-schem-trace)',
  border: 'var(--px-schem-border)',
  body: 'var(--px-ground-raised)',
  deep: 'var(--px-ground-deep)',
  ink: 'var(--px-ink-inverse)',
  soft: 'var(--px-ink-inverse-soft)',
};

const f = x => Math.round(x * 10) / 10;
const signColor = s => (s > 0 ? C.pos : C.neg);

// זמן (בשניות) שבו מסתיימת אנימציית ההצלחה ומופיעים החצים / קווי השדה.
const REVEAL_T = 1.3;

// ---------------------------------------------------------------- פרימיטיבים
/** סימן מטען כצורה (לא גליף פונט): + = שני קווים, − = קו אחד. */
function chargeSign(cx, cy, s, size = 5, opacity = 1) {
  const d = s > 0
    ? `M${f(cx - size)},${f(cy)} H${f(cx + size)} M${f(cx)},${f(cy - size)} V${f(cy + size)}`
    : `M${f(cx - size)},${f(cy)} H${f(cx + size)}`;
  return `<path d="${d}" stroke="${signColor(s)}" stroke-width="${size > 4 ? 2.6 : 2.2}" stroke-linecap="round" fill="none" opacity="${opacity}"/>`;
}

/** חץ: קו + ראש מלא. opts.dash = קו מקווקו (קווי שדה), opts.glow = הילה. */
function arrowShape(x1, y1, x2, y2, color, { width = 4, head = 12, dash = null, glow = false } = {}) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const bx = x2 - ux * head, by = y2 - uy * head;
  const px = -uy * head * 0.5, py = ux * head * 0.5;
  const filt = glow ? ' filter="url(#glow)"' : '';
  return `<g${filt}>
    <line x1="${f(x1)}" y1="${f(y1)}" x2="${f(bx)}" y2="${f(by)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>
    <polygon points="${f(x2)},${f(y2)} ${f(bx + px)},${f(by + py)} ${f(bx - px)},${f(by - py)}" fill="${color}"/>
  </g>`;
}

/** סמן מרחק: קו דו-צדדי מקווקו עם ראשי חץ זעירים בשני הקצוות. התווית נפרדת. */
function distLine(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const head = 8, hw = 3.6;
  const tip = (x, y, sx, sy) => {
    const bx = x + sx * head, by = y + sy * head;
    const px = -sy * hw, py = sx * hw;
    return `<polygon points="${f(x)},${f(y)} ${f(bx + px)},${f(by + py)} ${f(bx - px)},${f(by - py)}" fill="${C.soft}"/>`;
  };
  return `<line x1="${f(x1 + ux * head)}" y1="${f(y1 + uy * head)}" x2="${f(x2 - ux * head)}" y2="${f(y2 - uy * head)}" stroke="${C.soft}" stroke-width="1.8" stroke-dasharray="5,4"/>
    ${tip(x1, y1, ux, uy)}${tip(x2, y2, -ux, -uy)}`;
}

/** קו עזר דק (קו הרחבה של סמן מרחק). */
const extLine = (x1, y1, x2, y2) =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${C.soft}" stroke-width="1.2" stroke-dasharray="2,4" opacity="0.7"/>`;

/** אלמנט שמופיע בהדרגה ב-t (שניות) ונשאר. */
const revealAt = (t, content) =>
  `<g opacity="0">${content}<animate attributeName="opacity" from="0" to="1" begin="${t}s" dur="0.25s" fill="freeze"/></g>`;

/** הדהייה אל שקיפות 0 (מוסיפים בתוך <g>). */
const fadeOut = (begin, dur) =>
  `<animate attributeName="opacity" to="0" begin="${begin}s" dur="${dur}s" fill="freeze"/>`;

/** "נצנוץ" קצר של סימנים: שקיפות מתחלפת. */
const sparkle = (begin = 0) =>
  `<animate attributeName="opacity" values="1;0.35;1;0.35;1" begin="${begin}s" dur="1s"/>`;

/** תווית קצרה (r, F, W...) על "לוחית" כהה: labeledText המשותף מ-svgUtils.js, אבל
 * בגופן גדול יותר. ה-class comp-label קובע 12px ב-CSS, ולכן הגודל נכפה inline. */
const TAG_SIZE = 16;
const tag = (x, y, text, opts = {}) =>
  labeledText(x, y, text, 'comp-label', { fontSize: TAG_SIZE, ...opts })
    .replace('class="comp-label"', `class="comp-label" style="font-size:${TAG_SIZE}px"`);

// הצבעת תווית r: בשלב שבו המרחק הוא הנעלם - "r = ?" (רק במצב מנוחה).
const rText = (w, energized) => (w.unknown === 'distance' && !energized ? 'r = ?' : 'r');

/** שבב "גודל נעלם" במרכז העליון: "F = ?" וכו'. מוצג רק במצב מנוחה. במרכז ולא בפינה,
 * כי כיפת ה-arena-portal חותכת את הפינות העליונות במסכים רחבים. */
const UNKNOWN_SYMBOL = {
  force: 'F', force_new_distance: 'F′', electron_count: 'N', field: 'E',
  source_charge: 'Q', min_source_charge: 'Q min', force_over_weight: 'F / W',
};
function unknownChip(w) {
  const sym = UNKNOWN_SYMBOL[w.unknown];
  if (!sym) return ''; // distance: ה-"?" מופיע על סמן r עצמו
  const text = `${sym} = ?`;
  const bw = text.length * 8.6 + 24;
  const x0 = (W - bw) / 2;
  return `<g>
    <rect x="${f(x0)}" y="12" width="${f(bw)}" height="28" rx="8" fill="#080b16" fill-opacity="0.86" stroke="${C.border}"/>
    <text x="${f(x0 + bw / 2)}" y="31" text-anchor="middle" class="comp-label" style="font-size:14px" fill="${C.soft}">${text}</text>
  </g>`;
}

// ------------------------------------------------------------------- בלון
// מיקומי סימני ה-− על הבלון, כשברים של (rx, ry) - נשארים בתוך האליפסה בכל גודל.
// שימו לב: אין סימן סביב קו האמצע-ימינה (y≈0, x>0) - שם עובר חץ הכוח.
const BALLOON_SIGN_FRACS = [[-0.48, -0.6], [0.22, -0.68], [0.6, -0.32], [-0.74, -0.08], [-0.39, 0.42], [0.35, 0.53]];

/** בלון: אליפסה + הדגשה + קשר + חוטון + סימני מטען. groupAnim / ellipseAnim /
 * signAnim = מחרוזות SMIL שמוזרקות לקבוצה / לאליפסה / לקבוצת הסימנים. */
function balloonShape({ cx, cy, rx, ry, sign, stringLen = 28, groupAnim = '', ellipseAnim = '', signAnim = '', glowSigns = false }) {
  const color = signColor(sign);
  const bottom = cy + ry;
  const signs = BALLOON_SIGN_FRACS
    .map(([fx, fy]) => chargeSign(cx + fx * rx, cy + fy * ry, sign, rx > 55 ? 5 : 4.2)).join('');
  return `<g>
    <ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${rx}" ry="${ry}" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="2.4">${ellipseAnim}</ellipse>
    <path d="M${f(cx - rx * 0.62)},${f(cy - ry * 0.3)} Q${f(cx - rx * 0.72)},${f(cy - ry * 0.55)} ${f(cx - rx * 0.45)},${f(cy - ry * 0.72)}" stroke="${C.ink}" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.28"/>
    <path d="M${f(cx - 6)},${f(bottom + 8)} L${f(cx)},${f(bottom - 1)} L${f(cx + 6)},${f(bottom + 8)} Z" fill="${color}"/>
    <path d="M${f(cx)},${f(bottom + 8)} C${f(cx - 12)},${f(bottom + 8 + stringLen * 0.35)} ${f(cx + 12)},${f(bottom + 8 + stringLen * 0.7)} ${f(cx - 2)},${f(bottom + 8 + stringLen)}" stroke="${C.soft}" stroke-width="1.6" fill="none" opacity="0.7"/>
    <g${glowSigns ? ' filter="url(#glow)"' : ''}>${signs}${signAnim}</g>
    ${groupAnim}
  </g>`;
}

// ======================================================== סצנה 1: ruler_paper
const R = { tableY: 236, x1: 150, x2: 490, top: 62, bottom: 96, cx: 320 };
const BIT_T = { w: 52, h: 20 };   // פיסת היעד (עם סימני המטען)
const BIT_O = { w: 34, h: 12 };   // פיסות שכנות ניטרליות
const OTHER_BITS = [{ x: 232, rot: -3 }, { x: 276, rot: 2 }, { x: 364, rot: -2 }, { x: 408, rot: 3 }];
const HANG_GAP = 46;              // שלב 9: מרחק התלייה מתחת לסרגל (F = W)
const TARGET_TOP = R.tableY - BIT_T.h;
const REST_DIST = TARGET_TOP - R.bottom; // מרחק המנוחה בין הסרגל לנייר, בפיקסלים

const paperStyle = `fill="${C.ink}" fill-opacity="0.16" stroke="${C.ink}" stroke-width="1.6"`;

function tableAndWool() {
  return `<rect x="40" y="${R.tableY}" width="560" height="14" rx="3" fill="${C.body}" stroke="${C.trace}" stroke-width="2"/>
    <g opacity="0.85">
      <circle cx="78" cy="223" r="13" fill="${C.soft}" fill-opacity="0.3" stroke="${C.soft}" stroke-width="1.5"/>
      <circle cx="94" cy="217" r="11" fill="${C.soft}" fill-opacity="0.3" stroke="${C.soft}" stroke-width="1.5"/>
      <circle cx="92" cy="228" r="8" fill="${C.soft}" fill-opacity="0.3" stroke="${C.soft}" stroke-width="1.5"/>
    </g>`;
}

/** פיסה ניטרלית: זעירה ושטוחה, בלי סימנים. anim = SMIL על הקבוצה החיצונית. */
function neutralBit(b, anim) {
  const x = b.x - BIT_O.w / 2, y = R.tableY - BIT_O.h;
  return `<g>
    <rect x="${x}" y="${y}" width="${BIT_O.w}" height="${BIT_O.h}" rx="2" transform="rotate(${b.rot} ${b.x} ${R.tableY})" ${paperStyle}/>
    ${anim}
  </g>`;
}

/** פיסת היעד. basic: + בצד הקרוב לסרגל (למעלה) ו-− קטן ועמום בצד הרחוק. touched
 * (שלב 3): הנייר נגע בסרגל ולכן סימני − בלבד. הסימן הקרוב = world.target.sign. */
function targetBit(w, anim) {
  const x = R.cx - BIT_T.w / 2;
  const s = w.target.sign;
  const signs = w.variant === 'touched'
    ? chargeSign(R.cx - 14, TARGET_TOP + 10, s, 4) + chargeSign(R.cx + 14, TARGET_TOP + 10, s, 4)
    : chargeSign(R.cx, TARGET_TOP + 6.5, s, 4.5) + chargeSign(R.cx, TARGET_TOP + 15, -s, 3, 0.4);
  return `<g>
    <rect x="${x}" y="${TARGET_TOP}" width="${BIT_T.w}" height="${BIT_T.h}" rx="2" ${paperStyle}/>
    ${signs}
    ${anim}
  </g>`;
}

function rulerShape(w, energized) {
  const ticks = [];
  for (let i = 0; i <= 20; i++) {
    const x = R.x1 + 10 + i * 16;
    ticks.push(`<line x1="${x}" y1="${R.top}" x2="${x}" y2="${R.top + (i % 5 === 0 ? 12 : 7)}" stroke="${C.soft}" stroke-width="1.4"/>`);
  }
  const signs = [0, 1, 2, 3, 4, 5].map(i => chargeSign(190 + i * 52, R.top + 22, w.source.sign, 4.5)).join('');
  const glow = energized ? ' filter="url(#glow)"' : '';
  return `<rect x="${R.x1}" y="${R.top}" width="${R.x2 - R.x1}" height="${R.bottom - R.top}" rx="5" fill="${C.body}" stroke="${C.soft}" stroke-width="2"/>
    ${ticks.join('')}
    <g${glow}>${signs}${energized ? sparkle(0) : ''}</g>`;
}

/** תנועת פיסת היעד לפי שם האנימציה (world.success.anim). */
function targetMotion(anim) {
  const dy = REST_DIST;
  switch (anim) {
    case 'paper_jumps_to_ruler': // L1: קופצת ונצמדת (חריגה קלה מתחת לסרגל, מוסתרת מאחוריו)
      return `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${-(dy + 6)};0 ${-dy}" keyTimes="0;0.75;1" dur="0.9s" fill="freeze"/>`;
    case 'paper_leaps_to_ruler': // L7: קשת קצרה ונדבקת
      return `<animateMotion dur="1s" fill="freeze" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.4 0 0.2 1" path="M0,0 C 22,-70 -14,${-(dy + 10)} 0,${-dy}"/>`;
    case 'paper_thrown_away': // L3: דחייה - נזרקת הצידה ונוחתת על השולחן
      return `<animateMotion dur="1.2s" fill="freeze" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.3 0 0.3 1" path="M0,0 C 20,-70 150,-90 190,0"/>`;
    case 'paper_hangs_in_equilibrium': { // L9: מתנתקת ונשארת תלויה (F = W)
      const up = dy - HANG_GAP;
      return `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${-(up + 8)};0 ${-up}" keyTimes="0;0.7;1" dur="1.1s" fill="freeze"/>`;
    }
    default: return '';
  }
}

function rulerPaperScene(w, energized) {
  const a = w.success.anim;
  const single = a === 'paper_hangs_in_equilibrium' || w.variant === 'touched';
  const parts = [tableAndWool()];

  // פיסות שכנות (ניטרליות). בשלב 1 קופצות גם הן אל הסרגל, בשלב 7 רק רועדות.
  if (!single) {
    OTHER_BITS.forEach((b, i) => {
      let anim = '';
      if (energized && a === 'paper_jumps_to_ruler') {
        const d = (R.tableY - BIT_O.h) - R.bottom;
        anim = `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${-(d + 6)};0 ${-d}" keyTimes="0;0.75;1" dur="0.9s" begin="${f(i * 0.1)}s" fill="freeze"/>`;
      } else if (energized && a === 'paper_leaps_to_ruler') {
        anim = `<animateTransform attributeName="transform" type="translate" values="0 0;-2 0;2 0;-2 0;2 0;0 0" dur="0.5s" repeatCount="2"/>`;
      }
      parts.push(neutralBit(b, anim));
    });
  }
  parts.push(targetBit(w, energized ? targetMotion(a) : ''));

  // הסרגל נצייר אחרי הפיסות - חריגת הקפיצה נחבאת מאחוריו.
  parts.push(rulerShape(w, energized));

  // סמן המרחק r (נעלם ברגע שהניסוי זז).
  const mid = (R.bottom + TARGET_TOP) / 2;
  parts.push(`<g>
    ${distLine(R.cx, R.bottom, R.cx, TARGET_TOP)}
    ${tag(R.cx + 12, mid + 4, rText(w, energized), { anchor: 'start' })}
    ${energized ? fadeOut(0.1, 0.4) : ''}
  </g>`);

  if (energized) parts.push(rulerSuccessExtras(a));
  return parts.join('\n');
}

/** מה שמופיע רק אחרי שהאנימציה הסתיימה: חצים. */
function rulerSuccessExtras(a) {
  if (a === 'paper_jumps_to_ruler' || a === 'paper_leaps_to_ruler') {
    // הנייר נצמד לסרגל: חץ הכוח מתחתיו, מצביע כלפי מעלה (אל הסרגל).
    const stuckBottom = R.bottom + BIT_T.h;
    return revealAt(REVEAL_T, `${arrowShape(R.cx, stuckBottom + 40, R.cx, stuckBottom + 4, C.force, { glow: true })}
      ${tag(R.cx + 18, stuckBottom + 24, 'F', { anchor: 'start' })}`);
  }
  if (a === 'paper_thrown_away') {
    // דחייה: חץ הכוח מצביע הרחק מהסרגל, ליד מקום הנחיתה.
    const landX = R.cx + 190, y = TARGET_TOP + BIT_T.h / 2;
    return revealAt(REVEAL_T, `${arrowShape(landX + BIT_T.w / 2 + 4, y, landX + BIT_T.w / 2 + 56, y, C.force, { glow: true })}
      ${tag(landX + BIT_T.w / 2 + 30, y - 20, 'F')}`);
  }
  if (a === 'paper_hangs_in_equilibrium') {
    // שיווי משקל גבולי: שני חצים שווים באורכם - כוח חשמלי למעלה, משקל למטה.
    const top = R.bottom + HANG_GAP, len = 34;
    return revealAt(REVEAL_T, `${arrowShape(R.cx, top, R.cx, top - len, C.force, { glow: true })}
      ${arrowShape(R.cx, top + BIT_T.h, R.cx, top + BIT_T.h + len, C.weight)}
      ${tag(R.cx + 20, top - len / 2 + 4, 'F', { anchor: 'start' })}
      ${tag(R.cx + 20, top + BIT_T.h + len / 2 + 4, 'W', { anchor: 'start' })}`);
  }
  return '';
}

// ====================================================== סצנה 2: balloon_wall
const B = { cx: 250, cy: 150, rx: 62, ry: 76, wallX: 520, floorY: 268 };
const WALL_SIGN_YS = [62, 98, 134, 170, 206, 242];
const PATCH = { cx: 84, cy: 88, rx: 40, ry: 28 };   // טלאי שיער (שלב 5)

function wallAndFloor() {
  const bricks = [64, 104, 144, 184, 224].map(y =>
    `<line x1="${B.wallX + 4}" y1="${y}" x2="584" y2="${y}" stroke="${C.trace}" stroke-width="1" opacity="0.35"/>`).join('');
  return `<line x1="40" y1="${B.floorY}" x2="584" y2="${B.floorY}" stroke="${C.trace}" stroke-width="3" stroke-linecap="round"/>
    <rect x="${B.wallX}" y="24" width="64" height="${B.floorY - 24}" rx="3" fill="${C.body}" stroke="${C.border}" stroke-width="2"/>
    ${bricks}`;
}

/** שורת סימנים על פני הקיר שמול הבלון - הצד הקרוב של הקיר הניטרלי. */
function wallSigns(sign, energized) {
  const signs = WALL_SIGN_YS.map(y => chargeSign(B.wallX + 14, y, sign, 5)).join('');
  return `<g${energized ? ' filter="url(#glow)"' : ''}>${signs}${energized ? sparkle(0.2) : ''}</g>`;
}

/** טלאי שיער: קו מתאר "משונן" (רדיוס מאפנן) + סימני + (השיער איבד אלקטרונים). */
function hairPatch() {
  const pts = [];
  for (let i = 0; i < 32; i++) {
    const t = (i / 32) * Math.PI * 2;
    const k = 1 + 0.1 * Math.sin(t * 9);
    pts.push(`${f(PATCH.cx + Math.cos(t) * PATCH.rx * k)},${f(PATCH.cy + Math.sin(t) * PATCH.ry * k)}`);
  }
  const signs = [[-16, -6], [10, -10], [15, 8], [-10, 10]]
    .map(([dx, dy]) => chargeSign(PATCH.cx + dx, PATCH.cy + dy, +1, 4)).join('');
  return `<polygon points="${pts.join(' ')}" fill="${C.soft}" fill-opacity="0.22" stroke="${C.soft}" stroke-width="1.8" stroke-linejoin="round"/>
    ${signs}`;
}

/** שלב 5: אלקטרונים (עיגולי −) קופצים אחד אחרי השני מהטלאי אל פני הבלון. */
function electronHops() {
  const sx = PATCH.cx + PATCH.rx + 2, sy = PATCH.cy + 4;     // נקודת יציאה
  const ex = B.cx - 50, ey = B.cy - 44;                      // נקודה על קו המתאר של הבלון
  const path = `M0,0 Q${f((ex - sx) / 2)},${-46} ${f(ex - sx)},${f(ey - sy)}`;
  return [0, 1, 2, 3, 4].map(i => {
    const t0 = f(i * 0.22);
    return `<g opacity="0">
      <circle cx="${sx}" cy="${sy}" r="6.5" fill="${C.neg}" filter="url(#dotglow)"/>
      <path d="M${sx - 3},${sy} H${sx + 3}" stroke="${C.deep}" stroke-width="2" stroke-linecap="round"/>
      <set attributeName="opacity" to="1" begin="${t0}s"/>
      <animateMotion dur="0.5s" begin="${t0}s" fill="freeze" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.3 0 0.7 1" path="${path}"/>
      <animate attributeName="opacity" to="0" begin="${f(i * 0.22 + 0.5)}s" dur="0.12s" fill="freeze"/>
    </g>`;
  }).join('');
}

function balloonWallScene(w, energized) {
  const a = w.success.anim;
  const hair = w.variant === 'hair_patch';
  const slide = energized && (a === 'balloon_slides_to_wall' || a === 'balloon_slides_to_wall_r_blinks');
  const dx = B.wallX - (B.cx + B.rx);            // כמה הבלון צריך לנוע עד המגע
  const parts = [wallAndFloor()];

  if (w.target) parts.push(wallSigns(w.target.sign, slide));
  if (hair) parts.push(hairPatch());

  if (w.show.r) {
    const blink = energized && a === 'balloon_slides_to_wall_r_blinks';
    const anim = !energized ? ''
      : blink
        ? '<animate attributeName="opacity" values="1;0.15;1;0.15;1;0" keyTimes="0;0.2;0.4;0.6;0.8;1" dur="1.1s" fill="freeze"/>'
        : fadeOut(0.15, 0.4);
    parts.push(`<g>
      ${distLine(B.cx + B.rx, B.cy, B.wallX, B.cy)}
      ${tag((B.cx + B.rx + B.wallX) / 2, B.cy - 16, rText(w, energized))}
      ${anim}
    </g>`);
  }

  // הבלון. במצב הצלחה: מחליק אל הקיר ומתפחס מעט במגע; בשלב 5 הסימנים נוצצים.
  const dur = 1.1;
  parts.push(balloonShape({
    cx: B.cx, cy: B.cy, rx: B.rx, ry: B.ry, sign: w.source.sign, glowSigns: energized,
    groupAnim: slide
      ? `<animateTransform attributeName="transform" type="translate" values="0 0;${dx} 0" calcMode="spline" keyTimes="0;1" keySplines="0.55 0 0.9 0.6" dur="${dur}s" fill="freeze"/>`
      : '',
    ellipseAnim: slide
      ? `<animate attributeName="rx" values="${B.rx};${B.rx};${B.rx - 6}" keyTimes="0;0.85;1" dur="${dur}s" fill="freeze"/>
         <animate attributeName="cx" values="${B.cx};${B.cx};${B.cx + 6}" keyTimes="0;0.85;1" dur="${dur}s" fill="freeze"/>`
      : '',
    signAnim: energized && hair ? sparkle(0.5) : '',
  }));

  if (energized && hair) parts.push(electronHops());
  if (slide) {
    // כתם מגע שטוח + חץ כוח מהבלון אל הקיר (רק אחרי ההגעה).
    parts.push(revealAt(dur, `<ellipse cx="${B.wallX - 1}" cy="${B.cy}" rx="3" ry="26" fill="${C.neg}" fill-opacity="0.5"/>`));
    parts.push(revealAt(REVEAL_T, `${arrowShape(B.wallX - 82, B.cy, B.wallX - 3, B.cy, C.force, { glow: true })}
      ${tag(B.wallX - 42, B.cy + 24, 'F')}`));
  }
  return parts.join('\n');
}

// ==================================================== סצנה 3: water_balloon
const WT = { xs: 470, yTop: 58, yBot: 232, cy: 140, rx: 48, ry: 54, basinY: 238 };
const DROP_X0 = WT.xs - 9;          // הקצה השמאלי של הטיפה הקרובה - נקודת הייחוס של r
const DROP_YS = [78, 100, 120, 162, 184, 206, 226];

/** x של הזרם המתעקם בגובה y: פרבולה שמתחילה אנכית ופונה שמאלה (אל הבלון). */
const bentX = (y, D) => WT.xs - D * ((y - WT.yTop) / (WT.yBot - WT.yTop)) ** 2;

/** עיקום הזרם (פיקסלים בתחתית) לפי זווית הסטייה: D = גובה * tan(θ) / 2. */
function bendPx(w) {
  const a = w.success.anim;
  const deg = w.success.deflectionDeg != null ? w.success.deflectionDeg
    : (a === 'field_lines_stream_bends_slightly' ? 12 : 32);
  return Math.round(((WT.yBot - WT.yTop) * Math.tan(deg * Math.PI / 180)) / 2);
}

function faucetAndBasin() {
  const st = `fill="${C.body}" stroke="${C.soft}" stroke-width="1.6"`;
  return `<path d="M240,${WT.basinY} H592 L578,268 H254 Z" fill="${C.body}" stroke="${C.border}" stroke-width="2" stroke-linejoin="round"/>
    <rect x="458" y="10" width="170" height="24" rx="5" ${st}/>
    <rect x="458" y="10" width="24" height="42" rx="4" ${st}/>
    <rect x="453" y="48" width="34" height="9" rx="2" ${st}/>`;
}

/** זרם ישר ורגוע: חוט דק + טיפות קטנות. הטיפה הקרובה (עם הסימן) נפרדת. */
function straightStream() {
  const drops = DROP_YS.map(y => `<circle cx="${WT.xs}" cy="${y}" r="3.6" fill="${C.neg}" fill-opacity="0.85"/>`).join('');
  return `<line x1="${WT.xs}" y1="${WT.yTop}" x2="${WT.xs}" y2="${WT.yBot}" stroke="${C.neg}" stroke-width="2" opacity="0.35"/>${drops}`;
}

/** זרם מתעקם (מצב הצלחה): חוט מעוקל + טיפות שנעות לאורכו ברצף. */
function bentStream(D) {
  const path = `M${WT.xs},${WT.yTop} Q${WT.xs},${(WT.yTop + WT.yBot) / 2} ${WT.xs - D},${WT.yBot}`;
  const n = 8, dur = 1.5;
  const drops = Array.from({ length: n }).map((_, i) => `
    <circle r="3.6" fill="${C.neg}" fill-opacity="0.85">
      <animateMotion dur="${dur}s" begin="-${f(i * dur / n)}s" repeatCount="indefinite" path="${path}"/>
    </circle>`).join('');
  return `<path d="${path}" fill="none" stroke="${C.neg}" stroke-width="2" opacity="0.35"/>${drops}`;
}

/** הטיפה הקרובה: אליפסה כהה עם קו מתאר, וסימן המטען שלה (target.sign). */
function targetDrop(sign, anim) {
  return `<g>
    <ellipse cx="${WT.xs}" cy="${WT.cy}" rx="9" ry="11" fill="${C.body}" stroke="${C.neg}" stroke-width="2.2"/>
    ${chargeSign(WT.xs, WT.cy + 1, sign, 4)}
    ${anim}
  </g>`;
}

/** קווי שדה מקווקווים שמצביעים אל הבלון (מטען שלילי). הקרניים יוצאות ממרכז הבלון. */
function fieldLines(bcx, tipX, withCenter) {
  // בלי קרן מרכזית כשיש חץ כוח אופקי באותו גובה; הזוויות נבחרו שלא לפגוע באגן ובתווית F.
  const degs = withCenter ? [-18, -9, 0, 9, 18] : [-22, -13, 13, 22];
  return degs.map(deg => {
    const t = deg * Math.PI / 180, ux = Math.cos(t), uy = Math.sin(t);
    const rEdge = 1 / Math.sqrt((ux / WT.rx) ** 2 + (uy / WT.ry) ** 2) + 6;
    const sx = tipX, sy = WT.cy + Math.tan(t) * (tipX - bcx);
    const ex = bcx + ux * rEdge, ey = WT.cy + uy * rEdge;
    return arrowShape(sx, sy, ex, ey, C.force, { width: 1.8, head: 9, dash: '6,5' });
  }).join('');
}

function waterBalloonScene(w, energized) {
  const a = w.success.anim;
  const two = w.variant === 'two_distances';
  const parts = [faucetAndBasin()];

  // גיאומטריית הבלון (במצב שני מרחקים: רחוק מלא + קרוב רפאים, ביחס מהמחולל).
  let cx, cxFar = 0, cxNear = 0;
  if (two) {
    const rel = (w.geometry && w.geometry.rNearRel) || 1 / 3;
    const dFar = 250;
    cxFar = DROP_X0 - dFar - WT.rx;
    cxNear = DROP_X0 - dFar * rel - WT.rx;
    cx = cxFar;
  } else {
    cx = DROP_X0 - 183 - WT.rx;
  }
  const tipX = DROP_X0 + 3;           // קצה ימני של סמני המרחק (ליד הטיפה)
  const D = bendPx(w);
  const dropDx = -D * ((WT.cy - WT.yTop) / (WT.yBot - WT.yTop)) ** 2;

  // הזרם: ישר במנוחה. בהצלחה - הישר מתעמעם והמתעקם מופיע.
  parts.push(`<g>${straightStream()}${energized ? fadeOut(0.8, 0.5) : ''}</g>`);
  if (energized) {
    parts.push(`<g opacity="0">${bentStream(D)}<animate attributeName="opacity" from="0" to="1" begin="0.8s" dur="0.5s" fill="freeze"/></g>`);
  }
  parts.push(targetDrop(w.target.sign, energized
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;${f(dropDx)} 0" begin="0.6s" dur="0.8s" fill="freeze"/>` : ''));

  // סמני מרחק (במצב מנוחה בלבד - בהצלחה הם נעלמים כי הגיאומטריה זזה).
  if (w.show.r || w.show.rPrime) {
    const mk = [];
    if (two) {
      const edgeFar = cxFar + WT.rx, edgeNear = cxNear + WT.rx;
      const yDim = 70;
      mk.push(extLine(edgeFar, yDim, edgeFar, WT.cy - 2), extLine(tipX, yDim, tipX, WT.cy - 14));
      mk.push(distLine(edgeFar, yDim, tipX, yDim));
      mk.push(tag((edgeFar + tipX) / 2, yDim - 12, 'r'));
      mk.push(distLine(edgeNear, WT.cy, tipX, WT.cy));
      mk.push(tag((edgeNear + tipX) / 2, WT.cy - 16, 'r′'));
    } else {
      const edge = cx + WT.rx;
      mk.push(distLine(edge, WT.cy, tipX, WT.cy));
      mk.push(tag((edge + tipX) / 2, WT.cy - 16, rText(w, energized)));
    }
    parts.push(`<g>${mk.join('')}${energized ? fadeOut(0.1, 0.4) : ''}</g>`);
  }

  // רפאים של הבלון הקרוב (שלב 4): אליפסה מקווקוות. בהצלחה הבלון מגיע אליה.
  if (two) {
    parts.push(`<g opacity="0.8"><ellipse cx="${f(cxNear)}" cy="${WT.cy}" rx="${WT.rx}" ry="${WT.ry}" fill="none" stroke="${C.neg}" stroke-width="2" stroke-dasharray="6,5"/>${energized ? fadeOut(1.0, 0.2) : ''}</g>`);
  }

  // הבלון (במצב שני מרחקים: מחליק אל מיקום הרפאים).
  const slideAnim = energized && two
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;${f(cxNear - cxFar)} 0" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.6 1" dur="1.1s" fill="freeze"/>`
    : '';
  parts.push(balloonShape({
    cx, cy: WT.cy, rx: WT.rx, ry: WT.ry, sign: w.source.sign, stringLen: 36,
    groupAnim: slideAnim, glowSigns: energized, signAnim: energized ? sparkle(0) : '',
  }));

  if (energized) parts.push(waterSuccessExtras(w, two ? cxNear : cx, dropDx));
  return parts.join('\n');
}

/** מה שמופיע רק אחרי שהאנימציה הסתיימה: חצי כוח/משקל וקווי שדה. */
function waterSuccessExtras(w, bcx, dropDx) {
  const { arrows, fieldLines: lines } = w.success;
  const px = WT.xs + dropDx;          // מיקום הטיפה הקרובה אחרי העיקום
  const base = 32;
  const out = [];
  const forceLabel = w.variant === 'two_distances' ? 'F′' : 'F';
  // קווי השדה קודם (מתחת), כדי שהחצים והתוויות יישארו קריאים מעליהם.
  if (lines) out.push(fieldLines(bcx, px - 22, !(arrows && arrows.length)));
  (arrows || []).forEach(ar => {
    const len = Math.min(base * ar.lengthRel, 100);
    if (ar.kind === 'force') {
      out.push(arrowShape(px - 12, WT.cy, px - 12 - len, WT.cy, C.force, { glow: true }));
      out.push(tag(px - 12 - len / 2, WT.cy - 18, forceLabel));
    } else {
      out.push(arrowShape(px, WT.cy + 14, px, WT.cy + 14 + len, C.weight));
      out.push(tag(px + 16, WT.cy + 14 + len / 2 + 4, 'W', { anchor: 'start' }));
    }
  });
  return out.length ? revealAt(REVEAL_T, out.join('')) : '';
}

// -------------------------------------------------------------- הרכבת הסצנה
function wrapSvg(parts) {
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${GLOW_FILTERS}</defs>
  <rect x="0" y="0" width="${W}" height="${H}" rx="16" fill="${C.deep}" fill-opacity="0.55"/>
  ${parts.join('\n')}
  </svg>`;
}

function buildScene(level, energized) {
  const w = level.world;
  const parts = [];
  if (w.scene === 'ruler_paper') parts.push(rulerPaperScene(w, energized));
  else if (w.scene === 'balloon_wall') parts.push(balloonWallScene(w, energized));
  else parts.push(waterBalloonScene(w, energized));
  if (!energized) parts.push(unknownChip(w));
  return wrapSvg(parts);
}

// -------------------------------------------------------------- ייצוא (חוזה)
export function renderStaticCharge(level, energized = false) {
  return { svg: buildScene(level, energized), width: W, height: H };
}
