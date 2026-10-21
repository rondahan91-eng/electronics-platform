// ==========================================================================
// knightsRenderer.js - איור "צדיקים ונוכלים": לוח בקרה, טכנאים ובלוני דיבור (SVG).
// פונקציה טהורה ודטרמיניסטית: { svg } - הזירה מרונדרת מחדש מאפס (innerHTML) קודם עם energized=false
// ואחרי הפתרון עם energized=true (חשיפה: המכסה נעלם, הנורית נחשפת, כל טכנאי מקבל תג צדיק/נוכל).
//   סצנות (ex.scene): panel (טכנאי/ת + נורית), relay (דובר אחד מצביע על עצמו ועל חברו),
//   duel (שני דוברים מצביעים זה על זה), panel2 (שני דוברים משני צדי נורית), shift (סוף משמרת).
// כל האנימציות הן CSS בתוך ה-SVG (בלי id, בלי גופנים/תמונות חיצוניים) ומכבדות prefers-reduced-motion:
// אז רואים רק את המצב הסופי (המכסה הוסר, התגים במקומם).
// ==========================================================================

const W = 900, H = 520;
const INK = '#0e1c17';
const BENCH_Y = 482;           // קצה עליון של השולחן/הרצפה: החזה של הטכנאים נחתך שם
const HEAD_Y = 336;            // מרכז הראש
const SHOULDER_Y = 398;        // גובה הכתף (מקור הזרועות)
const BUBBLE_BOTTOM = 272;     // תחתית בלון הדיבור בסצנות עם לוח
const LAMP_Y = 86, LAMP_COUNT = 12;
const lampX = i => 90 + (i - 1) * 720 / (LAMP_COUNT - 1);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = x => (Math.round(x * 10) / 10).toString();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- דמויות: מראה לפי אינדקס הטכנאי
const LOOKS = [
  { shirt: '#3d7ad6', shirt2: '#2f60ae', hat: '#f6c334', hatD: '#cf9d12', skin: '#f0c29b', skinD: '#d6a780', hair: '#3a2a20' },
  { shirt: '#8a5fd0', shirt2: '#6b45ae', hat: '#f3efe4', hatD: '#c9c2ad', skin: '#c98d65', skinD: '#ae7450', hair: '#1f1a1a' },
];

// ---------------------------------------------------------------- מדידת טקסט (חסם עליון) ופיצול שורות
// רוחב כל אות עברית באם (x1000): המקסימום מבין Arial Bold ו-Heebo Bold (שני הגופנים שבערימת --font-main) - חסם בטוח לשניהם.
const HEB_W = { 'א': 583, 'ב': 576, 'ג': 457, 'ד': 550, 'ה': 614, 'ו': 298, 'ז': 413, 'ח': 616, 'ט': 626, 'י': 311, 'ך': 521, 'כ': 491, 'ל': 496, 'ם': 611, 'מ': 630, 'ן': 326, 'נ': 386, 'ס': 613, 'ע': 543, 'ף': 594, 'פ': 587, 'ץ': 564, 'צ': 515, 'ק': 573, 'ר': 521, 'ש': 715, 'ת': 673 };
function tw(s, fs) {
  let w = 0;
  for (const ch of String(s)) {
    if (HEB_W[ch]) w += HEB_W[ch] / 1000;
    else if (ch >= '0' && ch <= '9') w += 0.556;
    else if (ch === ' ' || ch === ',' || ch === '.' || ch === '׳') w += 0.278;
    else w += 0.62;
  }
  return w * fs * 1.04;   // 4% מרווח ביטחון (קרנינג/משקל)
}
function bestSplit(wl, sp, n) {
  const N = wl.length, memo = new Map();
  const lw = (i, j) => { let w = 0; for (let k = i; k < j; k++) w += wl[k] + (k > i ? sp : 0); return w; };
  const rec = (i, k) => {
    const key = i * 16 + k;
    if (memo.has(key)) return memo.get(key);
    let res;
    if (k === 1) res = { max: lw(i, N), cuts: [N] };
    else {
      for (let j = i + 1; j <= N - (k - 1); j++) {
        const r = rec(j, k - 1), m = Math.max(lw(i, j), r.max);
        if (!res || m < res.max - 0.01) res = { max: m, cuts: [j, ...r.cuts] };
      }
    }
    memo.set(key, res);
    return res;
  };
  return rec(0, n);
}
/** שורות מאוזנות: מספר השורות הקטן ביותר שנכנס ברוחב maxInner. */
function wrapText(text, fs, maxInner) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const wl = words.map(w => tw(w, fs)), sp = tw(' ', fs);
  const total = wl.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
  let n = clamp(Math.ceil(total / maxInner), 1, words.length), best = bestSplit(wl, sp, n);
  while (best.max > maxInner && n < words.length) best = bestSplit(wl, sp, ++n);
  const lines = []; let i = 0;
  for (const cut of best.cuts) { lines.push(words.slice(i, cut).join(' ')); i = cut; }
  return lines;
}

