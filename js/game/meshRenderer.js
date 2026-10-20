// ==========================================================================
// meshRenderer.js - "שיטת זרמי החוגים": מעגל דו-לולאתי (מלבן אחד עם ענף אמצעי
// אנכי), כמו הסרטוט בחוברת התלמיד:
//   ענף שמאלי: R1 למעלה ו-E1 מתחתיו.   ענף אמצעי: R2 (משותף).   ענף ימני: R3 למעלה ו-E2 מתחתיו.
// שני זרמי הלולאה בכיוון השעון (שמאל: עולה בענף השמאלי, יורד ב-R2. ימין: עולה ב-R2, יורד בענף הימני).
// בציור רק שמות (R₁, E₁...) - הערכים בטבלה שליד הזירה. 5 רמזים מצטברים (opts.hints) נכתבים על גבי המעגל:
//   1 חיצי הלולאות I₁ ו-I₂    2 משוואת לולאה 1 (סימנים)    3 משוואת לולאה 2    4 אותן משוואות עם ערכים    5 משוואה בנעלם אחד (כמו במצגת: מבודדים I₁, מציבים, מקבלים D·I₂ = N).
// energized=true (אחרי פתרון נכון): נקודות זרימה בכיוון הזרם האמיתי (לפי הסימן של I1, I2, IR2) -
// כך רואים שזרם לולאה שלילי זורם בפועל נגד כיוון השעון, ושבענף המשותף הזרם הוא ההפרש.
// הפונקציה טהורה ודטרמיניסטית: הזירה מרונדרת מחדש מאפס בכל שינוי (innerHTML).
// כל האנימציות הן CSS בתוך ה-SVG, ומכבדות prefers-reduced-motion (ואז נשארים רק חיצי הכיוון הסטטיים).
// ==========================================================================

const W = 900, H = 650;

// ---- גיאומטריה (יחידות viewBox)
const L = 110, M = 450, R = 790;      // x של הענף השמאלי / האמצעי / הימני
const T = 96, B = 540;                // y של החוט העליון / התחתון
const RY = 185, RHALF = 52, RAMP = 15; // מרכז הנגדים, חצי אורכם, משרעת הזיגזג
const EY = 490, PGAP = 12;            // מרכז הסוללות, חצי המרחק בין הלוחיות
const CX1 = (L + M) / 2, CX2 = (M + R) / 2; // מרכזי הלולאות
const LOOP_CY = 180, LOOP_RX = 64, LOOP_RY = 50;

// ---- צבעים (הפלטה של שאר הרינדררים בזירה הכהה)
const WIRE = '#e8ecff';                 // כמו מעגל המקור ב-voltageSourceRenderer
const RES = 'var(--px-brand-bright)';   // זיגזג נגד
const INK = 'var(--px-ink-inverse)';    // שמות רכיבים
const SOFT = 'var(--px-ink-inverse-soft)';
const C1 = 'var(--px-amber)';           // לולאה 1: כתום, קו רצוף, ראש חץ מלא
const C2 = 'var(--px-sky)';             // לולאה 2: כחול, קו מקווקו, ראש חץ פתוח (V)
const REVC = 'var(--px-coral)';         // תג "הפוך"
const PLATE = '#080b16';                // לוחית רקע כהה (כמו labelPlate)

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = x => (Math.round(x * 10) / 10).toString();

