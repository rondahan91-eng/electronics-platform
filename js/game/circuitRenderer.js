// ==========================================================================
// circuitRenderer.js - הופך עץ מעגל פתור ל-SVG: פריסה גיאומטרית, גרדיאנט
// מתח על החוטים, ואנימציית שריפה. זרימת האלקטרונים (כולל בועות "אמפר"
// המתפצלות באופן פרופורציוני לזרם האמיתי בכל ענף) מופיעה רק כשהמעגל
// "אנרגטי" - כלומר לאחר שנסגר עם תשובה נכונה (energized=true).
// ==========================================================================
import { resetPid, nextPid, GLOW_FILTERS, labeledText } from './svgUtils.js';

const LEAF_W = 108, LEAF_H = 60, GAP = 34, RAIL = 26, MARGIN = 46;

// ---------------------------------------------------------------- מדידה/פריסה
function measure(node) {
  if (!node.children) { node._w = LEAF_W; node._h = LEAF_H; return; }
  node.children.forEach(measure);
  if (node.type === 'series') {
    node._w = node.children.reduce((s, c) => s + c._w, 0) + GAP * (node.children.length - 1);
    node._h = Math.max(...node.children.map(c => c._h));
  } else {
    node._w = Math.max(...node.children.map(c => c._w)) + RAIL * 2;
    node._h = node.children.reduce((s, c) => s + c._h, 0) + GAP * (node.children.length - 1);
  }
}

function place(node, x, y) {
  node._x = x; node._y = y;
  if (!node.children) return;
  if (node.type === 'series') {
    let cx = x;
    node.children.forEach(c => { place(c, cx, y + (node._h - c._h) / 2); cx += c._w + GAP; });
  } else {
    let cy = y;
    const innerW = node._w - RAIL * 2;
    node.children.forEach(c => { place(c, x + RAIL + (innerW - c._w) / 2, cy); cy += c._h + GAP; });
  }
}
const midY = n => n._y + n._h / 2;

// ---------------------------------------------------------------- צבע לפי מתח
function colorForV(vAbs, vMax) {
  const f = Math.max(0, Math.min(1, vMax > 0 ? vAbs / vMax : 0));
  const hue = 215 - f * 215; // 215=כחול -> 0=אדום
  return `hsl(${hue} 90% 58%)`;
}

// ---------------------------------------------------------------- SVG helpers
function wirePath(d, color, id) {
  return `<path id="${id}" d="${d}" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round" filter="url(#glow)"/>`;
}
// זרימת אלקטרונים לאורך חוט - פעילה רק כאשר המעגל "אנרגטי" (נסגר, לאחר
// תשובה נכונה). opts.leader=true מוסיף בועת "אמפר" אחת שגודלה ומהירותה
// יחסיים לזרם האמיתי בענף הזה - כך שבפיצול מקבילי כל נגד מקבל אמפר בגודל
// יחסי לחלקו האמיתי בזרם הכולל (פיצול פרופורציוני למציאות).
function flowDots(pathId, currentAbs, maxCurrent, color, opts = {}) {
  if (!opts.energized) return '';
  const ratio = maxCurrent > 0 ? currentAbs / maxCurrent : 0;
  const dur = Math.max(0.45, 2.3 - ratio * 1.85).toFixed(2);
  let out = '';
  if (opts.leader) {
    const r = 6 + ratio * 9;
    out += `<g filter="url(#dotglow)">
      <animateMotion dur="${dur}s" repeatCount="indefinite"><mpath href="#${pathId}"/></animateMotion>
      <circle r="${r.toFixed(1)}" fill="var(--px-brand-bright)"/>
      <text text-anchor="middle" dy="4" font-size="${Math.max(9, r).toFixed(0)}" fill="#05060a" font-weight="900">A</text>
    </g>`;
  }
  const n = currentAbs <= 0 ? 0 : 2 + Math.round(ratio * 2);
  for (let i = 0; i < n; i++) {
    const begin = (-(i / n) * dur).toFixed(2);
    out += `<circle r="3.4" fill="${color}" filter="url(#dotglow)">
      <animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite">
        <mpath href="#${pathId}"/>
      </animateMotion>
    </circle>`;
  }
  return out;
}

