// ==========================================================================
// logicBasicsRenderer.js - "לוח הפסוק" (מושגי יסוד בלוגיקה, מערכות ספרתיות
// פרק 2). זהות חזותית אחת ועקבית לכל 16 השלבים, בנויה על שני צירים בלתי-
// תלויים - בדיוק לפי העיקרון המבוסס כבר ב-digitalNumbersRenderer.js:
//  - צורה = זהות האלף-בית: "לוחית משפט" (מלבן מעוגל, פסוק בודד/מפוצל לתת-
//    מקטעים ב"חרוז מחבר" למשפטים מורכבים), "חותמת פסק-דין" (עיגול עם גליף
//    ציר-הפסוקיות/ציר-המבנה/ציר-האמת), "אריח-פסוק" (שלבי ספירת-שורות), או
//    תא בטבלת-אמת אמיתית (שלבי capstone 15-16 בלבד).
//  - צבע = מצב הבדיקה (זהה בכל אלף-בית, אף פעם לא צבע-לפי-תוכן): נתון=
//    --px-sky; נעלם=אפור-רשת בלי גליף; נכון=--px-brand-bright+glow; שגוי=
//    --px-amber. **אין** צבע/מנגנון פסילה בטופיק הזה כלל (ראו
//    logicBasicsLevelGenerator.js) - COLOR.disqualified/--px-coral לא
//    בשימוש בקובץ הזה.
// שני סטים נפרדים של גליפים לחותמת - אסור לערבב: ציר-הפסוקיות (1-4)=
// 'פ'/'—'; ציר-המבנה (5-6)='ב'/'מ'; ציר-האמת (8-12)='✓'/'✗' (רק שם, כדי
// שלא יתבלבל עם "זה פסוק").
// ==========================================================================
import { GLOW_FILTERS, labeledText } from './svgUtils.js';

const W = 640, H = 300;

const COLOR = {
  given: 'var(--px-sky)',
  correct: 'var(--px-brand-bright)',
  incorrect: 'var(--px-amber)',
};

function outcomeColor(outcome) {
  if (outcome === 'correct') return COLOR.correct;
  if (outcome === 'incorrect') return COLOR.incorrect;
  return 'var(--px-brand-bright)';
}

/** זהה עקרונית ל-normalizeLogicWord ב-logicBasicsLevelGenerator.js - עותק
 * מקומי קטן ועצמאי (בדיוק כמו ש-digitalNumbersRenderer.js משכפל מקומית
 * twosComplementOf/bcdDigits משלו, במקום לייבא מה-generator). */