// ---------------------------------------------------------------- עזרי גאומטריה
const rad = d => d * Math.PI / 180;
const pt = (cx, cy, rx, ry, deg) => [cx + rx * Math.cos(rad(deg)), cy + ry * Math.sin(rad(deg))];
/** וקטור משיק יחידה בנקודה deg של אליפסה (cw = בכיוון השעון, זווית עולה במסך כי y כלפי מטה). */
function tangent(rx, ry, deg, cw) {
  let tx = -rx * Math.sin(rad(deg)), ty = ry * Math.cos(rad(deg));
  if (!cw) { tx = -tx; ty = -ty; }
  const n = Math.hypot(tx, ty) || 1;
  return [tx / n, ty / n];
}
function arcPath(cx, cy, rx, ry, a0, a1, cw) {
  const [x0, y0] = pt(cx, cy, rx, ry, a0), [x1, y1] = pt(cx, cy, rx, ry, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${f1(x0)},${f1(y0)} A${rx},${ry} 0 ${large} ${cw ? 1 : 0} ${f1(x1)},${f1(y1)}`;
}
const polyD = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${f1(p[0])},${f1(p[1])}`).join(' ');

/** משולש מלא שקודקודו בכיוון (dx,dy), ממורכז סביב (x,y). */
function arrowHead(x, y, dx, dy, size, fill, stroke) {
  const nx = -dy, ny = dx, hl = size, hw = size * 0.62;
  const tip = [x + dx * hl * 0.6, y + dy * hl * 0.6];
  const bx = x - dx * hl * 0.4, by = y - dy * hl * 0.4;
  const a = [bx + nx * hw, by + ny * hw], b = [bx - nx * hw, by - ny * hw];
  return `<polygon points="${[tip, a, b].map(q => f1(q[0]) + ',' + f1(q[1])).join(' ')}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="2" stroke-linejoin="round"` : ''}/>`;
}

// ---------------------------------------------------------------- רכיבים
function wires() {
  const seg = d => `<path d="${d}" fill="none" stroke="${WIRE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const rTop = RY - RHALF, rBot = RY + RHALF, eTop = EY - PGAP, eBot = EY + PGAP;
  return [
    // שמאל: פינה עליונה -> R1 | R1 -> סוללה | סוללה -> פינה תחתונה -> אמצע
    seg(`M${M},${T} L${L},${T} L${L},${rTop}`), seg(`M${L},${rBot} L${L},${eTop}`), seg(`M${L},${eBot} L${L},${B} L${M},${B}`),
    // ימין
    seg(`M${M},${T} L${R},${T} L${R},${rTop}`), seg(`M${R},${rBot} L${R},${eTop}`), seg(`M${R},${eBot} L${R},${B} L${M},${B}`),
    // אמצע: R2
    seg(`M${M},${T} L${M},${rTop}`), seg(`M${M},${rBot} L${M},${B}`),
    `<circle cx="${M}" cy="${T}" r="6.5" fill="${WIRE}"/><circle cx="${M}" cy="${B}" r="6.5" fill="${WIRE}"/>`,
  ].join('');
}