// ---------------------------------------------------------------- בלון דיבור
/** o: text, anchor ('l' = הקצה השמאלי ב-ax, 'r' = הימני, 'c' = מרכז), ax, bottom|top, maxW, minW, fs, tail:{x,y}, cls, verdict (null | true | false), solved */
function bubble(o) {
  const padX = o.padX || 22, padY = 13, R = 20;
  let fs = o.fs || 32, lines, textW;
  for (;;) {
    lines = wrapText(o.text, fs, (o.maxW || 340) - 2 * padX);
    textW = Math.max(...lines.map(l => tw(l, fs)));
    if (lines.length <= 2 || fs <= 26) break;
    fs -= 2;
  }
  const w = Math.max(o.minW || 0, Math.ceil(textW + 2 * padX));
  const pitch = fs * 1.25;
  const h = Math.ceil(2 * padY + fs * 1.05 + (lines.length - 1) * pitch);
  const x = o.anchor === 'l' ? o.ax : o.anchor === 'r' ? o.ax - w : o.ax - w / 2;
  const y = o.top != null ? o.top : o.bottom - h;
  // זנב על הקצה התחתון
  const tailHalf = 17;
  const bx = clamp(o.tail.x, x + R + tailHalf + 2, x + w - R - tailHalf - 2);
  const d = `M${f1(x + R)},${f1(y)} H${f1(x + w - R)} Q${f1(x + w)},${f1(y)} ${f1(x + w)},${f1(y + R)} V${f1(y + h - R)} Q${f1(x + w)},${f1(y + h)} ${f1(x + w - R)},${f1(y + h)}`
    + ` H${f1(bx + tailHalf)} L${f1(o.tail.x)},${f1(o.tail.y)} L${f1(bx - tailHalf)},${f1(y + h)}`
    + ` H${f1(x + R)} Q${f1(x)},${f1(y + h)} ${f1(x)},${f1(y + h - R)} V${f1(y + R)} Q${f1(x)},${f1(y)} ${f1(x + R)},${f1(y)} Z`;
  const cxm = x + w / 2;
  const base0 = y + padY + fs * 0.82;
  const text = lines.map((ln, i) => `<text class="kn-btxt" x="${f1(cxm)}" y="${f1(base0 + i * pitch)}" text-anchor="middle" direction="rtl" font-size="${fs}" font-weight="600" fill="${INK}">${esc(ln)}</text>`).join('');
  const vout = o.solved && o.verdict != null
    ? `<path class="kn-vout" d="${d}" fill="none" stroke="${o.verdict ? 'var(--px-brand-bright, #3ddc97)' : 'var(--px-coral, #f4715c)'}" stroke-width="7" stroke-linejoin="round"/>` : '';
  const svg = `<g class="kn-bub ${o.cls || ''}">`
    + `<path d="${d}" fill="#000" opacity=".28" transform="translate(4 5)"/>`
    + `<path d="${d}" fill="#f6faf7" stroke="var(--px-sky, #4bb3e8)" stroke-width="3.5" stroke-linejoin="round"/>`
    + vout + text + `</g>`;
  return { svg, x, y, w, h, lines, fs };
}

// ---------------------------------------------------------------- ריצפה, קיר ושולחן
function room(warm) {
  let s = `<rect x="0" y="0" width="${W}" height="${H}" rx="22" fill="${warm ? '#1c1710' : '#0f2a22'}" opacity=".55"/>`;
  for (let y = 190; y < BENCH_Y; y += 46) s += `<path d="M14,${y} H${W - 14}" stroke="#fff" stroke-opacity=".035" stroke-width="2"/>`;
  s += `<rect x="0" y="${BENCH_Y}" width="${W}" height="${H - BENCH_Y}" fill="${warm ? '#1f1812' : '#0c1c24'}"/>`;
  s += `<rect x="0" y="${BENCH_Y}" width="${W}" height="8" fill="${warm ? '#6a5236' : '#3a5a70'}"/>`;
  s += `<path d="M0,${BENCH_Y + 8} H${W}" stroke="#000" stroke-opacity=".3" stroke-width="2"/>`;
  return s;
}

// ---------------------------------------------------------------- לוח הבקרה
function lidSvg(kind, x, y) {
  x = Number(f1(x));
  const q = '?';
  const mark = (fill, extra = '') => `<text x="${x}" y="${y + 17}" text-anchor="middle" direction="ltr" font-size="50" font-weight="800" fill="${fill}" ${extra}>${q}</text>`;
  if (kind === 'plate') {
    return `<g class="kn-lid kn-lid-plate"><g class="kn-lid-body">`
      + `<rect x="${x - 34}" y="${y - 34}" width="68" height="68" rx="10" fill="#5f6d7b" stroke="#cdd7e0" stroke-width="3"/>`
      + `<rect x="${x - 31}" y="${y - 31}" width="62" height="28" rx="7" fill="#fff" opacity=".16"/>`
      + [[-26, -26], [26, -26], [-26, 26], [26, 26]].map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="4" fill="#4d5966" stroke="#c4cfd9" stroke-width="1.2"/>`).join('')
      + `<rect x="${x - 15}" y="${y - 47}" width="30" height="14" rx="6" fill="#5c6874" stroke="#cdd7e0" stroke-width="2"/>`
      + `<text x="${x + 1.6}" y="${y + 18.6}" text-anchor="middle" direction="ltr" font-size="50" font-weight="800" fill="#46525e">${q}</text>`
      + mark('#f4f7fa')
      + `</g><rect class="kn-sheen" x="${x - 6}" y="${y - 32}" width="12" height="62" fill="#fff" opacity=".55" transform="skewX(-18)"/></g>`;
  }
  if (kind === 'cover') {
    const stripes = [-28, -8, 12].map(dx => `<polygon points="${x + dx},${y + 34} ${x + dx + 10},${y + 34} ${x + dx + 20},${y + 22} ${x + dx + 10},${y + 22}" fill="#2b1a08" opacity=".55"/>`).join('');
    return `<g class="kn-lid kn-lid-cover"><g class="kn-lid-body">`
      + `<rect x="${x - 34}" y="${y - 34}" width="68" height="68" rx="10" fill="#f08a24" stroke="#ffc88a" stroke-width="3"/>`
      + stripes
      + mark('#2b1a08')
      + `</g></g>`;
  }
  if (kind === 'seal') {
    return `<g class="kn-lid kn-lid-seal"><g class="kn-lid-body">`
      + `<rect x="${x - 34}" y="${y - 34}" width="68" height="68" rx="12" fill="#8a7f70" stroke="#d6c9b0" stroke-width="3"/>`
      + [[-26, -26], [26, -26], [-26, 26], [26, 26]].map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="3.4" fill="#4d443a"/>`).join('')
      + mark('#f7efe0')
      + `</g></g>`;
  }
  // grey: מכסה אפרפר-שקוף
  return `<g class="kn-lid kn-lid-grey"><g class="kn-lid-body">`
    + `<rect x="${x - 34}" y="${y - 34}" width="68" height="68" rx="12" fill="#a8b4c0" opacity=".66" stroke="#e1e8ee" stroke-width="3"/>`
    + `<polygon points="${x - 30},${y - 30} ${x + 4},${y - 30} ${x - 30},${y + 4}" fill="#fff" opacity=".22"/>`
    + mark('#f2f6f9')
    + `</g><rect class="kn-sheen" x="${x - 6}" y="${y - 32}" width="12" height="62" fill="#fff" opacity=".5" transform="skewX(-18)"/></g>`;
}