function normalizeLogicWord(raw) {
  return String(raw).trim().replace(/[׳״'"]/g, '').replace(/[\s\-–]+/g, '');
}

/** שני סטים נפרדים בלבד, אחד לכל ציר - ראו header הקובץ. entered יכול
 * להגיע גם לא-מנורמל (level.question.answer הגולמי בנתיב ה-energized) וגם
 * מנורמל-כבר (result.value מ-evaluate*) - שניהם עוברים נרמול כאן לפני
 * ההשוואה, כך שהפונקציה עובדת נכון משני הנתיבים. */
const GLYPHS = {
  isprop: [['פסוק', 'פ'], ['לא פסוק', '—']],
  atomic: [['בסיסי', 'ב'], ['מורכב', 'מ']],
  truth: [['אמת', '✓'], ['שקר', '✗']],
};
function glyphFor(axis, entered) {
  const norm = normalizeLogicWord(entered);
  const pair = (GLYPHS[axis] || []).find(([word]) => normalizeLogicWord(word) === norm);
  return pair ? pair[1] : '?';
}

// ---------------------------------------------------------------- רכיבי-על
/** "לוחית משפט" בודדת - פסוק אטומי אחד, 1-2 שורות (נשברות מראש ב-`lines`
 * שבהגדרת השלב עצמה - אין חישוב עטיפה דינמי, ל-SVG אין word-wrap טבעי). */
function sentenceCard(cx, cy, w, h, lines, color) {
  const lineH = 20;
  const baseY = cy - ((lines.length - 1) * lineH) / 2 + 5;
  const text = lines.map((ln, i) =>
    `<text x="${cx}" y="${baseY + i * lineH}" text-anchor="middle" font-size="15" font-weight="600" fill="${color}">${ln}</text>`).join('');
  return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="14" fill="var(--px-ground-raised)" stroke="var(--px-schem-border)" stroke-width="2"/>${text}`;
}

/** "לוחית משפט" מפוצלת ל-2/3 תת-מקטעים (פסוק מורכב) - קו-תפר אנכי מקווקו
 * עם "חרוז מחבר" (עיגול פשוט, *לא* מעוין/טרפז) שבתוכו מילת החיבור המילולית
 * עצמה (וגם/או). סדר תת-המקטעים RTL - הראשון (segments[0]) בקצה הימני. */
function compoundCard(cx, cy, w, h, segments, connector, color) {
  const n = segments.length;
  const segW = w / n;
  const left = cx - w / 2;
  const parts = [`<rect x="${left}" y="${cy - h / 2}" width="${w}" height="${h}" rx="14" fill="var(--px-ground-raised)" stroke="var(--px-schem-border)" stroke-width="2"/>`];
  segments.forEach((seg, i) => {
    const boxLeft = left + (n - 1 - i) * segW;
    const segCx = boxLeft + segW / 2;
    parts.push(`<text x="${segCx}" y="${cy + 5}" text-anchor="middle" font-size="13.5" font-weight="600" fill="${color}">${seg}</text>`);
  });
  const beadR = 15;
  for (let i = 0; i < n - 1; i++) {
    const seamX = left + (i + 1) * segW;
    parts.push(`<line x1="${seamX}" y1="${cy - h / 2 + 6}" x2="${seamX}" y2="${cy - beadR - 3}" stroke="var(--px-schem-border)" stroke-width="2" stroke-dasharray="4,4"/>`);
    parts.push(`<line x1="${seamX}" y1="${cy + beadR + 3}" x2="${seamX}" y2="${cy + h / 2 - 6}" stroke="var(--px-schem-border)" stroke-width="2" stroke-dasharray="4,4"/>`);
    parts.push(`<circle cx="${seamX}" cy="${cy}" r="${beadR}" fill="var(--px-ground-raised)" stroke="var(--px-lilac)" stroke-width="2"/>`);
    parts.push(`<text x="${seamX}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--px-lilac)">${connector}</text>`);
  }
  return parts.join('');
}

/** "חותמת פסק-דין" - עיגול מתחת ללוחית: אפור+'?' לפני בדיקה (state='hidden'
 * ברוח מפורשת, בדיוק כמו bit/chip חבויים ב-digitalNumbers), אחרי בדיקה
 * נצבע לפי outcome עם גליף-הציר המתאים (glyphFor). */
function verdictStamp(cx, cy, outcome, axis, entered) {
  const r = 27;
  if (!outcome) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--px-schem-grid)" stroke="var(--px-schem-border)" stroke-width="2"/>
      <text x="${cx}" y="${cy + 7}" text-anchor="middle" font-size="20" fill="var(--px-ink-inverse-soft)" opacity="0.5">?</text>`;
  }
  const color = outcomeColor(outcome);
  const glow = outcome === 'correct' ? ' filter="url(#glow)"' : '';
  const glyph = glyphFor(axis, entered);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--px-ground-raised)" stroke="${color}" stroke-width="3"${glow}/>
    <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="22" font-weight="900" fill="${color}">${glyph}</text>`;
}

/** קורא גלובלי - ערך תשובה מספרי, מוצג רק אחרי בדיקה (זהה בעיקרון
 * ל-readoutGlyph ב-digitalNumbersRenderer.js - עותק מקומי, אין ייצוא משותף). */
function readoutGlyph(value, color) {
  if (value == null) return '';
  const text = String(value);
  const boxW = Math.max(90, 40 + text.length * 13);
  return `<g><rect x="${W / 2 - boxW / 2}" y="18" width="${boxW}" height="38" rx="10" fill="#080b16" fill-opacity="0.86" stroke="var(--px-schem-border)"/>
    <text x="${W / 2}" y="43" text-anchor="middle" font-size="18" font-weight="900" fill="${color}" font-family="var(--font-mono)">${text}</text></g>`;
}

/** "אריחי-פסוק" קטנים זה-לצד-זה (שלבי ספירת-שורות 13-14, לפני שיש טבלה) -
 * אין עדיין שורות/צירופים, רק הצגת הפסוקים הבסיסיים עצמם. סדר RTL. */
function propositionTiles(parts, propositions, y) {
  const n = propositions.length;
  const tileW = 175, gap = 18, tileH = 60;
  const totalW = n * tileW + (n - 1) * gap;
  const left = W / 2 - totalW / 2;
  propositions.forEach((text, i) => {
    const x = left + (n - 1 - i) * (tileW + gap);
    parts.push(`<rect x="${x}" y="${y - tileH / 2}" width="${tileW}" height="${tileH}" rx="12" fill="var(--px-ground-raised)" stroke="var(--px-schem-border)" stroke-width="2"/>`);
    parts.push(`<text x="${x + tileW / 2}" y="${y + 5}" text-anchor="middle" font-size="12.5" font-weight="600" fill="${COLOR.given}">${text}</text>`);
    parts.push(labeledText(x + tileW / 2, y - tileH / 2 - 12, `פסוק ${i + 1}`, 'comp-label', { fontSize: 10 }));
  });
}

/** תא בודד בטבלת-אמת אמיתית (שלבים 15-16 בלבד) - 'אמת'/'שקר' ככיתוב (לא
 * ✓/✗ - שומר על שפה אחידה עם טקסט 2.2, ומבדיל חזותית טבלה-שלמה מ"חותמת"
 * בודדת). תא חסר = מסגרת מקווקוות אפורה, בדיוק כמו התא החבוי הקיים
 * ב-digitalNumbersRenderer.js (analyzeCells/drawCell). */
function cellBox(cx, cy, w, h, state, text) {
  if (state === 'missing') {
    return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="8" fill="none" stroke="var(--px-ink-inverse-soft)" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.55"/>`;
  }
  const color = state === 'given' ? COLOR.given : (COLOR[state] || COLOR.incorrect);
  const glow = state === 'correct' ? ' filter="url(#glow)"' : '';
  return `<g><rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="8" fill="var(--px-ground-raised)" stroke="${color}" stroke-width="2.5"${glow}/>
    <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="12" font-weight="700" fill="${color}">${text || ''}</text></g>`;
}