/** נגד אנכי: זיגזג (7 פסגות מתחלפות) בין שני חוטי הובלה קצרים. */
function resistor(x) {
  const y0 = RY - RHALF, y1 = RY + RHALF, lead = 8, n = 8;
  const step = (y1 - y0 - 2 * lead) / n;
  const pts = [[x, y0], [x, y0 + lead]];
  for (let k = 1; k < n; k++) pts.push([x + (k % 2 ? RAMP : -RAMP), y0 + lead + k * step]);
  pts.push([x, y1 - lead], [x, y1]);
  return `<polyline points="${pts.map(p => f1(p[0]) + ',' + f1(p[1])).join(' ')}" fill="none" stroke="${RES}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
}

/** סוללה על ענף אנכי: לוחית ארוכה (+) ודקה, לוחית קצרה (-) ועבה, כמו ב-voltageSourceRenderer.
 * longTop = הלוחית הארוכה למעלה. inside = +1 / -1: לאיזה צד (ימינה/שמאלה) מופיעים הסימנים + ו-− (פנים הלולאה). */
function battery(x, longTop, inside) {
  const yTop = EY - PGAP, yBot = EY + PGAP;
  const yLong = longTop ? yTop : yBot, yShort = longTop ? yBot : yTop;
  const mx = x + inside * 46;
  // + ו-− מצוירים כקווים (לא כתווים): חדים בכל גודל ולא תלויים בגופן
  const mark = (y, plus) => `<path d="M${mx - 9},${y} H${mx + 9}${plus ? ` M${mx},${y - 9} V${y + 9}` : ''}" fill="none" stroke="${WIRE}" stroke-width="4" stroke-linecap="round"/>`;
  return `<g class="mesh-battery">
    <line x1="${x - 30}" y1="${yLong}" x2="${x + 30}" y2="${yLong}" stroke="${WIRE}" stroke-width="4" stroke-linecap="round"/>
    <line x1="${x - 16}" y1="${yShort}" x2="${x + 16}" y2="${yShort}" stroke="${WIRE}" stroke-width="9"/>
    ${mark(yLong, true)}${mark(yShort, false)}
  </g>`;
}

/** תג "↺ הפוך" ליד מקור שמחובר נגד כיוון הסבב. החץ המעגלי מצויר ב-SVG (לא תו) כדי שלא יהיה תלוי בגופן. */
function reverseTag(cx, cy) {
  const ix = cx + 26;
  const a0 = 335, a1 = 65; // חץ מעגלי נגד כיוון השעון (ccw): זווית יורדת
  const r = 8;
  const [ex, ey] = pt(ix, cy, r, r, a1);
  const [tx, ty] = tangent(r, r, a1, false);
  return `<g class="mesh-revtag">
    <rect x="${cx - 44}" y="${cy - 16}" width="88" height="32" rx="16" fill="${PLATE}" fill-opacity="0.86" stroke="${REVC}" stroke-width="2"/>
    <path d="${arcPath(ix, cy, r, r, a0, a1, false)}" fill="none" stroke="${REVC}" stroke-width="2.6" stroke-linecap="round"/>
    ${arrowHead(ex, ey, tx, ty, 9, REVC)}
    <text x="${cx - 9}" y="${cy + 7}" text-anchor="middle" direction="rtl" class="mesh-he" fill="${REVC}" font-size="19" font-weight="700">הפוך</text>
  </g>`;
}

// ---------------------------------------------------------------- רמז 1: חיצי הלולאות
function loopArrow(cx, color, dashed, label) {
  const a0 = 38, a1 = 345;
  const d = arcPath(cx, LOOP_CY, LOOP_RX, LOOP_RY, a0, a1, true);
  const [px, py] = pt(cx, LOOP_CY, LOOP_RX, LOOP_RY, a1);
  const [tx, ty] = tangent(LOOP_RX, LOOP_RY, a1, true);
  let head;
  if (!dashed) {
    head = arrowHead(px, py, tx, ty, 22, color);
  } else {
    // ראש פתוח בצורת V (הבדל נוסף מלבד הצבע והקו המקווקו, לטובת עיוורי צבעים)
    const nx = -ty, ny = tx, back = 14, side = 11;
    const tip = [px + tx * 8, py + ty * 8];
    const p1 = [px - tx * back + nx * side, py - ty * back + ny * side], p2 = [px - tx * back - nx * side, py - ty * back - ny * side];
    head = `<polyline points="${f1(p1[0])},${f1(p1[1])} ${f1(tip[0])},${f1(tip[1])} ${f1(p2[0])},${f1(p2[1])}" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return `<g class="mesh-loop">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="${dashed ? 'butt' : 'round'}"${dashed ? ' stroke-dasharray="11 8"' : ''}/>
    ${head}
    <text x="${cx}" y="${LOOP_CY + 13}" text-anchor="middle" direction="ltr" class="mesh-ilabel" fill="${color}" font-size="38" font-weight="800">${label}</text>
  </g>`;
}

// ---------------------------------------------------------------- משוואות בתוך הלולאות
const CW = 0.62;         // רוחב תו משוער (em) בגופן monospace - שמרני
const EQ_AVAIL = 296;    // רוחב זמין לטקסט בתוך לולאה (בין החוטים, עם שוליים)
const EQ_CAP = 28, EQ_OK = 25; // גודל גופן מרבי; מתחתיו מעדיפים שבירה לעוד שורה
const EQ_TOP = 268;      // קו הבסיס של השורה הראשונה (מתחת לחץ הלולאה)
const BLOCK_GAP = 14;

const len = s => Array.from(s).length;

/** פיצול משוואה ל"אסימונים" שמותר לשבור ביניהם: אגף ראשון, [אגף שני עם האופרטור], "= אגף ימין". */
function eqTokens(eq) {
  const i = eq.lastIndexOf(' = ');
  if (i < 0) return [eq];
  const lhs = eq.slice(0, i), rhs = '= ' + eq.slice(i + 3);
  let depth = 0, idx = -1;
  for (let k = 0; k < lhs.length - 1; k++) {
    const c = lhs[k];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && (c === '+' || c === '−') && lhs[k - 1] === ' ' && lhs[k + 1] === ' ') { idx = k; break; }
  }
  return idx < 0 ? [lhs, rhs] : [lhs.slice(0, idx - 1), lhs.slice(idx), rhs];
}