function lampStateSvg(lx, lit) {
  lx = Number(f1(lx));
  if (lit) {
    return `<g class="kn-lampon">`
      + `<circle cx="${lx}" cy="${LAMP_Y}" r="52" fill="#f2a93b" opacity=".12"/>`
      + `<circle cx="${lx}" cy="${LAMP_Y}" r="44" fill="#f2a93b" opacity=".2"/>`
      + `<circle cx="${lx}" cy="${LAMP_Y}" r="35" fill="#f2a93b" opacity=".32"/>`
      + `<circle cx="${lx}" cy="${LAMP_Y}" r="25" fill="#ffc24d" stroke="#ffe3a0" stroke-width="2.5"/>`
      + `<circle cx="${lx - 6}" cy="${LAMP_Y - 8}" r="9" fill="#fff4cf" opacity=".85"/></g>`;
  }
  return `<g class="kn-lampoff"><circle cx="${lx}" cy="${LAMP_Y}" r="25" fill="#0a1017" stroke="#32465a" stroke-width="2.5"/>`
    + `<path d="M${lx - 12},${LAMP_Y - 9} A15,15 0 0 1 ${lx + 4},${LAMP_Y - 14}" stroke="#fff" stroke-opacity=".12" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;
}

/** o: covered (מספר הנורית המכוסה) | null, kind (סוג המכסה), solved, lit, warm */
function panelSvg(o) {
  const body = o.warm ? '#2c2219' : '#1b2a3b', edge = o.warm ? '#80613f' : '#4a6684';
  const bez = o.warm ? '#150f0a' : '#0c131d', bezEdge = o.warm ? '#5b4630' : '#3a526b';
  const disc = o.warm ? '#3a2c20' : '#222f40';
  let s = `<rect x="36" y="12" width="828" height="148" rx="18" fill="${body}" stroke="${edge}" stroke-width="3"/>`
    + [[54, 30], [846, 30], [54, 142], [846, 142]].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="5" fill="${edge}" opacity=".8"/>`).join('');
  // צנרת כבלים לאורך הקיר מתחת ללוח
  for (const cx0 of [52, 836]) {
    s += `<rect x="${cx0}" y="158" width="12" height="${BENCH_Y - 158}" rx="3" fill="${o.warm ? '#3a2d20' : '#1f3446'}"/>`
      + [230, 330, 430].map(y => `<rect x="${cx0 - 3}" y="${y}" width="18" height="8" rx="3" fill="${edge}" opacity=".8"/>`).join('');
  }
  const covX = o.covered ? lampX(o.covered) : null;
  if (!(covX != null && Math.abs(covX - 130) < 110)) {
    s += `<text x="130" y="40" text-anchor="middle" direction="rtl" font-size="17" font-weight="700" fill="var(--px-ink-inverse-soft, #a9c3b7)" opacity=".75">לוח בקרה</text>`;
  }
  for (let i = 1; i <= LAMP_COUNT; i++) {
    const lx = lampX(i);
    s += `<circle cx="${f1(lx)}" cy="${LAMP_Y}" r="31" fill="${bez}" stroke="${bezEdge}" stroke-width="2.5"/>`;
    if (i === o.covered) {
      s += o.solved ? lampStateSvg(f1(lx), o.lit) : `<circle cx="${f1(lx)}" cy="${LAMP_Y}" r="25" fill="${disc}"/>`;
    } else {
      s += `<circle cx="${f1(lx)}" cy="${LAMP_Y}" r="25" fill="${disc}"/>`
        + `<path d="M${f1(lx - 13)},${LAMP_Y - 9} A15,15 0 0 1 ${f1(lx + 3)},${LAMP_Y - 15}" stroke="#fff" stroke-opacity=".1" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    }
    s += `<text x="${f1(lx)}" y="141" text-anchor="middle" direction="ltr" font-size="${i === o.covered ? 30 : 25}" font-weight="${i === o.covered ? 800 : 700}" fill="${i === o.covered ? 'var(--px-amber, #f2a93b)' : 'var(--px-ink-inverse-soft, #a9c3b7)'}">${i}</text>`;
  }
  if (o.covered) {
    const lx = f1(covX);
    s += lidSvg(o.kind, lx, LAMP_Y);
    if (o.solved) {
      const lit = !!o.lit;
      s += `<g class="kn-pop kn-cap" style="animation-delay:1.05s"><rect x="${f1(covX - 58)}" y="18" width="116" height="30" rx="15" fill="${lit ? '#f2a93b' : '#25384a'}" stroke="${lit ? '#ffe3a0' : '#6b8197'}" stroke-width="2"/>`
        + `<text x="${lx}" y="39" text-anchor="middle" direction="rtl" font-size="19" font-weight="800" fill="${lit ? '#3b2300' : '#d6e1ea'}">${lit ? 'דולקת' : 'כבויה'}</text></g>`;
    }
  }
  return s;
}

// ---------------------------------------------------------------- טכנאי/ת
/** קרן מצביעה מקווקווה עם ראש חץ */
function rayLine(x1, y1, x2, y2, cls = '') {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  if (L < 40) return '';
  const ux = dx / L, uy = dy / L, hl = 18, hw = 10;
  const bx = x2 - ux * hl, by = y2 - uy * hl;
  return `<g class="kn-ray ${cls}"><line class="kn-dash" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(bx)}" y2="${f1(by)}" stroke="var(--px-amber, #f2a93b)" stroke-width="5" stroke-linecap="round" stroke-dasharray="10 9"/>`
    + `<polygon points="${f1(x2)},${f1(y2)} ${f1(bx - uy * hw)},${f1(by + ux * hw)} ${f1(bx + uy * hw)},${f1(by - ux * hw)}" fill="var(--px-amber, #f2a93b)"/></g>`;
}

/**
 * o: cx, p (person), look, solved, verdict (true/false/undefined), speaking, gaze [dx,dy],
 *    arms: { l, r } כל אחד null | { t:'point', to:[x,y], ray:[x,y]|null, cls } | { t:'self' }
 * מחזיר { svg, rays }
 */
function technician(o) {
  const { cx, p, look, solved, speaking } = o;
  const arms = o.arms || {};
  const female = p.gender === 'f';
  const hy = HEAD_Y, gaze = o.gaze || [0, 0];
  let back = '', mid = '', front = '', rays = '';

  if (female) back += `<rect x="${cx - 44}" y="${hy - 28}" width="88" height="112" rx="40" fill="${look.hair}"/>`;

  // זרועות במנוחה (תלויות בצדדים)
  for (const side of [-1, 1]) {
    const a = arms[side < 0 ? 'l' : 'r'];
    if (a) continue;
    const x0 = side < 0 ? cx - 104 : cx + 70;
    back += `<rect x="${x0}" y="388" width="34" height="100" rx="17" fill="${look.shirt2}"/>`
      + `<circle cx="${x0 + 17}" cy="470" r="14" fill="${look.skin}"/>`;
  }
  // גוף
  mid += `<rect x="${cx - 80}" y="378" width="160" height="116" rx="34" fill="${look.shirt}"/>`
    + `<rect x="${cx - 14}" y="${hy + 28}" width="28" height="26" rx="8" fill="${look.skinD}"/>`
    + `<polygon points="${cx - 25},378 ${cx},410 ${cx + 25},378" fill="#e8eef3"/>`
    + `<path d="M${cx},410 V490" stroke="${look.shirt2}" stroke-width="3"/>`;
  // תג שם
  mid += `<rect x="${cx - 72}" y="392" width="64" height="38" rx="7" fill="#fbfdfc" stroke="${look.shirt2}" stroke-width="2"/>`
    + `<rect x="${cx - 72}" y="392" width="64" height="9" rx="4" fill="${look.shirt2}"/>`
    + `<text x="${cx - 40}" y="${392 + 29}" text-anchor="middle" direction="rtl" font-size="26" font-weight="800" fill="${INK}">${esc(p.name)}</text>`;

  // ראש
  const smile = `<path d="M${cx - 10},${hy + 20} Q${cx},${hy + 30} ${cx + 10},${hy + 20}" stroke="#4a2c26" stroke-width="3.6" fill="none" stroke-linecap="round"/>`;
  const open = `<ellipse class="kn-mouth" cx="${cx}" cy="${hy + 23}" rx="8.5" ry="6.5" fill="#6e2a2a"/>`;
  // o.turn ('a'|'b'): הפה נפתח רק בחצי המחזור שבו הבלון של הדובר פעיל (בסצנת סוף המשמרת)
  const mouth = !speaking || solved ? smile
    : o.turn ? `<g class="kn-on-${o.turn === 'a' ? 'b' : 'a'}">${smile}</g><g class="kn-mouth-turn kn-on-${o.turn}">${open}</g>`
      : open;
  front += `<circle cx="${cx - 36}" cy="${hy + 6}" r="8" fill="${look.skinD}"/><circle cx="${cx + 36}" cy="${hy + 6}" r="8" fill="${look.skinD}"/>`
    + `<circle cx="${cx}" cy="${hy}" r="36" fill="${look.skin}"/>`
    + `<circle cx="${cx - 13 + gaze[0]}" cy="${hy + 6 + gaze[1]}" r="4.4" fill="#2a2020"/><circle cx="${cx + 13 + gaze[0]}" cy="${hy + 6 + gaze[1]}" r="4.4" fill="#2a2020"/>`
    + `<path d="M${cx - 20},${hy - 1} L${cx - 7},${hy - 3} M${cx + 7},${hy - 3} L${cx + 20},${hy - 1}" stroke="${look.hair}" stroke-width="3.2" stroke-linecap="round"/>`
    + mouth
    + `<path d="M${cx - 43},${hy - 12} C${cx - 43},${hy - 62} ${cx + 43},${hy - 62} ${cx + 43},${hy - 12} Z" fill="${look.hat}"/>`
    + `<rect x="${cx - 6}" y="${hy - 50}" width="12" height="26" rx="5" fill="#fff" opacity=".28"/>`
    + `<rect x="${cx - 52}" y="${hy - 18}" width="104" height="10" rx="5" fill="${look.hatD}"/>`;

  // זרועות מורמות (לפני הגוף והראש)
  let armSvg = '';
  for (const side of [-1, 1]) {
    const a = arms[side < 0 ? 'l' : 'r'];
    if (!a) continue;
    const sx = cx + side * 68, sy = SHOULDER_Y;
    if (a.t === 'point') {
      let dx = a.to[0] - sx, dy = a.to[1] - sy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const len = clamp(L - 46, 70, 122);
      const hx = sx + dx * len, hyy = sy + dy * len, fx = hx + dx * 27, fy = hyy + dy * 27;
      armSvg += `<line x1="${f1(sx)}" y1="${sy}" x2="${f1(hx)}" y2="${f1(hyy)}" stroke="${look.shirt2}" stroke-width="28" stroke-linecap="round"/>`
        + `<line x1="${f1(hx)}" y1="${f1(hyy)}" x2="${f1(fx)}" y2="${f1(fy)}" stroke="${look.skin}" stroke-width="11" stroke-linecap="round"/>`
        + `<circle cx="${f1(hx)}" cy="${f1(hyy)}" r="15.5" fill="${look.skin}"/>`;
      if (a.ray) rays += rayLine(fx + dx * 12, fy + dy * 12, a.ray[0], a.ray[1], a.cls || '');
    } else if (a.t === 'self') {
      // כמה שהמרפק יוצא החוצה והאמה חוזרת אל החזה
      const ex = sx + side * 22, ey = 452, hx = cx + side * 15, hyy = 424;
      armSvg += `<polyline points="${sx},${sy} ${ex},${ey} ${hx},${hyy}" fill="none" stroke="${look.shirt2}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<circle cx="${hx}" cy="${hyy}" r="14" fill="${look.skin}"/>`;
      rays += `<g class="kn-self ${a.cls || ''}"><circle class="kn-ring" cx="${hx - side * 4}" cy="${hyy - 10}" r="25" fill="none" stroke="var(--px-amber, #f2a93b)" stroke-width="5"/></g>`;
    }
  }
  const pill = pillSvg(cx, p, solved, o.verdict);
  return { svg: back + mid + front + armSvg + pill, rays };
}

function verdictWord(p, v) {
  const f = p.gender === 'f';
  return v ? (f ? 'צדיקה' : 'צדיק') : (f ? 'נוכלת' : 'נוכל');
}
function pillSvg(cx, p, solved, verdict) {
  const y = 436, h = 42, w = 176;
  if (!solved) {
    return `<g class="kn-pill"><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="18" fill="#0b1f33" fill-opacity=".6" stroke="#b9c9d3" stroke-width="2.2" stroke-dasharray="6 5"/>`
      + `<text x="${cx}" y="${y + 32}" text-anchor="middle" direction="ltr" font-size="31" font-weight="800" fill="#ffffff">?</text></g>`;
  }
  const ok = !!verdict;
  const fill = ok ? '#0b7f53' : '#c13c2b', edge = ok ? 'var(--px-brand-bright, #3ddc97)' : 'var(--px-coral, #f4715c)';
  const ix = cx - w / 2 + 27, iy = y + h / 2;
  const icon = ok
    ? `<path d="M${ix - 7},${iy + 1} L${ix - 2},${iy + 7} L${ix + 8},${iy - 6}" fill="none" stroke="#0b7f53" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M${ix - 6},${iy - 6} L${ix + 6},${iy + 6} M${ix + 6},${iy - 6} L${ix - 6},${iy + 6}" fill="none" stroke="#c13c2b" stroke-width="4.4" stroke-linecap="round"/>`;
  return `<g class="kn-pop kn-verdict" style="animation-delay:.95s"><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="18" fill="${fill}" stroke="${edge}" stroke-width="3"/>`
    + `<circle cx="${ix}" cy="${iy}" r="15" fill="#fff"/>${icon}`
    + `<text x="${cx + 18}" y="${y + 31}" text-anchor="middle" direction="rtl" font-size="30" font-weight="800" fill="#fff">${verdictWord(p, ok)}</text></g>`;
}

// ---------------------------------------------------------------- ציוד תפאורה
function clockSvg(cx, cy) {
  let s = `<circle cx="${cx}" cy="${cy}" r="50" fill="#f1ead8" stroke="#5a4631" stroke-width="6"/>`;
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, r1 = i % 3 === 0 ? 38 : 43, r2 = 46;
    s += `<line x1="${f1(cx + r1 * Math.sin(a))}" y1="${f1(cy - r1 * Math.cos(a))}" x2="${f1(cx + r2 * Math.sin(a))}" y2="${f1(cy - r2 * Math.cos(a))}" stroke="#5a4631" stroke-width="${i % 3 === 0 ? 4 : 2}" stroke-linecap="round"/>`;
  }
  const hr = 5 * Math.PI / 6; // 17:00 - סוף משמרת
  s += `<line x1="${cx}" y1="${cy}" x2="${f1(cx + 26 * Math.sin(hr))}" y2="${f1(cy - 26 * Math.cos(hr))}" stroke="#2b2118" stroke-width="6" stroke-linecap="round"/>`
    + `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 38}" stroke="#2b2118" stroke-width="4" stroke-linecap="round"/>`
    + `<circle cx="${cx}" cy="${cy}" r="5" fill="#c13c2b"/>`;
  return s;
}
function relaySvg(cx) {
  const x = cx - 80, y = 412;
  return `<rect x="${x}" y="${y}" width="160" height="70" rx="8" fill="#243447" stroke="#5b7794" stroke-width="3"/>`
    + `<polygon points="${x + 6},${y} ${x - 4},${y - 28} ${x + 120},${y - 28} ${x + 130},${y}" fill="#9cc0e0" opacity=".22" stroke="#8fb0cf" stroke-width="2.5" stroke-linejoin="round"/>`
    + [0, 1, 2, 3, 4].map(i => `<rect x="${x + 18 + i * 13}" y="${y + 14}" width="9" height="42" rx="4.5" fill="#c98a4b"/>`).join('')
    + `<rect x="${x + 12}" y="${y + 56}" width="74" height="6" rx="3" fill="#8e9aa6"/>`
    + `<circle cx="${x + 112}" cy="${y + 20}" r="7" fill="#cfd8df"/><circle cx="${x + 140}" cy="${y + 20}" r="7" fill="#cfd8df"/>`
    + `<line x1="${x + 112}" y1="${y + 40}" x2="${x + 138}" y2="${y + 26}" stroke="#e6ecf1" stroke-width="5" stroke-linecap="round"/>`
    + `<circle cx="${x + 112}" cy="${y + 42}" r="5" fill="#8e9aa6"/>`;
}
function faultySvg(cx) {
  const x = cx - 62, y = 424;
  return `<rect x="${x}" y="${y}" width="124" height="58" rx="8" fill="#2c3a4b" stroke="#5c7690" stroke-width="3"/>`
    + `<rect x="${x + 10}" y="${y + 9}" width="64" height="30" rx="4" fill="#0a1218"/>`
    + `<path d="M${x + 14},${y + 30} l10,-14 l8,12 l9,-16 l9,18 l8,-12" fill="none" stroke="var(--px-coral, #f4715c)" stroke-width="3" stroke-linejoin="round"/>`
    + `<circle class="kn-blink" cx="${x + 96}" cy="${y + 18}" r="7" fill="var(--px-coral, #f4715c)"/>`
    + `<circle cx="${x + 96}" cy="${y + 40}" r="5" fill="#44566a"/>`
    + `<path d="M${x + 12},${y + 48} h60" stroke="#44566a" stroke-width="3" stroke-linecap="round"/>`
    + [[-14, -8, 12], [10, -28, 15], [-4, -50, 11]].map(([dx, dy, r], i) => `<circle class="kn-smoke" style="animation-delay:${i * 0.9}s" cx="${cx + dx}" cy="${y + dy}" r="${r}" fill="#a9b6bf" opacity=".3"/>`).join('')
    + `<polygon points="${cx + 8},${y - 30} ${cx - 4},${y - 8} ${cx + 4},${y - 8} ${cx - 8},${y + 14} ${cx + 18},${y - 14} ${cx + 8},${y - 14} ${cx + 16},${y - 30}" fill="var(--px-amber, #f2a93b)" opacity=".9"/>`;
}
function wallDecorRelay() {
  return `<rect x="70" y="40" width="250" height="14" rx="4" fill="#355068" opacity=".7"/>`
    + `<rect x="70" y="30" width="30" height="10" rx="2" fill="#9cc0e0" opacity=".5"/><rect x="108" y="22" width="22" height="18" rx="3" fill="#c98a4b" opacity=".6"/><rect x="140" y="26" width="36" height="14" rx="3" fill="#cfd8df" opacity=".35"/>`
    + `<rect x="70" y="100" width="250" height="14" rx="4" fill="#355068" opacity=".7"/>`
    + `<rect x="80" y="82" width="46" height="18" rx="3" fill="#8e9aa6" opacity=".45"/><rect x="140" y="76" width="26" height="24" rx="3" fill="#9cc0e0" opacity=".4"/><circle cx="214" cy="90" r="10" fill="#c98a4b" opacity=".55"/>`
    + `<path d="M680,10 V40 M820,10 V40" stroke="#8aa0ae" stroke-width="3" opacity=".5"/>`
    + `<rect x="640" y="40" width="220" height="48" rx="8" fill="#16293a" stroke="#5b7794" stroke-width="3" opacity=".9"/>`
    + `<text x="750" y="73" text-anchor="middle" direction="rtl" font-size="26" font-weight="800" fill="var(--px-ink-inverse-soft, #a9c3b7)">ממסר ראשי</text>`;
}