function componentSymbol(node, colA, colB) {
  const w = LEAF_W, h = LEAF_H;
  const gradId = nextPid();
  const grad = `<linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${colA}"/><stop offset="1" stop-color="${colB}"/>
    </linearGradient>`;
  let body;
  if (node.kind === 'r') {
    // זיגזג נגד
    const pts = [];
    const zigN = 6, zw = (w - 20) / zigN;
    let px = 10, py = h / 2;
    pts.push(`${px},${py}`);
    for (let i = 0; i < zigN; i++) {
      px += zw / 2;
      py = h / 2 + (i % 2 === 0 ? -14 : 14);
      pts.push(`${px},${py}`);
      px += zw / 2;
      py = h / 2;
      pts.push(`${px},${py}`);
    }
    body = `<polyline points="${pts.join(' ')}" fill="none" stroke="url(#${gradId})" stroke-width="5" stroke-linejoin="round"/>`;
  } else if (node.kind === 'c') {
    // קבל: שתי לוחיות במרכז + חוטי-מוביל שמחברים אותן ברציפות לקצוות הרכיב
    // (בלעדיהם נשאר פער חזותי בין החוט הנכנס/יוצא לבין הלוחיות עצמן).
    body = `<line x1="0" y1="${h / 2}" x2="${w / 2 - 8}" y2="${h / 2}" stroke="${colA}" stroke-width="4"/>
      <line x1="${w / 2 - 8}" y1="${h / 2 - 18}" x2="${w / 2 - 8}" y2="${h / 2 + 18}" stroke="${colA}" stroke-width="5"/>
      <line x1="${w / 2 + 8}" y1="${h / 2 - 18}" x2="${w / 2 + 8}" y2="${h / 2 + 18}" stroke="${colB}" stroke-width="5"/>
      <line x1="${w / 2 + 8}" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${colB}" stroke-width="4"/>`;
  } else {
    body = `<path d="M10,${h / 2} q10,-18 20,0 q10,-18 20,0 q10,-18 20,0 q10,-18 20,0 q10,-18 20,0" fill="none" stroke="url(#${gradId})" stroke-width="4"/>`;
  }
  return { defs: grad, body };
}

// ---------------------------------------------------------------- ציור עץ רקורסיבי
function renderNode(node, vMax, maxCurrent, out, energized) {
  const y = midY(node);
  if (!node.children) {
    const colA = colorForV(node.vTop.abs(), vMax);
    const colB = colorForV(node.vBottom.abs(), vMax);
    const pathId = nextPid();
    out.defs.push(`<path id="${pathId}" d="M${node._x},${y} L${node._x + node._w},${y}" fill="none"/>`);
    const { defs, body } = componentSymbol(node, colA, colB);
    out.defs.push(defs);
    const burnClass = `burn-target`;
    out.body.push(`<g class="${burnClass}" data-leaf-id="${node.id}" transform="translate(${node._x},${node._y})">
        ${body}
        ${labeledText(node._w / 2, node._h + 16, fmtValue(node), 'comp-val')}
      </g>`);
    out.body.push(flowDots(pathId, node.current.abs(), maxCurrent, colB, { energized, leader: true }));
    return;
  }
  if (node.type === 'series') {
    node.children.forEach((c, i) => {
      renderNode(c, vMax, maxCurrent, out, energized);
      if (i < node.children.length - 1) {
        const x1 = c._x + c._w, x2 = node.children[i + 1]._x, wy = midY(c);
        const col = colorForV(c.vBottom.abs(), vMax);
        const pathId = nextPid();
        out.body.push(wirePath(`M${x1},${wy} L${x2},${wy}`, col, pathId));
        out.body.push(flowDots(pathId, c.current.abs(), maxCurrent, col, { energized }));
      }
    });
    return;
  }
  // parallel
  const railL = node._x + RAIL / 2;
  const railR = node._x + node._w - RAIL / 2;
  // כניסה/יציאה לבלוק המקבילי בגובה המרכז הכללי
  const entryCol = colorForV(node.vTop.abs(), vMax);
  const exitCol = colorForV(node.vBottom.abs(), vMax);
  let pId = nextPid();
  out.body.push(wirePath(`M${node._x},${y} L${railL},${y}`, entryCol, pId));
  out.body.push(flowDots(pId, node.current.abs(), maxCurrent, entryCol, { energized }));
  pId = nextPid();
  out.body.push(wirePath(`M${railR},${y} L${node._x + node._w},${y}`, exitCol, pId));
  out.body.push(flowDots(pId, node.current.abs(), maxCurrent, exitCol, { energized }));
  // פסי חשמל אנכיים + הסתעפויות
  out.body.push(`<line x1="${railL}" y1="${node._y}" x2="${railL}" y2="${node._y + node._h}" stroke="${entryCol}" stroke-width="4" filter="url(#glow)"/>`);
  out.body.push(`<line x1="${railR}" y1="${node._y}" x2="${railR}" y2="${node._y + node._h}" stroke="${exitCol}" stroke-width="4" filter="url(#glow)"/>`);
  node.children.forEach(c => {
    const cy = midY(c);
    const colL = colorForV(c.vTop.abs(), vMax);
    const colR = colorForV(c.vBottom.abs(), vMax);
    let sp = nextPid();
    out.body.push(wirePath(`M${railL},${cy} L${c._x},${cy}`, colL, sp));
    out.body.push(flowDots(sp, c.current.abs(), maxCurrent, colL, { energized }));
    sp = nextPid();
    out.body.push(wirePath(`M${c._x + c._w},${cy} L${railR},${cy}`, colR, sp));
    out.body.push(flowDots(sp, c.current.abs(), maxCurrent, colR, { energized }));
    renderNode(c, vMax, maxCurrent, out, energized);
  });
}