/** כל חלוקות הרצף לקבוצות עוקבות (שורות). */
function compositions(tokens) {
  const out = [];
  const n = tokens.length;
  for (let mask = 0; mask < (1 << (n - 1)); mask++) {
    const lines = [tokens[0]];
    for (let k = 1; k < n; k++) {
      if (mask & (1 << (k - 1))) lines.push(tokens[k]); else lines[lines.length - 1] += ' ' + tokens[k];
    }
    out.push(lines);
  }
  return out;
}

/** בחירת חלוקה לשורות: הכי מעט שורות כל עוד הגופן >= EQ_OK; מעדיפים לשים את אגף ימין לבד. */
function layoutEq(eq) {
  const cands = compositions(eqTokens(eq)).map(lines => {
    const maxLen = Math.max(...lines.map(len));
    return { lines, font: Math.min(EQ_CAP, EQ_AVAIL / (CW * maxLen)), rhsAlone: lines.length > 1 && lines[lines.length - 1].startsWith('=') };
  });
  const ok = cands.filter(c => c.font >= EQ_OK);
  if (ok.length) {
    ok.sort((a, b) => a.lines.length - b.lines.length || (b.rhsAlone - a.rhsAlone) || b.font - a.font);
    return ok[0];
  }
  cands.sort((a, b) => b.font - a.font || a.lines.length - b.lines.length);
  return cands[0];
}

function eqBlock(cx, y0, lay, font, pitch, color, cls) {
  const tspans = lay.lines.map((ln, i) => `<text x="${cx}" y="${f1(y0 + i * pitch)}" text-anchor="middle" direction="ltr" class="mesh-eq" fill="${color}" font-size="${f1(font)}" font-weight="700">${esc(ln)}</text>`);
  return `<g class="${cls}">${tspans.join('')}</g>`;
}

// ---------------------------------------------------------------- חץ הייחוס של I(R2) (בשלבים שדורשים אותו)
/** חץ מקווקו כלפי מטה לצד הענף האמצעי: כיוון הייחוס של I(R₂). חיובי = כלפי מטה (בכיוון I₁). */
function sharedRef() {
  const x = M - 24;
  return `<g class="mesh-ref">
    <path d="M${x},452 V504" fill="none" stroke="${SOFT}" stroke-width="3.5" stroke-dasharray="7 6" stroke-linecap="round"/>
    ${arrowHead(x, 512, 0, 1, 14, SOFT)}
    <text x="${x - 12}" y="494" text-anchor="end" direction="ltr" class="mesh-name" fill="${SOFT}" font-size="26" font-weight="700">I(R₂)</text>
  </g>`;
}

// ---------------------------------------------------------------- רמז 5: שורת החיסול
function stepBanner(step) {
  const y = B + 36, h = 62;
  return `<g class="mesh-banner">
    <rect x="30" y="${y}" width="840" height="${h}" rx="18" fill="${PLATE}" fill-opacity="0.86" stroke="var(--px-brand-bright)" stroke-opacity="0.65" stroke-width="2"/>
    <text x="690" y="${y + 38}" text-anchor="middle" direction="rtl" class="mesh-he" fill="${SOFT}" font-size="25" font-weight="700">משוואה בנעלם אחד:</text>
    <text x="330" y="${y + 41}" text-anchor="middle" direction="ltr" class="mesh-eq" fill="${WIRE}" font-size="34" font-weight="800">${esc(step)}</text>
  </g>`;
}

// ---------------------------------------------------------------- אנימציית זרימה (energized)
const FLOW_PERIOD = 26;
function flowPath(points, forward, ratio) {
  const pts = forward ? points : points.slice().reverse();
  const r = Number.isFinite(ratio) ? ratio : 1;
  const dur = Math.max(0.3, Math.min(1.5, 0.3 / Math.max(r, 0.01)));
  const d = polyD(pts);
  const style = `animation-duration:${dur.toFixed(2)}s`;
  return `<path d="${d}" class="mesh-flow mesh-flow-halo" style="${style}" fill="none" stroke="${RES}" stroke-opacity="0.28" stroke-width="17" stroke-linecap="round" stroke-dasharray="0.01 ${FLOW_PERIOD}"/>
    <path d="${d}" class="mesh-flow" style="${style}" fill="none" stroke="${RES}" stroke-width="9" stroke-linecap="round" stroke-dasharray="0.01 ${FLOW_PERIOD}"/>`;
}