// ---------------------------------------------------------------- תיאור נגיש
function describe(ex, vals, solved, extra) {
  const f = p => p.gender === 'f';
  const names = ex.people.map(p => p.name).join(' ו');
  const lamp = ex.facts[0];
  const parts = [];
  if (ex.scene === 'relay') parts.push(`איור: שני טכנאים, ${names}, עומדים זה לצד זה מול ממסר פתוח על שולחן עבודה. ${ex.people[0].name} מדבר ומצביע פעם על עצמו ופעם על ${ex.people[1].name}.`);
  else if (ex.scene === 'duel') parts.push(`איור: שני טכנאים, ${names}, עומדים זה מול זה ליד ציוד תקול ומצביעים זה על זה; שני בלוני דיבור חופפים למחצה.`);
  else {
    const cover = ex.scene === 'panel' ? (ex.n === 2 ? 'לוחית מתכתית נשלפת עם סימן שאלה' : 'מכסה אפור שקוף עם סימן שאלה') : (ex.scene === 'panel2' ? 'כיסוי תחזוקה כתום עם סימן שאלה' : 'מכסה עם סימן שאלה');
    const who = ex.people.length > 1
      ? (ex.scene === 'panel2' ? `שני טכנאים, ${names}, עומדים משני צדי ${lamp.label}; ${ex.people[0].name} מצביע בשתי ידיים, פעם על הנורית ופעם על ${ex.people[1].name}` : `שני טכנאים, ${names}, עומדים זה לצד זה מול הלוח ומצביעים על עצמם`)
      : `${ex.people[0].name} ${f(ex.people[0]) ? 'עומדת' : 'עומד'} ליד הלוח ומצביע${f(ex.people[0]) ? 'ה' : ''} על ${lamp.label}`;
    parts.push(`איור: לוח בקרה עם ${LAMP_COUNT} נוריות ממוספרות${ex.scene === 'shift' ? ' בתאורת סוף יום ושעון קיר שמראה סוף משמרת' : ''}; ${lamp.label} מכוסה ב${cover}. ${who}.`);
  }
  ex.sentences.forEach((s, i) => {
    const p = ex.people.find(q => q.v === s.speaker);
    if (p) parts.push(`${p.name} ${f(p) ? 'אומרת' : 'אומר'}: ${ex.quotes[i]}`);
  });
  if (solved) {
    parts.push('פתרון: ' + ex.people.map(p => `${p.name} ${verdictWord(p, !!vals[p.v])}`).join(', ')
      + (lamp ? `; ${lamp.label} ${vals[lamp.v] ? 'דולקת' : 'כבויה'} (המכסה הוסר)` : '') + '.');
  } else parts.push(lamp ? 'הזהויות ומצב הנורית עדיין לא ידועים.' : 'הזהויות עדיין לא ידועות.');
  return parts.join(' ');
}