/** גריד טבלת-אמת מלא - `cols` בסדר RTL (cols[0] = העמודה הימנית ביותר),
 * כל אחת {key, header, sub}. `cellState(rowIdx, colKey)` ו-
 * `cellText(rowIdx, colKey, rawVal)` נשלטים על-ידי הקורא (שונה בין
 * complete-cell ל-read-table). */
function drawTruthTable(parts, { cols, rows, y0, cellState, cellText }) {
  const n = cols.length;
  const colW = n === 2 ? 220 : 172;
  const rowH = 34;
  const headerH = 48;
  const tableW = colW * n;
  const left = W / 2 - tableW / 2;
  cols.forEach((col, i) => {
    const x = left + tableW - (i + 1) * colW;
    const cx = x + colW / 2;
    parts.push(labeledText(cx, y0 + 14, col.header, 'comp-label', { fontSize: 12 }));
    if (col.sub) parts.push(labeledText(cx, y0 + 33, col.sub, 'comp-val', { fontSize: 9.5 }));
  });
  rows.forEach((row, r) => {
    const rowY = y0 + headerH + r * rowH + rowH / 2;
    cols.forEach((col, i) => {
      const x = left + tableW - (i + 1) * colW;
      const cx = x + colW / 2;
      const state = cellState(r, col.key);
      const text = cellText(r, col.key, row[col.key]);
      parts.push(cellBox(cx, rowY, colW - 16, rowH - 8, state, text));
    });
  });
}