function flowLayer(m) {
  const I1 = Number(m.I1), I2 = Number(m.I2);
  const IR2 = m.IR2 != null ? Number(m.IR2) : I1 - I2;
  const eps = 1e-9;
  const mx = Math.max(Math.abs(I1), Math.abs(I2), Math.abs(IR2), eps);
  const out = [], heads = [];
  const HEAD = 15, HSTROKE = '#06231a';
  if (Math.abs(I1) > eps) {
    const fw = I1 > 0;
    out.push(flowPath([[M, B], [L, B], [L, T], [M, T]], fw, Math.abs(I1) / mx));
    heads.push(arrowHead(CX1, T, fw ? 1 : -1, 0, HEAD, RES, HSTROKE), arrowHead(L, 350, 0, fw ? -1 : 1, HEAD, RES, HSTROKE));
  }
  if (Math.abs(I2) > eps) {
    const fw = I2 > 0;
    out.push(flowPath([[M, T], [R, T], [R, B], [M, B]], fw, Math.abs(I2) / mx));
    heads.push(arrowHead(CX2, T, fw ? 1 : -1, 0, HEAD, RES, HSTROKE), arrowHead(R, 350, 0, fw ? 1 : -1, HEAD, RES, HSTROKE));
  }
  if (Math.abs(IR2) > eps) {
    const down = IR2 > 0;
    out.push(flowPath([[M, T], [M, B]], down, Math.abs(IR2) / mx));
    heads.push(arrowHead(M, 400, 0, down ? 1 : -1, HEAD, RES, HSTROKE));
  }
  return { dots: `<g class="mesh-flows">${out.join('')}</g>`, heads: `<g class="mesh-heads">${heads.join('')}</g>` };
}

// ---------------------------------------------------------------- נגישות
function describe(m, hints, energized) {
  const p = ['מעגל חשמלי בשתי לולאות. בענף השמאלי הנגד R₁ והמקור E₁, בענף האמצעי, המשותף לשתי הלולאות, הנגד R₂, ובענף הימני הנגד R₃ והמקור E₂.'];
  if (m.withShared) p.push('חץ הייחוס של I(R₂) מצויר כלפי מטה: זרם חיובי כלפי מטה.');
  if (m.rev1) p.push('המקור E₁ מחובר בכיוון הפוך לכיוון הסבב של לולאה 1.');
  if (m.rev2) p.push('המקור E₂ מחובר בכיוון הפוך לכיוון הסבב של לולאה 2.');
  const o = m.overlay || {};
  if (hints >= 1) p.push('רמז 1: שני זרמי הלולאה מסורטטים בכיוון השעון, I₁ בלולאה השמאלית ו-I₂ בלולאה הימנית.');
  if (hints >= 2 && o.symbolic) p.push(`רמז 2: משוואת הלולאה השמאלית: ${o.symbolic[0]}.`);
  if (hints >= 3 && o.symbolic) p.push(`רמז 3: משוואת הלולאה הימנית: ${o.symbolic[1]}.`);
  if (hints >= 4 && o.numeric) p.push(`רמז 4: המשוואות עם הערכים: ${o.numeric[0]}, ${o.numeric[1]}.`);
  if (hints >= 5 && o.step) p.push(`רמז 5: משוואה בנעלם אחד: ${o.step}.`);
  if (energized) {
    const I1 = Number(m.I1), I2 = Number(m.I2), IR2 = m.IR2 != null ? Number(m.IR2) : I1 - I2;
    const dir = x => (x > 0 ? 'בכיוון השעון' : 'נגד כיוון השעון');
    p.push(`הזרם האמיתי: בלולאה השמאלית ${dir(I1)}, בלולאה הימנית ${dir(I2)}, ` + (Math.abs(IR2) < 1e-9 ? 'ואין זרם ב-R₂.' : `וב-R₂ הזרם זורם כלפי ${IR2 > 0 ? 'מטה' : 'מעלה'}.`));
  }
  return p.join(' ');
}

// ---------------------------------------------------------------- CSS בתוך ה-SVG (בטווח .mesh-svg בלבד)
const STYLE = `
.mesh-svg text { font-family: var(--font-mono, ui-monospace, monospace); }
.mesh-svg text.mesh-he { font-family: var(--font-main, Heebo, Arial, sans-serif); }
@keyframes meshFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes meshFlow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -${FLOW_PERIOD + 0.01}; } }
.mesh-svg .mesh-fade { animation: meshFadeIn .55s ease-out both; }
.mesh-svg .mesh-flow { animation: meshFlow 1s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .mesh-svg .mesh-fade, .mesh-svg .mesh-flow { animation: none; }
}`;