// ---------------------------------------------------------------- סגנון (CSS בלבד, מוגבל ל-.kn-svg)
const STYLE = `
.kn-svg text { font-family: var(--font-main, Heebo, Arial, sans-serif); }
.kn-svg * { transform-box: fill-box; transform-origin: center; }
.kn-svg .kn-lid-grey, .kn-svg .kn-lid-plate, .kn-svg .kn-lid-cover, .kn-svg .kn-lid-seal { transform-origin: 50% 50%; }
.kn-svg .kn-lid-grey { transform-origin: 50% 0%; }
@keyframes kn-shimmer { 0%,100% { opacity: .72; } 50% { opacity: 1; } }
@keyframes kn-sheen { 0% { transform: translateX(-34px) skewX(-18deg); opacity: 0; } 30%,70% { opacity: .6; } 100% { transform: translateX(34px) skewX(-18deg); opacity: 0; } }
@keyframes kn-march { to { stroke-dashoffset: -38; } }
@keyframes kn-talk { 0%,100% { transform: scaleY(.3); } 50% { transform: scaleY(1); } }
@keyframes kn-altA { 0%,42% { opacity: 1; } 52%,92% { opacity: .12; } 100% { opacity: 1; } }
@keyframes kn-altB { 0%,42% { opacity: .12; } 52%,92% { opacity: 1; } 100% { opacity: .12; } }
@keyframes kn-bumpA { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-4px); } }
@keyframes kn-bumpB { 0%,100% { transform: translateX(0); } 50% { transform: translateX(4px); } }
@keyframes kn-turnA { 0%,46% { transform: translateY(-7px); opacity: 1; } 54%,96% { transform: translateY(0); opacity: .72; } 100% { transform: translateY(-7px); opacity: 1; } }
@keyframes kn-turnB { 0%,46% { transform: translateY(0); opacity: .72; } 54%,96% { transform: translateY(-7px); opacity: 1; } 100% { transform: translateY(0); opacity: .72; } }
@keyframes kn-onA { 0%,46% { opacity: 1; } 50%,96% { opacity: 0; } 100% { opacity: 1; } }
@keyframes kn-onB { 0%,46% { opacity: 0; } 50%,96% { opacity: 1; } 100% { opacity: 0; } }
@keyframes kn-smoke { 0% { transform: translateY(0) scale(.7); opacity: 0; } 25% { opacity: .38; } 100% { transform: translateY(-40px) scale(1.5); opacity: 0; } }
@keyframes kn-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: .25; } }
@keyframes kn-ring { 0%,100% { transform: scale(.88); opacity: 1; } 50% { transform: scale(1.12); opacity: .5; } }
@keyframes kn-flip { 0% { transform: scaleY(1); opacity: 1; } 100% { transform: scaleY(.05); opacity: 0; } }
@keyframes kn-slide { 0% { transform: translateY(0); opacity: 1; } 55% { opacity: 1; } 100% { transform: translateY(64px); opacity: 0; } }
@keyframes kn-hinge { 0% { transform: translate(0,0) rotate(0); opacity: 1; } 100% { transform: translate(-60px,-10px) rotate(-28deg); opacity: 0; } }
@keyframes kn-shrink { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(.2); opacity: 0; } }
@keyframes kn-pop { 0% { transform: scale(.45); opacity: 0; } 70% { transform: scale(1.07); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes kn-fadein { from { opacity: 0; } to { opacity: 1; } }
@keyframes kn-lampon { 0% { transform: scale(.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }

/* לפני הפתרון: המכסה מרצד בעדינות, הדובר מדבר, הקרניים נעות */
.kn-svg.kn-u .kn-lid-body { animation: kn-shimmer 2.8s ease-in-out infinite; }
.kn-svg.kn-u .kn-lid-plate .kn-lid-body { animation: none; }
.kn-svg.kn-u .kn-sheen { animation: kn-sheen 3.4s ease-in-out infinite; }
.kn-svg.kn-u .kn-mouth { animation: kn-talk .55s ease-in-out infinite; }
.kn-svg .kn-dash { animation: kn-march 1.1s linear infinite; }
.kn-svg .kn-ring { animation: kn-ring 1.6s ease-in-out infinite; }
.kn-svg .kn-blink { animation: kn-blink 1.3s steps(1) infinite; }
.kn-svg .kn-smoke { animation: kn-smoke 3s ease-out infinite; }
.kn-svg .kn-alt-a { animation: kn-altA 4s ease-in-out infinite; }
.kn-svg .kn-alt-b { animation: kn-altB 4s ease-in-out infinite; }
.kn-svg .kn-bump-a { animation: kn-bumpA 2.2s ease-in-out infinite; }
.kn-svg .kn-bump-b { animation: kn-bumpB 2.2s ease-in-out infinite; }
.kn-svg .kn-on-a { animation: kn-onA 4.4s steps(1) infinite; }
.kn-svg .kn-on-b { animation: kn-onB 4.4s steps(1) infinite; }
.kn-svg .kn-turn-a { animation: kn-turnA 4.4s ease-in-out infinite; }
.kn-svg .kn-turn-b { animation: kn-turnB 4.4s ease-in-out infinite; }

/* אחרי הפתרון: חשיפה חד-פעמית שנשארת במצבה הסופי (fill-mode both) */
.kn-svg.kn-solved .kn-lid { animation-duration: 1s; animation-delay: .2s; animation-fill-mode: both; animation-timing-function: ease-in; }
.kn-svg.kn-solved .kn-lid-grey { animation-name: kn-flip; }
.kn-svg.kn-solved .kn-lid-plate { animation-name: kn-slide; }
.kn-svg.kn-solved .kn-lid-cover { animation-name: kn-hinge; }
.kn-svg.kn-solved .kn-lid-seal { animation-name: kn-shrink; }
.kn-svg.kn-solved .kn-lampon { animation: kn-lampon .8s ease-out .85s both; }
.kn-svg.kn-solved .kn-pop { animation: kn-pop .55s ease-out both; }
.kn-svg.kn-solved .kn-vout { animation: kn-fadein .6s ease-out .95s both; }
.kn-svg.kn-solved .kn-mouth, .kn-svg.kn-solved .kn-dash, .kn-svg.kn-solved .kn-ring,
.kn-svg.kn-solved .kn-alt-a, .kn-svg.kn-solved .kn-alt-b, .kn-svg.kn-solved .kn-bump-a, .kn-svg.kn-solved .kn-bump-b, .kn-svg.kn-solved .kn-turn-a, .kn-svg.kn-solved .kn-turn-b { animation: none; }

@media (prefers-reduced-motion: reduce) {
  .kn-svg *, .kn-svg *::before, .kn-svg *::after { animation: none !important; }
  .kn-solved .kn-lid { display: none; }
  .kn-svg .kn-mouth-turn { display: none; }
  .kn-svg .kn-alt-a, .kn-svg .kn-alt-b, .kn-svg .kn-turn-a, .kn-svg .kn-turn-b { opacity: 1; }
}
`;