function wrapSvg(parts) {
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>${GLOW_FILTERS}</defs>${parts.join('\n')}</svg>`;
}

/** משותף ל-2.1 (is-prop/atomic-compound, לא count-atomic) ולכל 2.2 - לוחית
 * (בודדת או מפוצלת) + חותמת פסק-דין מתחתיה. */
function plaqueAndStampScene(w, outcome, entered) {
  const parts = [`<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`];
  const cardY = 118;
  if (w.segments.length > 1) parts.push(compoundCard(W / 2, cardY, 520, 72, w.segments, w.connector, COLOR.given));
  else parts.push(sentenceCard(W / 2, cardY, 500, 76, w.lines || w.segments, COLOR.given));
  parts.push(verdictStamp(W / 2, cardY + 95, outcome, w.axis, entered));
  return parts;
}

// ============================================================== 2.1 (1-7)
/** שלב 7 (count-atomic) שונה מ-1-6: לוחית מפוצלת ל-3 מקטעים + readoutGlyph
 * מספרי במקום חותמת פסק-דין (התשובה כאן ספירה, לא קטגוריה בינארית). */
function scene21(level, outcome, entered) {
  const w = level.world;
  if (w.kind === 'count-atomic') {
    const parts = [`<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`];
    parts.push(compoundCard(W / 2, 150, 580, 78, w.segments, w.connector, COLOR.given));
    parts.push(readoutGlyph(outcome ? entered : null, outcomeColor(outcome)));
    return wrapSvg(parts);
  }
  return wrapSvg(plaqueAndStampScene(w, outcome, entered));
}

// ============================================================= 2.2 (8-12)
/** בדיוק אותה גיאומטריה כמו הענף הקטגוריאלי של 2.1 (לוחית + חותמת), רק עם
 * ציר-האמת (glyphFor('truth', ...) → ✓/✗) - ראו plaqueAndStampScene. */
function scene22(level, outcome, entered) {
  return wrapSvg(plaqueAndStampScene(level.world, outcome, entered));
}

// ============================================================ 2.3 (13-16)
/** שלבים 13-14 (row-count, אין עדיין טבלה): רק "אריחי-פסוק" + readoutGlyph.
 * שלבים 15-16 (capstone) שוברים את התבנית ומציירים grid אמיתי:
 *  - 15 (complete-cell): 2 עמודות (עמודה א'/עמודה ב', *לא* p/q - אין עדיין
 *    "משתנה בוליאני" בפרק 2), תא אחד חסר שנחשף בצבע-תוצאה אחרי בדיקה.
 *  - 16 (read-table): 3 עמודות כולל "ערך הפסוק המורכב" בקצה הימני, כל
 *    הטבלה given מראש (בודקים קריאה, לא השלמה) + readoutGlyph למספר-שורות
 *    שהתוצאה בהן אמת. */
function scene23(level, outcome, entered) {
  const w = level.world;
  const parts = [`<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`];

  if (w.kind === 'row-count') {
    propositionTiles(parts, w.propositions, 140);
    parts.push(readoutGlyph(outcome ? entered : null, outcomeColor(outcome)));
    return wrapSvg(parts);
  }

  if (w.kind === 'complete-cell') {
    const cols = [
      { key: 'a', header: "עמודה א'", sub: w.colA },
      { key: 'b', header: "עמודה ב'", sub: w.colB },
    ];
    drawTruthTable(parts, {
      cols, rows: w.rows, y0: 48,
      cellState: (r, key) => (r === w.missingRow && key === 'b' ? (outcome || 'missing') : 'given'),
      cellText: (r, key, val) => (r === w.missingRow && key === 'b' ? (outcome ? entered : '') : val),
    });
    return wrapSvg(parts);
  }

  // read-table (16) - כל הטבלה given, כולל עמודת התוצאה בקצה הימני
  const cols = [
    { key: 'r', header: 'ערך הפסוק המורכב', sub: null },
    { key: 'a', header: "עמודה א'", sub: w.colA },
    { key: 'b', header: "עמודה ב'", sub: w.colB },
  ];
  drawTruthTable(parts, {
    cols, rows: w.rows, y0: 72,
    cellState: () => 'given',
    cellText: (r, key, val) => val,
  });
  parts.push(readoutGlyph(outcome ? entered : null, outcomeColor(outcome)));
  return wrapSvg(parts);
}

// -------------------------------------------------------------- דיספצ'ר
function buildScene(level, outcome, entered) {
  switch (level.world.group) {
    case '2.1': return scene21(level, outcome, entered);
    case '2.2': return scene22(level, outcome, entered);
    default: return scene23(level, outcome, entered);
  }
}

// -------------------------------------------------------------- ייצוא (חוזה)
export function renderLogicBasics(level, energized = false) {
  if (!energized) return { svg: buildScene(level, null, null), width: W, height: H };
  return { svg: buildScene(level, 'correct', level.question.answer), width: W, height: H };
}

/** אין overlay נפרד לניקוי - כל בדיקה מרנדרת מחדש את כל הזירה (זהה
 * ל-clearDigitalNumbersMarks). אין מנגנון פסילה בטופיק הזה כלל (ראו
 * logicBasicsLevelGenerator.js) - triggerLogicBasicsDisqualifyAnimation לא
 * קיים בקובץ הזה, ולא מיוצג/מיוחס ב-curriculum.js (שדה אופציונלי לפי
 * gameEngine.js: `if (topic.triggerDisqualifyAnimation)`). */
export function clearLogicBasicsMarks() {}

export function animateLogicBasicsIncorrect(stageEl, level, result) {
  stageEl.innerHTML = buildScene(level, 'incorrect', result.value);
  stageEl.classList.remove('shake'); void stageEl.offsetWidth; stageEl.classList.add('shake');
}