// ---------------------------------------------------------------- ייצוא (חוזה)
export function renderMesh(level, energized = false, opts = {}) {
  const m = (level && level.mesh) || {};
  const hints = Math.max(0, Math.min(5, Math.floor(Number((opts && opts.hints) || 0)) || 0));
  const o = m.overlay || {};
  const out = [];

  // ---- המעגל עצמו
  out.push(wires());
  const flow = energized ? flowLayer(m) : null;
  if (flow) out.push(flow.dots);
  out.push(resistor(L), resistor(M), resistor(R));
  out.push(battery(L, !m.rev1, 1), battery(R, !!m.rev2, -1));
  if (flow) out.push(flow.heads);

  // ---- שמות הרכיבים (בלי ערכים)
  const name = (x, y, anchor, txt) => `<text x="${x}" y="${y}" text-anchor="${anchor}" direction="ltr" class="mesh-name" fill="${INK}" font-size="34" font-weight="700">${txt}</text>`;
  out.push(name(L - 40, RY + 12, 'end', 'R₁'), name(M + 34, RY + 12, 'start', 'R₂'), name(R + 40, RY + 12, 'start', 'R₃'));
  out.push(name(L - 40, EY + 12, 'end', 'E₁'), name(R + 40, EY + 12, 'start', 'E₂'));
  if (m.withShared) out.push(sharedRef());
  if (m.rev1) out.push(reverseTag(L - 58, EY + 44));
  if (m.rev2) out.push(reverseTag(R + 58, EY + 44));

  // ---- רמזים (מצטברים). רק הרמז החדש ביותר נכנס בפייד - כך רינדור מחדש אחרי טעות לא "מהבהב" את כולם.
  const fade = n => (hints === n && !(opts && opts.noFade) ? ' mesh-fade' : '');
  if (hints >= 1) {
    out.push(`<g class="mesh-hint1${fade(1)}">${loopArrow(CX1, C1, false, 'I₁')}${loopArrow(CX2, C2, true, 'I₂')}</g>`);
  }
  if (o.symbolic && o.numeric) {
    const lays = {
      s: [layoutEq(o.symbolic[0]), layoutEq(o.symbolic[1])],
      n: [layoutEq(o.numeric[0]), layoutEq(o.numeric[1])],
    };
    // גופן וגובה שורה משותפים לשתי הלולאות ולשני סוגי המשוואות - מראה אחיד, והבלוק לא קופץ כשנוסף רמז
    const font = Math.min(...lays.s.map(l => l.font), ...lays.n.map(l => l.font));
    const pitch = Math.round(font * 1.2);
    const sLines = Math.max(lays.s[0].lines.length, lays.s[1].lines.length);
    const yS = EQ_TOP, yN = EQ_TOP + sLines * pitch + BLOCK_GAP;
    if (hints >= 2) out.push(eqBlock(CX1, yS, lays.s[0], font, pitch, C1, `mesh-hint2${fade(2)}`));
    if (hints >= 3) out.push(eqBlock(CX2, yS, lays.s[1], font, pitch, C2, `mesh-hint3${fade(3)}`));
    if (hints >= 4) {
      out.push(eqBlock(CX1, yN, lays.n[0], font, pitch, C1, `mesh-hint4a${fade(4)}`));
      out.push(eqBlock(CX2, yN, lays.n[1], font, pitch, C2, `mesh-hint4b${fade(4)}`));
    }
  }
  if (hints >= 5 && o.step) out.push(`<g class="mesh-hint5${fade(5)}">${stepBanner(o.step)}</g>`);

  const label = describe(m, hints, energized);
  const svg = `<svg class="mesh-svg" viewBox="0 0 ${W} ${H}" width="100%" style="width:100%;max-width:${W}px;height:auto;direction:ltr" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">
  <title>${esc('מעגל דו-לולאתי: זרמי חוגים')}</title>
  <style>${STYLE}</style>
  ${out.join('\n  ')}
</svg>`;
  return { svg, width: W, height: H };
}