// ---------------------------------------------------------------- סצנות
function personOf(ex, v) { return ex.people.find(p => p.v === v) || ex.people[0]; }

function scenePanel(c) {
  const { ex, solved, vals } = c;
  const fact = ex.facts[0], p = ex.people[0], lx = lampX(fact.lamp);
  const lit = !!vals[fact.v], verdict = vals[p.v];
  const side = lx < 450 ? 1 : -1;
  const tx = clamp(lx + side * 150, 200, 700);
  const armSide = lx < tx ? 'l' : 'r';
  const t = technician({ cx: tx, p, look: LOOKS[p.gender === 'f' ? 1 : 0], solved, verdict, speaking: true, gaze: [side < 0 ? 2 : -2, -2],
    arms: { [armSide]: { t: 'point', to: [lx, 160], ray: [lx, 166] } } });
  const b = bubble({ text: ex.quotes[0], anchor: side > 0 ? 'l' : 'r', ax: tx + side * -26, bottom: BUBBLE_BOTTOM, maxW: 400, tail: { x: tx, y: 284 }, solved, verdict });
  return { under: panelSvg({ covered: fact.lamp, kind: ex.n === 2 ? 'plate' : 'grey', solved, lit }), figures: [t], bubbles: [b] };
}

function scenePanel2(c) {
  const { ex, solved, vals } = c;
  const fact = ex.facts[0], lx = lampX(fact.lamp), lit = !!vals[fact.v];
  const pA = ex.people[0], pB = ex.people[1];
  const ax = clamp(lx + 100, 300, 800), bx = ax - 200;
  const A = technician({ cx: ax, p: pA, look: LOOKS[0], solved, verdict: vals[pA.v], speaking: true, gaze: [-3, -2],
    arms: { l: { t: 'point', to: [lx, 160], ray: [lx, 166] }, r: { t: 'point', to: [bx + 44, 346], ray: [bx + 60, 342], cls: '' } } });
  const B = technician({ cx: bx, p: pB, look: LOOKS[1], solved, verdict: vals[pB.v], speaking: false, gaze: [3, -1], arms: {} });
  const bA = bubble({ text: ex.quotes[0], anchor: 'l', ax: ax - 24, bottom: BUBBLE_BOTTOM, maxW: 340, tail: { x: ax, y: 284 }, solved, verdict: vals[pA.v] });
  const bB = bubble({ text: ex.quotes[1], anchor: 'r', ax: bx + 24, bottom: BUBBLE_BOTTOM, maxW: 340, tail: { x: bx, y: 284 }, solved, verdict: vals[pB.v] });
  return { under: panelSvg({ covered: fact.lamp, kind: 'cover', solved, lit }), figures: [B, A], bubbles: [bB, bA] };
}