function fmtValue(node) {
  if (node.kind === 'r') return `${node.label}=${node.value}Ω`;
  if (node.kind === 'c') return `${node.label}=${node.value * 1e6}µF`;
  return `${node.label}=${node.value}H`;
}

function maxCurrentIn(node, best = { v: 0 }) {
  best.v = Math.max(best.v, node.current.abs());
  if (node.children) node.children.forEach(c => maxCurrentIn(c, best));
  return best.v;
}

// ---------------------------------------------------------------- מקור מתח + אמפר
// גובה topY הוא בדיוק קצה מסוף ה"+" (הכתום) - משם יוצא החוט לרשת הנגדים.
// SRC_LEAD הוא המרחק האנכי הכולל בין מסוף ה"+" למסוף ה"-" (הכחול) בסמל.
const SRC_LEAD = 44;
function sourceSymbol(x, topY, isAC) {
  if (isAC) {
    const cy = topY + SRC_LEAD / 2;
    return `<g transform="translate(${x},${cy})">
      <circle cx="0" cy="0" r="20" fill="none" stroke="var(--px-coral)" stroke-width="4" filter="url(#glow)"/>
      <path d="M-12,0 q6,-14 12,0 q6,14 12,0" fill="none" stroke="var(--px-coral)" stroke-width="3"/>
    </g>`;
  }
  return `<g transform="translate(${x},${topY})">
    <line x1="0" y1="0" x2="0" y2="16" stroke="var(--px-amber)" stroke-width="6"/>
    <line x1="-14" y1="16" x2="14" y2="16" stroke="var(--px-amber)" stroke-width="6"/>
    <line x1="-7" y1="28" x2="7" y2="28" stroke="var(--px-brand-bright)" stroke-width="3"/>
    <line x1="0" y1="28" x2="0" y2="${SRC_LEAD}" stroke="var(--px-brand-bright)" stroke-width="6"/>
  </g>`;
}

export function renderCircuit(level, energized = false) {
  if (level.circuitKind === 'opamp') return renderOpamp(level);
  resetPid();
  const root = level.root;
  measure(root);
  const srcX = MARGIN + 30;
  const totalH = Math.max(root._h, 130) + MARGIN * 2 + SRC_LEAD;
  place(root, srcX + 70, MARGIN + (totalH - MARGIN * 2 - SRC_LEAD - root._h) / 2);
  const totalW = root._x + root._w + MARGIN + 40;
  // topY - גובה מסוף ה"+" של המקור, וגם גובה הכניסה/יציאה של כל רשת הנגדים
  // (הרשת "מורמת" כך שהחוט השמאלי שלה יתחבר בדיוק לקו הכתום, לא לאמצע הסמל).
  const topY = midY(root);
  const vMax = level.source.voltage;
  const maxCurrent = maxCurrentIn(root);

  const out = { defs: [], body: [] };
  renderNode(root, vMax, maxCurrent, out, energized);

  // חוט "חיובי" (כתום) - מהמקור לכניסת הרשת, באותו גובה בדיוק כמו מסוף ה"+"
  const topWireId = nextPid();
  out.body.push(wirePath(`M${srcX},${topY} L${root._x},${topY}`, colorForV(root.vTop.abs(), vMax), topWireId));
  out.body.push(flowDots(topWireId, root.current.abs(), maxCurrent, colorForV(root.vTop.abs(), vMax), { energized }));

  const bottomY = totalH - 20;
  const srcBottomY = topY + SRC_LEAD;
  const returnColor = colorForV(0, vMax);
  const retId = nextPid();
  out.body.push(`<path id="${retId}" d="M${root._x + root._w},${topY} L${root._x + root._w},${bottomY} L${srcX},${bottomY} L${srcX},${srcBottomY}" fill="none" stroke="${returnColor}" stroke-width="4" filter="url(#glow)"/>`);
  out.body.push(flowDots(retId, root.current.abs(), maxCurrent, returnColor, { energized }));

  const svg = `
  <svg viewBox="0 0 ${totalW} ${totalH}" width="${Math.max(totalW, 480)}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${GLOW_FILTERS}
      ${out.defs.join('\n')}
    </defs>
    ${sourceSymbol(srcX, topY, level.isAC)}
    ${out.body.join('\n')}
    ${labeledText(srcX, srcBottomY + 24, level.isAC ? `Veff=${level.source.voltage}V @${level.source.freqHz}Hz` : `V=${level.source.voltage}V`, 'comp-val')}
  </svg>`;
  return { svg, width: totalW, height: totalH };
}