function sceneShift(c) {
  const { ex, solved, vals } = c;
  const fact = ex.facts[0], lit = !!vals[fact.v];
  const pA = ex.people[0], pB = ex.people[1];
  const ax = 610, bx = 290;
  const A = technician({ cx: ax, p: pA, look: LOOKS[0], solved, verdict: vals[pA.v], speaking: true, turn: 'a', gaze: [0, -3], arms: { r: { t: 'self' } } });
  const B = technician({ cx: bx, p: pB, look: LOOKS[1], solved, verdict: vals[pB.v], speaking: true, turn: 'b', gaze: [0, -3], arms: { r: { t: 'self' } } });
  const bA = bubble({ text: ex.quotes[0], anchor: 'l', ax: ax - 24, bottom: BUBBLE_BOTTOM, maxW: 290, tail: { x: ax, y: 284 }, cls: 'kn-turn-a', solved, verdict: vals[pA.v] });
  const bB = bubble({ text: ex.quotes[1], anchor: 'r', ax: bx + 24, bottom: BUBBLE_BOTTOM, maxW: 290, tail: { x: bx, y: 284 }, cls: 'kn-turn-b', solved, verdict: vals[pB.v] });
  // זוהר שקיעה בפינה הימנית-עליונה: רבעי עיגול שנשארים בתוך ה-viewBox
  const glow = [[300, '#ff8a2b', .05], [210, '#ff8a2b', .06], [120, '#ffb25a', .08]].map(([r, f, o]) => `<path d="M${W},0 H${W - r} A${r},${r} 0 0 0 ${W},${r} Z" fill="${f}" opacity="${o}"/>`).join('');
  return { warm: true, deco: glow + clockSvg(450, 232), under: panelSvg({ covered: fact.lamp, kind: 'seal', solved, lit, warm: true }), figures: [B, A], bubbles: [bB, bA] };
}

function sceneRelay(c) {
  const { ex, solved, vals } = c;
  const sp = personOf(ex, ex.sentences[0].speaker), other = ex.people.find(p => p !== sp);
  const ax = 670, bx = 230;
  const A = technician({ cx: ax, p: sp, look: LOOKS[0], solved, verdict: vals[sp.v], speaking: true, gaze: [-3, 0],
    arms: { l: { t: 'point', to: [bx + 44, 346], ray: [bx + 60, 342], cls: 'kn-alt-b' }, r: { t: 'self', cls: 'kn-alt-a' } } });
  const B = technician({ cx: bx, p: other, look: LOOKS[1], solved, verdict: vals[other.v], speaking: false, gaze: [3, 0], arms: {} });
  const mark = `<g class="kn-self kn-alt-b"><polygon points="${bx},${BUBBLE_BOTTOM + 8} ${bx - 15},${BUBBLE_BOTTOM - 14} ${bx + 15},${BUBBLE_BOTTOM - 14}" fill="var(--px-amber, #f2a93b)"/></g>`;
  const b = bubble({ text: ex.quotes[0], anchor: 'c', ax: ax - 60, bottom: BUBBLE_BOTTOM, maxW: 440, tail: { x: ax, y: 284 }, solved, verdict: vals[sp.v] });
  return { under: wallDecorRelay() + relaySvg(450), figures: [B, A], bubbles: [b], extra: mark };
}

function sceneDuel(c) {
  const { ex, solved, vals } = c;
  const pY = ex.people[0], pK = ex.people[1];
  const ya = 690, ka = 210;
  const Y = technician({ cx: ya, p: pY, look: LOOKS[0], solved, verdict: vals[pY.v], speaking: true, gaze: [-3, 0], arms: { l: { t: 'point', to: [ka + 70, 392], ray: null } } });
  const K = technician({ cx: ka, p: pK, look: LOOKS[1], solved, verdict: vals[pK.v], speaking: true, gaze: [3, 0], arms: { r: { t: 'point', to: [ya - 70, 392], ray: null } } });
  // בין הטקסטים נשארת רווחה של כ-15px במנוחה; האנימציה מקרבת כל בלון ב-4px לכל היותר, כך שהטקסט של אחד לא מוסתר בידי גוף הבלון של השני
  const bK = bubble({ text: ex.quotes[1], anchor: 'r', ax: 468, top: 138, maxW: 400, padX: 48, tail: { x: ka, y: 282 }, cls: 'kn-bump-b', solved, verdict: vals[pK.v] });
  const bY = bubble({ text: ex.quotes[0], anchor: 'l', ax: 432, top: 116, maxW: 400, padX: 48, tail: { x: ya, y: 282 }, cls: 'kn-bump-a', solved, verdict: vals[pY.v] });
  const sign = `<polygon points="450,20 486,82 414,82" fill="#f2a93b" stroke="#3b2300" stroke-width="4" stroke-linejoin="round" opacity=".9"/>`
    + `<text x="450" y="73" text-anchor="middle" direction="ltr" font-size="40" font-weight="800" fill="#3b2300">!</text>`;
  return { under: sign + faultySvg(450), figures: [K, Y], bubbles: [bK, bY] };
}

const SCENES = { panel: scenePanel, panel2: scenePanel2, shift: sceneShift, relay: sceneRelay, duel: sceneDuel };

// ---------------------------------------------------------------- ייצוא
export function renderKnights(level, energized = false, opts = {}) {
  const ex = level.ex;
  const vals = (level.solution && level.solution.vals) || {};
  const solved = !!energized;
  const scene = (SCENES[ex.scene] || scenePanel)({ ex, solved, vals });
  const label = describe(ex, vals, solved);
  const body = room(scene.warm) + (scene.deco || '') + (scene.under || '')
    + scene.figures.map(f => f.svg).join('')
    + scene.figures.map(f => f.rays).join('')
    + (scene.extra || '')
    + (scene.warm ? `<rect x="0" y="0" width="${W}" height="${H}" rx="22" fill="#ff8a2b" opacity=".08" pointer-events="none"/>` : '')
    + scene.bubbles.map(b => b.svg).join('');
  const svg = `<svg class="kn-svg ${solved ? 'kn-solved' : 'kn-u'}" viewBox="0 0 ${W} ${H}" width="100%" style="width:100%;max-width:${W}px;height:auto;direction:ltr" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">`
    + `<title>${esc('צדיקים ונוכלים - איור לתרגיל ' + ex.n)}</title><style>${STYLE}</style>${body}</svg>`;
  return { svg, width: W, height: H, bubbles: scene.bubbles.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, lines: b.lines, fs: b.fs })) };
}