function renderOpamp(level) {
  const { vin, rin, rf, inverting } = level.opamp;
  const w = 640, h = 260;
  const svg = `
  <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${GLOW_FILTERS}
    </defs>
    <text x="40" y="${inverting ? 90 : 170}" text-anchor="middle" class="comp-val">Vin=${vin}V</text>
    <line x1="20" y1="${inverting ? 100 : 180}" x2="140" y2="${inverting ? 100 : 180}" stroke="var(--px-brand-bright)" stroke-width="4" filter="url(#glow)"/>
    <g transform="translate(140,${inverting ? 100 : 180})">
      <polyline points="0,0 60,0" fill="none" stroke="var(--px-amber)" stroke-width="5" stroke-linejoin="round"
        transform="translate(0,-10)"/>
      <text x="30" y="-16" text-anchor="middle" class="comp-label">Rin=${rin}Ω</text>
    </g>
    <line x1="200" y1="${inverting ? 100 : 180}" x2="260" y2="130" stroke="var(--px-brand-bright)" stroke-width="4" filter="url(#glow)"/>
    <polygon points="260,60 260,200 400,130" fill="rgba(124,77,255,.15)" stroke="var(--px-lilac)" stroke-width="3" filter="url(#glow)"/>
    <text x="272" y="90" class="comp-label">${inverting ? '−' : '+'}</text>
    <text x="272" y="180" class="comp-label">${inverting ? '+' : '−'}</text>
    <line x1="230" y1="${inverting ? 200 : 60}" x2="260" y2="${inverting ? 190 : 70}" stroke="var(--px-ink-inverse-soft)" stroke-width="3"/>
    <text x="220" y="${inverting ? 216 : 50}" class="comp-val" text-anchor="middle">GND</text>
    <line x1="400" y1="130" x2="520" y2="130" stroke="var(--px-coral)" stroke-width="4" filter="url(#glow)"/>
    <text x="560" y="126" text-anchor="middle" class="comp-val">Vout=?</text>
    <path d="M300,130 L300,${inverting ? 40 : 220} L440,${inverting ? 40 : 220} L440,130" fill="none" stroke="var(--px-coral)" stroke-width="3" stroke-dasharray="5,4"/>
    <g transform="translate(340,${inverting ? 24 : 204})">
      <polyline points="0,0 60,0" fill="none" stroke="var(--px-coral)" stroke-width="5" stroke-linejoin="round" transform="translate(0,-10)"/>
      <text x="30" y="-16" text-anchor="middle" class="comp-label">Rf=${rf}Ω</text>
    </g>
  </svg>`;
  return { svg, width: w, height: h };
}

// מנקה סימוני "נשרף" (אפור) משריפה קודמת - נקרא בתחילת כל ניסיון תשובה חדש,
// כדי שרכיב שנשרף בעבר לא יישאר אפור/מנותק-למראה לצמיתות על אותו שלב.
export function clearBurnMarks(container) {
  container.querySelectorAll('.burn-target').forEach(g => { g.style.filter = ''; });
}

// ---------------------------------------------------------------- אנימציית שריפה
export function triggerBurnAnimation(container, leafId) {
  const g = container.querySelector(`[data-leaf-id="${leafId}"]`);
  const stage = container.closest('.circuit-stage') || container;
  stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
  if (!g) return;
  const bbox = { x: parseFloat(g.getAttribute('transform')?.match(/-?\d+\.?\d*/g)?.[0] || 0), y: parseFloat(g.getAttribute('transform')?.match(/-?\d+\.?\d*/g)?.[1] || 0) };
  const svg = g.ownerSVGElement;
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const cx = bbox.x + LEAF_W / 2, cy = bbox.y + LEAF_H / 2;
  overlay.innerHTML = `
    <circle cx="${cx}" cy="${cy}" r="6" fill="#fff3c4">
      <animate attributeName="r" from="6" to="70" dur="0.55s" fill="freeze"/>
      <animate attributeName="opacity" from="0.9" to="0" dur="0.55s" fill="freeze"/>
    </circle>
    ${[0,1,2,3,4].map(i => `<circle cx="${cx + (i-2)*8}" cy="${cy}" r="5" fill="#6b7280">
      <animate attributeName="cy" from="${cy}" to="${cy - 40 - i*6}" dur="1.1s" fill="freeze"/>
      <animate attributeName="opacity" from="0.8" to="0" dur="1.1s" fill="freeze"/>
      <animate attributeName="r" from="5" to="12" dur="1.1s" fill="freeze"/>
    </circle>`).join('')}
  `;
  g.style.filter = 'grayscale(1) brightness(0.6)';
  svg.appendChild(overlay);
  setTimeout(() => overlay.remove(), 1200);
}
