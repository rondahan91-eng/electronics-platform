// ==========================================================================
// levelGenerator.js - יוצר שלבי תרגול בצורה פרוצדורלית ודטרמיניסטית עבור
// כל אחד מנושאי הלימוד (topics) המוגדרים ב-curriculum.js.
// אותו (topicKey, localId) תמיד מייצר בדיוק אותו מעגל (RNG עם seed קבוע).
// ==========================================================================
import { R, Cap, Series, Parallel, solveCircuit, collectLeaves } from './circuitEngine.js';
import { NOTE, sig, fmtNum } from './dcKit.js';

// ---------- RNG דטרמיניסטי (mulberry32) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;
const roundTo = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// ---------- ערכים "יפים" לרכיבים (בהשראת סדרת E) ----------
const R_BASIC = [10, 15, 22, 33, 47, 68, 100, 150, 220, 330];
const R_ADV = [47, 68, 100, 150, 220, 330, 470, 680, 1000];
const R_BOSS = [100, 150, 220, 330, 470, 680, 1000, 1500, 2200];
const V_BASIC = [6, 9, 12];
const V_ADV = [9, 12, 15, 18, 24];
const V_BOSS = [12, 18, 24, 30];
const C_UF = [1, 2.2, 4.7, 10, 22, 47];
const FREQ = [50, 60, 100, 200];

function labelLeaves(root) {
  const counters = { r: 0, c: 0, l: 0 };
  const map = {};
  (function walk(node) {
    if (node.children) { node.children.forEach(walk); return; }
    counters[node.kind] += 1;
    const prefix = node.kind === 'r' ? 'R' : node.kind === 'c' ? 'C' : 'L';
    node.label = prefix + counters[node.kind];
    map[node.id] = node.label;
  })(root);
  return map;
}

function attachSafeMaxPower(root, rng) {
  collectLeaves(root).filter(l => l.kind === 'r').forEach(leaf => {
    const truePower = leaf.current.abs() ** 2 * leaf.value;
    const margin = 0.4 + rng() * 0.35; // ההספק האמיתי הוא 40%-75% מהסף המותר
    leaf.maxPower = roundTo(Math.max(truePower / margin, 0.05), 2);
    leaf.truePower = roundTo(truePower, 4);
  });
}

const HINTS = {
  current: ['חוק אוהם: I = ⟦V⁄R⟧', 'בטור - הזרם זהה בכל הרכיבים. במקביל - הזרם מתחלק בין הענפים.'],
  voltage: ['מפל מתח על רכיב: V = I · R', 'סכום מפלי המתח במעגל טורי שווה למתח המקור (חוק קירכהוף למתח).'],
  power: ['הספק: P = I² · R', 'אם ההספק המחושב חורג מההספק המרבי המותר - הנגד יישרף!'],
  req: ['התנגדות שקולה בטור: Rtot = R1+R2+...', 'התנגדות שקולה במקביל: ⟦1⁄Rtot⟧ = ⟦1⁄R1⟧ + ⟦1⁄R2⟧ + ...'],
  veff: ['במעגל AC משתמשים במתח האפקטיבי (Veff) בדיוק כמו במתח DC.', 'V = I × |Z|'],
  impedance: ['עכבת קבל: Xc = ⟦1⁄2πfC⟧', 'עכבה כוללת בטור: Z = R + jXc (משתמשים בגודל |Z|)'],
  gain: ['מגבר אינברטי: Vout = −⟦Rf⁄Rin⟧ × Vin', 'מגבר לא-אינברטי: Vout = (1 + ⟦Rf⁄Rin⟧) × Vin'],
};

// תיאורי הנושאים (שלבים 1-15; לשלבי ההמרה 16-20 יש הסבר משלהם: משפט על המושג + משפט מדרגת-המרות, ראו CONV_DEFS)
const DESC_BASIC = 'אמפר נכנס למבוך החשמלי הראשון. עליו לפענח את חוקי אוהם כדי להמשיך הלאה בבטחה.';
const DESC_ADVANCED = 'הצמתים מתרבים והזרם מתפצל לכמה ענפים. אמפר זקוק לחישוב מדויק של חלוקת הזרמים כדי לא להעמיס על אף רכיב.';

function buildQuestion(level, root, ask, targetLeaf, rng) {
  const isAC = level.isAC;
  let value, unit, label, prompt;
  const t = targetLeaf || root;
  const name = targetLeaf ? targetLeaf.label : (isAC ? 'העכבה הכוללת (Z)' : 'ההתנגדות השקולה (Rtot)');

  if (ask === 'current') {
    value = t.current.abs();
    unit = 'A';
    prompt = `מהו הזרם ${isAC ? 'האפקטיבי ' : ''}(I) העובר דרך ${name}?`;
  } else if (ask === 'voltage') {
    value = t.voltageDrop.abs();
    unit = 'V';
    prompt = `מהו מפל ה${isAC ? 'מתח האפקטיבי (Veff)' : 'מתח (V)'} על ${name}?`;
  } else if (ask === 'power') {
    value = t.current.abs() ** 2 * t.value;
    unit = 'W';
    prompt = `מהו ההספק (P) המתפזר ב-${name}? שימו לב לא לחרוג מההספק המרבי המותר!`;
  } else if (ask === 'req') {
    value = root._Z.abs();
    unit = isAC ? 'Ω (|Z|)' : 'Ω';
    prompt = isAC ? 'מהי העכבה הכוללת (|Z|) של המעגל?' : 'מהי ההתנגדות השקולה (Rtot) של המעגל כולו?';
  }
  value = roundTo(value, 4);
  const hintKey = ask === 'req' && isAC ? 'impedance' : ask;
  return { ask, targetId: t.id, targetLabel: targetLeaf ? targetLeaf.label : null, unit, prompt, answer: value, hints: HINTS[hintKey] || [] };
}

// ---------- בנאי מעגלים לפי טופולוגיה ----------
function mkSeries(rng, n, pool) {
  const kids = [];
  for (let i = 0; i < n; i++) kids.push(R(pick(rng, pool)));
  return Series(...kids);
}
function mkParallel(rng, n, pool) {
  const kids = [];
  for (let i = 0; i < n; i++) kids.push(R(pick(rng, pool)));
  return Parallel(...kids);
}
function mkMixed(rng, pool, branches = 2) {
  // R בטור עם בלוק מקבילי, לפעמים עוד R בטור אחריו
  const parts = [R(pick(rng, pool))];
  const par = [];
  for (let i = 0; i < branches; i++) par.push(R(pick(rng, pool)));
  parts.push(Parallel(...par));
  if (rng() > 0.4) parts.push(R(pick(rng, pool)));
  return Series(...parts);
}
function mkDeepMixed(rng, pool, depth) {
  // רשת מקוננת - מגדילה מורכבות עם depth (לשלבי בוס)
  function build(d) {
    if (d <= 0) return R(pick(rng, pool));
    const kind = rng() > 0.5 ? 'series' : 'parallel';
    const n = randInt(rng, 2, 3);
    const kids = [];
    for (let i = 0; i < n; i++) {
      kids.push(rng() > 0.55 ? build(d - 1) : R(pick(rng, pool)));
    }
    return kind === 'series' ? Series(...kids) : Parallel(...kids);
  }
  return build(depth);
}

function pickAskableLeaf(root, rng, ask) {
  const allLeaves = collectLeaves(root);
  const leaves = ask === 'power' ? allLeaves.filter(l => l.kind === 'r') : allLeaves;
  return pick(rng, leaves);
}

// ---------- מחוללי הנושאים (sub = אינדקס מקומי 0-based בתוך הנושא) ----------
function genBasic(sub, rng) {
  const V = pick(rng, V_BASIC);
  let root, ask, title;
  if (sub < 5) {
    root = mkSeries(rng, sub < 2 ? 2 : 3, R_BASIC);
    ask = sub % 2 === 0 ? 'current' : 'voltage';
    title = `מבוך טורי #${sub + 1}`;
  } else if (sub < 10) {
    root = mkParallel(rng, sub < 7 ? 2 : 3, R_BASIC);
    ask = sub % 2 === 0 ? 'current' : 'req';
    title = `צומת מקבילי #${sub - 4}`;
  } else {
    root = rng() > 0.5 ? mkMixed(rng, R_BASIC, 2) : mkParallel(rng, 3, R_BASIC);
    ask = pick(rng, ['current', 'power', 'req']);
    title = `אתגר טירונות #${sub - 9}`;
  }
  const { root: solved } = solveCircuit(root, V, 0);
  return { root: solved, V, freq: 0, isAC: false, ask, title, desc: DESC_BASIC };
}

function genAdvanced(sub, rng) {
  const V = pick(rng, V_ADV);
  const branches = sub < 5 ? 2 : 3;
  let root = sub < 10 ? mkMixed(rng, R_ADV, branches) : mkDeepMixed(rng, R_ADV, 2);
  const ask = pick(rng, ['current', 'power', 'power', 'voltage', 'req']);
  const { root: solved } = solveCircuit(root, V, 0);
  return { root: solved, V, freq: 0, isAC: false, ask,
    title: `רשת נגדים מעורבת #${sub + 1}`, desc: DESC_ADVANCED };
}

function genAC(sub, rng) {
  const V = pick(rng, V_ADV);
  const freq = pick(rng, FREQ);
  const cUF = pick(rng, C_UF);
  const rVal = pick(rng, R_ADV);
  let root;
  if (sub < 5) {
    root = Series(R(rVal), Cap(cUF * 1e-6));
  } else {
    root = Series(R(pick(rng, R_ADV)), Parallel(R(rVal), Cap(cUF * 1e-6)));
  }
  const ask = pick(rng, ['voltage', 'current', 'req']);
  const { root: solved } = solveCircuit(root, V, freq);
  return { root: solved, V, freq, isAC: true, ask,
    title: `שער הזרם החילופין #${sub + 1}`,
    desc: `אמפר נכנס לממד חדש - מתח המקור מתחלף בתדר ${freq}Hz. יש לחשב עם עכבה (Z) במקום התנגדות בלבד, תוך שימוש בערכי Veff.` };
}

function genBossTree(sub, rng) {
  const V = pick(rng, V_BOSS);
  const depth = 2 + Math.min(2, Math.floor(sub / 3));
  const root = mkDeepMixed(rng, R_BOSS, depth);
  const ask = pick(rng, ['power', 'power', 'current', 'req']);
  const { root: solved } = solveCircuit(root, V, 0);
  return { root: solved, V, freq: 0, isAC: false, ask,
    title: `שלב בוס: רשת בגרות #${sub + 1}`,
    desc: 'רשת נגדים סבוכה בהשראת שאלוני בגרות באלקטרוניקה. כל טעות בחישוב עלולה להעלות באש רכיב קריטי - ריכוז מרבי נדרש.' };
}

function genBossOpamp(sub, rng) {
  const vin = pick(rng, [0.5, 1, 1.5, 2]);
  const rin = pick(rng, [1000, 2200, 4700]);
  const rf = pick(rng, [4700, 10000, 22000, 47000]);
  const inverting = rng() > 0.5;
  const gain = inverting ? -(rf / rin) : (1 + rf / rin);
  const vout = roundTo(gain * vin, 4);
  return {
    circuitKind: 'opamp', V: vin, freq: 0, isAC: false,
    opamp: { vin, rin, rf, inverting, gain: roundTo(gain, 3) },
    ask: 'vout',
    title: `שלב בוס: מגבר השרת #${sub + 1}`,
    desc: `מגבר השרת האידיאלי הוא הקו האחרון של המבוך. חשבו את מתח היציאה (Vout) של מגבר ${inverting ? 'אינברטי' : 'לא-אינברטי'}.`,
    question: {
      ask: 'vout', targetId: null, targetLabel: null, unit: 'V',
      prompt: `מהו מתח היציאה Vout של המגבר ${inverting ? 'האינברטי' : 'הלא-אינברטי'} (Rin=${rin}Ω, Rf=${rf}Ω, Vin=${vin}V)?`,
      answer: vout, hints: HINTS.gain,
    },
  };
}

// ---------- שלבי המרת יחידות: שלבים 16-20 של basic ושל advanced ----------
// בניגוד ל-15 הראשונים (אקראיים, לפי seed), אלה שלבים מפורשים: מעגל ומתח קבועים, ובלי RNG. לכן הוספתם
// לא מזיזה אף seed של שלב קיים (TOPIC_SEED_OFFSET נשאר כמו שהוא). מדרגת ההמרות של הפרק, בסוף בלבד:
//   16 = נתון אחד להמרה (kΩ) | 17 = המרה בתשובה בלבד (mA) | 18-20 = כמה נתונים (kΩ) ותשובה ב-mA / V / mW.
// הציור מציג את הערכים כמו בשלבים הקיימים; נגד בקילו-אוהם מסומן unitDisplay='k' ומוצג R1=1.2kΩ.
// "בלי צירופי מקרים": אם כל הנגדים בשלב היו בקילו-אוהם, הקיצור V⁄kΩ = mA, mA·kΩ = V, mA²·kΩ = mW היה נותן את התשובה הנכונה
// בלי להמיר כלום. לכן בשלבים 19-20 של basic ו-18-20 של advanced הנגד שבטור (R1) נתון באוהם ושאר הנגדים בקילו-אוהם, והתשובה
// תלויה בשני הסוגים. (basic 18: הזרם דרך R1 לא תלוי ב-R2, ולכן הוא נשאר כפי שהוגדר.)
// question.unit = היחידה המבוקשת, question.scale = כמה יחידות SI בה (mA, mW: 1e-3), question.answer ביחידה המבוקשת.
// level.noBurn = true: אין "שריפה" בשלבים האלה (circuitTopicAdapter.js מדלג על בדיקת העומס).
const RANDOM_LEVELS = { basic: 15, advanced: 15 };
const kOhm = x => ({ ohm: sig(x * 1000), k: true });            // נגד בקילו-אוהם (מוצג R=1.2kΩ)
const par = (a, b) => (a * b) / (a + b);
const fmt = fmtNum;

function buildConvTree(spec) {
  if (typeof spec === 'number') return R(spec);                   // נגד באוהם
  if (!Array.isArray(spec)) {                                     // kOhm(...)
    const leaf = R(spec.ohm);
    if (spec.k) leaf.unitDisplay = 'k';
    return leaf;
  }
  const [kind, ...kids] = spec;
  const children = kids.map(buildConvTree);
  return kind === 'S' ? Series(...children) : Parallel(...children);
}

// הודעות מלכודת משותפות
const MSG_A_TO_MA = 'התוצאה שלכם באמפר (A), אבל התבקשה תשובה במיליאמפר (mA). A אחד שווה 1000 mA, ולכן צריך להכפיל ב-1000.';
const MSG_MA_TO_A = 'התוצאה שלכם במיליאמפר (mA), אבל התבקשה תשובה באמפר (A). 1000 mA שווים A אחד, ולכן צריך לחלק ב-1000.';
const MSG_A_TO_MA_REVERSED = 'חילקתם ב-1000 במקום להכפיל. מעבר מאמפר למיליאמפר מגדיל את המספר פי 1000.';
const MSG_W_TO_MW = 'התוצאה שלכם בוואט (W), אבל התבקשה תשובה במיליוואט (mW). W אחד שווה 1000 mW, ולכן צריך להכפיל ב-1000.';
const MSG_ALL_SERIES = 'חיברתם את כל הנגדים כאילו הם בטור. נגדים שמחוברים במקביל מצטמצמים להתנגדות שקולה אחת.';

// הגדרות השלבים. circuit: S = טור, P = מקביל, מספר = נגד באוהם, kOhm(x) = נגד ב-kΩ. E = מתח המקור (V).
// hints(c) = שלושה רמזים (נוסחה / המרה / "בדקו בדרך"); traps[].f(c, answer) = ערך שגוי ביחידה המבוקשת.
// c = { E, scale, R(label) [Ω], I/V/P(label) [A/V/W], shown(label), Itot, Rtot, Rp }.
const CONV_DEFS = {
  basic: [
    // 16 - נתון אחד להמרה: R1 בקילו-אוהם. תשובה באמפר.
    {
      circuit: ['S', kOhm(1.2), 300], E: 12, ask: 'current', target: 'R1', unit: 'A', scale: 1, note: 'd1',
      concept: 'בטור זרם אחד עובר דרך כל הנגדים, והוא נקבע לפי ההתנגדות הכוללת של כולם יחד.',
      hints: c => [
        'בטור הזרם זהה בכל הנגדים, ולכן הזרם דרך R1 הוא הזרם של כל המעגל: I = ⟦E⁄Rtot⟧, כאשר E הוא מתח המקור (המסומן V בציור) ו-Rtot = R1 + R2.',
        'חוק אוהם דורש התנגדות באוהם (Ω). R1 נתון בקילו-אוהם (kΩ), וכל kΩ שווה 1000 Ω, ולכן המירו אותו לפני שמחברים אותו ל-R2.',
        `בדקו בדרך: R1 = ${c.shown('R1')} = ${fmt(c.R('R1'))} Ω ו-R2 = ${fmt(c.R('R2'))} Ω, ולכן Rtot = ${fmt(c.R('R1'))} + ${fmt(c.R('R2'))} = ${fmt(c.Rtot)} Ω. אחר כך I = ⟦${fmt(c.E)}⁄${fmt(c.Rtot)}⟧.`,
      ],
      traps: [
        { f: c => c.E / (c.R('R1') / 1000 + c.R('R2')), msg: 'R1 נתון בקילו-אוהם (kΩ) ושכחתם להמיר אותו לאוהם לפני שחיברתם אותו ל-R2. kΩ אחד שווה 1000 Ω.' },
        { f: (c, a) => a * 1000, msg: MSG_MA_TO_A },
        { f: c => c.E / c.R('R1'), msg: 'חישבתם את הזרם רק לפי R1. בטור הזרם נקבע לפי ההתנגדות של כל הנגדים יחד: R1 + R2.' },
      ],
    },
    // 17 - המרה בתשובה בלבד: הכול ב-SI, התשובה במיליאמפר.
    {
      circuit: ['S', 100, 200], E: 12, ask: 'current', target: 'R1', unit: 'mA', scale: 1e-3, note: 'a',
      concept: 'בטור הזרם זהה בכל הנגדים, והוא נקבע לפי מתח המקור ולפי ההתנגדות הכוללת. את הזרם מחשבים באמפר, ובמעגלים קטנים מקובל לדווח עליו במיליאמפר.',
      hints: c => [
        'בטור הזרם זהה בכל הנגדים: I = ⟦E⁄R1 + R2⟧, כאשר E הוא מתח המקור (המסומן V בציור).',
        'המתח בוולט והנגדים באוהם, ולכן הזרם יוצא באמפר (A). התבקשה תשובה במיליאמפר (mA): A אחד שווה 1000 mA, ולכן כופלים ב-1000.',
        `בדקו בדרך: Rtot = ${fmt(c.R('R1'))} + ${fmt(c.R('R2'))} = ${fmt(c.Rtot)} Ω, ולכן I = ⟦${fmt(c.E)}⁄${fmt(c.Rtot)}⟧ A. את התוצאה צריך להמיר ל-mA.`,
      ],
      traps: [
        { f: c => c.I('R1'), msg: MSG_A_TO_MA },
        { f: c => c.I('R1') / 1000, msg: MSG_A_TO_MA_REVERSED },
        { f: c => c.E / c.R('R1') / c.scale, msg: 'חישבתם את הזרם רק לפי R1. בטור הזרם נקבע לפי ההתנגדות של כל הנגדים יחד: R1 + R2.' },
      ],
    },
    // 18 - כמה נתונים להמרה (kΩ), תשובה במיליאמפר. מעגל מקבילי.
    {
      circuit: ['P', kOhm(2), kOhm(3)], E: 12, ask: 'current', target: 'R1', unit: 'mA', scale: 1e-3, note: 'dm',
      concept: 'במקביל המתח על כל ענף שווה למתח המקור, ולכן הזרם בכל ענף נקבע לפי ההתנגדות שלו בלבד.',
      hints: c => [
        'במקביל המתח על כל ענף שווה למתח המקור E (המסומן V בציור), ולכן הזרם דרך R1 הוא I = ⟦E⁄R1⟧. אין צורך בהתנגדות השקולה.',
        'חוק אוהם דורש התנגדות באוהם: kΩ אחד שווה 1000 Ω. התוצאה יוצאת באמפר, והתבקשה תשובה במיליאמפר: A אחד שווה 1000 mA.',
        `בדקו בדרך: R1 = ${c.shown('R1')} = ${fmt(c.R('R1'))} Ω, ולכן I = ⟦${fmt(c.E)}⁄${fmt(c.R('R1'))}⟧ A. את התוצאה צריך להמיר ל-mA.`,
      ],
      traps: [
        { f: c => c.I('R1'), msg: MSG_A_TO_MA },
        { f: c => c.I('R2') / c.scale, msg: 'זה הזרם דרך R2. התבקש הזרם דרך R1.' },
        { f: c => c.Itot / c.scale, msg: 'זה הזרם הכללי של שני הענפים יחד. התבקש הזרם דרך R1 בלבד, והוא נקבע לפי R1 ומתח המקור.' },
      ],
    },
    // 19 - כמה נתונים להמרה (kΩ), תשובה בוולט. מעגל מעורב.
    // R1 נתון באוהם (1000 Ω, לא 1 kΩ) ו-R2, R3 בקילו-אוהם: כך שכחת ההמרה משנה את התשובה (בלי המרה V1 = 9·1000⁄1002 ≈ 9, מלכודת E).
    // אם כל שלושת הנגדים היו בקילו-אוהם, היחס R1⁄(R1+Rp) לא תלוי ביחידה והשלב לא היה בודק המרה בכלל.
    {
      circuit: ['S', 1000, ['P', kOhm(3), kOhm(6)]], E: 9, ask: 'voltage', target: 'R1', unit: 'V', scale: 1, note: 'dm',
      concept: 'במעגל מעורב מצמצמים קודם את הנגדים שבמקביל להתנגדות אחת, מוצאים את הזרם הכללי, ואז המתח מתחלק בין הנגד שבטור לבין הבלוק המקבילי.',
      hints: c => [
        'מצמצמים את R2 ו-R3 שבמקביל להתנגדות אחת Rp, ואז Rtot = R1 + Rp. מהזרם הכללי I = ⟦E⁄Rtot⟧, כאשר E הוא מתח המקור (המסומן V בציור), מקבלים את המתח על R1: V = I · R1.',
        'חוק אוהם דורש התנגדות באוהם. R1 כבר נתון באוהם, אבל R2 ו-R3 נתונים בקילו-אוהם (kΩ), וכל kΩ שווה 1000 Ω, ולכן המירו אותם לפני החישוב. המתח מבוקש בוולט, ולכן התוצאה עצמה לא דורשת המרה.',
        `בדקו בדרך: Rp = ⟦${fmt(c.R('R2'))}·${fmt(c.R('R3'))}⁄${fmt(c.R('R2'))} + ${fmt(c.R('R3'))}⟧ = ${fmt(c.Rp)} Ω ו-Rtot = ${fmt(c.R('R1'))} + ${fmt(c.Rp)} = ${fmt(c.Rtot)} Ω.`,
      ],
      traps: [
        { f: c => c.V('R2'), msg: 'זה המתח על הבלוק המקבילי (R2 ו-R3). התבקש המתח על R1.' },
        { f: c => c.E * c.R('R1') / (c.R('R1') + c.R('R2') + c.R('R3')), msg: MSG_ALL_SERIES },
        { f: c => c.E, msg: 'זה מתח המקור, או קרוב מאוד אליו. המתח מתחלק בין R1 לבין R2 ו-R3, ואם לא המרתם את R2 ו-R3 מקילו-אוהם לאוהם, הן נראות קטנות מדי לעומת R1 והמתח שנופל עליו כמעט כולו.' },
      ],
    },
    // 20 - המרות כמה יחידות: R2 בקילו-אוהם (R1 באוהם) והספק במיליוואט.
    // R1 נתון באוהם (1000 Ω) ו-R2 בקילו-אוהם. אם שניהם היו בקילו-אוהם, הקיצור "וולט לחלק לקילו-אוהם נותן מיליאמפר" (וכן mA² · kΩ = mW)
    // היה נותן את אותו מספר בלי המרה, והשלב לא היה מבדיל בין מי שהמיר למי שלא.
    {
      circuit: ['S', 1000, kOhm(2)], E: 12, ask: 'power', target: 'R2', unit: 'mW', scale: 1e-3, note: 'dm',
      concept: 'ההספק על נגד הוא I² · R: הזרם בריבוע כפול ההתנגדות. בטור הזרם זהה בכל הנגדים.',
      hints: c => [
        'ההספק על נגד: P = I² · R. בטור הזרם זהה בכל הנגדים: I = ⟦E⁄R1 + R2⟧, כאשר E הוא מתח המקור (המסומן V בציור).',
        'R1 כבר נתון באוהם, אבל R2 נתון בקילו-אוהם (kΩ), ולכן המירו אותו לאוהם לפני שמחברים: kΩ אחד שווה 1000 Ω. ההספק יוצא בוואט (W), והתבקשה תשובה במיליוואט: W אחד שווה 1000 mW.',
        `בדקו בדרך: Rtot = ${fmt(c.R('R1'))} + ${fmt(c.R('R2'))} = ${fmt(c.Rtot)} Ω ולכן I = ⟦${fmt(c.E)}⁄${fmt(c.Rtot)}⟧ A. אחר כך P = I² · R2, ואת התוצאה ממירים ל-mW.`,
      ],
      traps: [
        { f: c => c.P('R2'), msg: MSG_W_TO_MW },
        { f: c => c.P('R1') / c.scale, msg: 'זה ההספק על R1. התבקש ההספק על R2.' },
        { f: c => c.E * c.Itot / c.scale, msg: 'זה ההספק הכולל שהמקור מספק, E · I. התבקש ההספק על R2 בלבד.' },
        { f: c => c.E ** 2 / c.R('R2') / c.scale, msg: 'השתמשתם במתח המקור כאילו כולו נופל על R2. המתח מתחלק בין שני הנגדים שבטור, ועל R2 נופל רק חלק ממנו.' },
      ],
    },
  ],
  advanced: [
    // 16 - נתון אחד להמרה: R2 בקילו-אוהם. הזרם דרך R1 (= הזרם הכללי), באמפר.
    {
      circuit: ['S', 100, ['P', kOhm(0.6), 300]], E: 12, ask: 'current', target: 'R1', unit: 'A', scale: 1, note: 'd1',
      concept: 'הנגד R1 מחובר בטור לבלוק של נגדים מקבילים, ולכן הזרם שעובר דרכו הוא הזרם הכללי של כל המעגל.',
      hints: c => [
        'R1 נמצא בטור לכל שאר המעגל, ולכן הזרם דרכו הוא הזרם הכללי: I = ⟦E⁄Rtot⟧, כאשר E הוא מתח המקור (המסומן V בציור), Rtot = R1 + Rp ו-Rp היא ההתנגדות השקולה של R2 ו-R3 שבמקביל.',
        'R2 נתון בקילו-אוהם (kΩ). המירו אותו לאוהם לפני החישוב: kΩ אחד שווה 1000 Ω.',
        `בדקו בדרך: R2 = ${c.shown('R2')} = ${fmt(c.R('R2'))} Ω, ולכן Rp = ⟦${fmt(c.R('R2'))}·${fmt(c.R('R3'))}⁄${fmt(c.R('R2'))} + ${fmt(c.R('R3'))}⟧ = ${fmt(c.Rp)} Ω ו-Rtot = ${fmt(c.R('R1'))} + ${fmt(c.Rp)} = ${fmt(c.Rtot)} Ω.`,
      ],
      traps: [
        { f: c => c.E / (c.R('R1') + par(c.R('R2') / 1000, c.R('R3'))), msg: 'R2 נתון בקילו-אוהם (kΩ) ושכחתם להמיר אותו לאוהם לפני שחישבתם את ההתנגדות השקולה. kΩ אחד שווה 1000 Ω.' },
        { f: (c, a) => a * 1000, msg: MSG_MA_TO_A },
        { f: c => c.E / c.Rp, msg: 'חישבתם רק עם ההתנגדות השקולה של R2 ו-R3, ושכחתם את R1 שמחובר בטור אליהן. הזרם הכללי עובר גם דרך R1.' },
      ],
    },
    // 17 - המרה בתשובה בלבד: הכול ב-SI, התשובה במיליאמפר.
    {
      circuit: ['S', 200, ['P', 300, 600]], E: 20, ask: 'current', target: 'R1', unit: 'mA', scale: 1e-3, note: 'a',
      concept: 'כדי למצוא את הזרם הכללי מצמצמים את הנגדים שבמקביל להתנגדות אחת ומחברים אליה את הנגד שבטור. אחר כך מחלקים את מתח המקור בהתנגדות הכוללת.',
      hints: c => [
        'R1 נמצא בטור לכל שאר המעגל, ולכן הזרם דרכו הוא הזרם הכללי: I = ⟦E⁄Rtot⟧, כאשר E הוא מתח המקור (המסומן V בציור), Rtot = R1 + Rp ו-Rp היא ההתנגדות השקולה של R2 ו-R3 שבמקביל.',
        'כל הנגדים באוהם והמתח בוולט, ולכן הזרם יוצא באמפר (A). התבקשה תשובה במיליאמפר (mA): A אחד שווה 1000 mA, ולכן כופלים ב-1000.',
        `בדקו בדרך: Rp = ⟦${fmt(c.R('R2'))}·${fmt(c.R('R3'))}⁄${fmt(c.R('R2'))} + ${fmt(c.R('R3'))}⟧ = ${fmt(c.Rp)} Ω ו-Rtot = ${fmt(c.R('R1'))} + ${fmt(c.Rp)} = ${fmt(c.Rtot)} Ω, ולכן I = ⟦${fmt(c.E)}⁄${fmt(c.Rtot)}⟧ A.`,
      ],
      traps: [
        { f: c => c.I('R1'), msg: MSG_A_TO_MA },
        { f: c => c.I('R1') / 1000, msg: MSG_A_TO_MA_REVERSED },
        { f: c => c.E / c.R('R1') / c.scale, msg: 'חישבתם את הזרם רק לפי R1 ושכחתם את R2 ו-R3. הזרם הכללי נקבע לפי ההתנגדות של כל המעגל.' },
        { f: c => c.E / (c.R('R1') + c.R('R2') + c.R('R3')) / c.scale, msg: MSG_ALL_SERIES },
      ],
    },
    // 18 - המרות כמה יחידות: R2, R3 בקילו-אוהם (R1 באוהם), הזרם בענף אחד במיליאמפר.
    // R1 נתון באוהם (1000 Ω): הזרם בענף תלוי בכל שלושת הנגדים, ובלי המרה של R2, R3 התוצאה שונה מהנכונה.
    {
      circuit: ['S', 1000, ['P', kOhm(4), kOhm(4)]], E: 12, ask: 'current', target: 'R2', unit: 'mA', scale: 1e-3, note: 'dm',
      concept: 'הזרם הכללי עובר דרך R1 ואחר כך מתפצל בין הענפים, וכל ענף מקבל זרם לפי המתח שעל הבלוק המקבילי וההתנגדות שלו.',
      hints: c => [
        'הזרם הכללי Itot = ⟦E⁄Rtot⟧, כאשר E הוא מתח המקור (המסומן V בציור) ו-Rtot = R1 + Rp, עובר דרך R1 ואחר כך מתפצל בין R2 ל-R3. המתח על הבלוק המקבילי הוא Vp = Itot · Rp, כאשר Rp היא ההתנגדות השקולה של R2 ו-R3, והזרם ב-R2 הוא I2 = ⟦Vp⁄R2⟧.',
        'R1 כבר נתון באוהם, אבל R2 ו-R3 נתונים בקילו-אוהם (kΩ), ולכן המירו אותם לאוהם לפני החישוב: kΩ אחד שווה 1000 Ω. הזרם יוצא באמפר, והתבקשה תשובה במיליאמפר: A אחד שווה 1000 mA.',
        `בדקו בדרך: Rp = ⟦${fmt(c.R('R2'))}·${fmt(c.R('R3'))}⁄${fmt(c.R('R2'))} + ${fmt(c.R('R3'))}⟧ = ${fmt(c.Rp)} Ω ו-Rtot = ${fmt(c.R('R1'))} + ${fmt(c.Rp)} = ${fmt(c.Rtot)} Ω.`,
      ],
      traps: [
        { f: c => c.I('R2'), msg: MSG_A_TO_MA },
        { f: c => c.Itot / c.scale, msg: 'זה הזרם הכללי, והוא מתפצל בין R2 ל-R3. התבקש הזרם דרך R2 בלבד.' },
        { f: c => c.E / c.R('R2') / c.scale, msg: 'המתח על R2 אינו מתח המקור: חלק מהמתח נופל על R1 שבטור. הזרם דרך R2 נקבע לפי המתח על הבלוק המקבילי.' },
        { f: c => c.E / (c.R('R1') + c.R('R2') + c.R('R3')) / c.scale, msg: MSG_ALL_SERIES },
      ],
    },
    // 19 - המרות כמה יחידות: R2, R3, R4 בקילו-אוהם (R1 באוהם), שלושה ענפים מקבילים, הזרם בענף אחד במיליאמפר.
    // R1 נתון באוהם (2000 Ω): כך שכחת ההמרה של הענפים המקביליים משנה את התשובה.
    {
      circuit: ['S', 2000, ['P', kOhm(3), kOhm(6), kOhm(6)]], E: 7, ask: 'current', target: 'R3', unit: 'mA', scale: 1e-3, note: 'dm',
      concept: 'כשיש כמה ענפים מקבילים, ההתנגדות השקולה שלהם קטנה מכל אחת מההתנגדויות, והזרם הכללי מתחלק ביניהם: בענף עם ההתנגדות הקטנה יותר עובר זרם גדול יותר.',
      hints: c => [
        'מצמצמים את R2, R3 ו-R4 להתנגדות אחת: ⟦1⁄Rp⟧ = ⟦1⁄R2⟧ + ⟦1⁄R3⟧ + ⟦1⁄R4⟧. אחר כך Itot = ⟦E⁄R1 + Rp⟧, כאשר E הוא מתח המקור (המסומן V בציור), המתח על הבלוק הוא Vp = Itot · Rp, והזרם ב-R3 הוא I3 = ⟦Vp⁄R3⟧.',
        'R1 כבר נתון באוהם, אבל R2, R3 ו-R4 נתונים בקילו-אוהם (kΩ), ולכן המירו אותם לאוהם לפני החישוב: kΩ אחד שווה 1000 Ω. הזרם יוצא באמפר, והתבקשה תשובה במיליאמפר: A אחד שווה 1000 mA.',
        `בדקו בדרך: ⟦1⁄Rp⟧ = ⟦1⁄${fmt(c.R('R2'))}⟧ + ⟦1⁄${fmt(c.R('R3'))}⟧ + ⟦1⁄${fmt(c.R('R4'))}⟧, ולכן Rp = ${fmt(c.Rp)} Ω ו-Rtot = ${fmt(c.R('R1'))} + ${fmt(c.Rp)} = ${fmt(c.Rtot)} Ω.`,
      ],
      traps: [
        { f: c => c.I('R3'), msg: MSG_A_TO_MA },
        { f: c => c.Itot / c.scale, msg: 'זה הזרם הכללי, והוא מתפצל בין שלושת הענפים. התבקש הזרם דרך R3 בלבד.' },
        { f: c => c.I('R2') / c.scale, msg: 'זה הזרם דרך R2. התבקש הזרם דרך R3.' },
        { f: c => c.Itot / 3 / c.scale, msg: 'חילקתם את הזרם הכללי שווה בשווה בין שלושת הענפים. הזרם מתחלק לפי ההתנגדויות: ככל שהענף מתנגד פחות, עובר בו יותר זרם.' },
      ],
    },
    // 20 - המרות כמה יחידות: R2, R3 בקילו-אוהם (R1 באוהם), הספק על R1 במיליוואט.
    // R1 נתון באוהם (1000 Ω): בלי המרה של R2, R3 ההספק יוצא שונה מהנכון.
    {
      circuit: ['S', 1000, ['P', kOhm(3), kOhm(6)]], E: 24, ask: 'power', target: 'R1', unit: 'mW', scale: 1e-3, note: 'dm',
      concept: 'ההספק על נגד הוא I² · R: הזרם בריבוע כפול ההתנגדות. R1 מחובר בטור לבלוק המקבילי, ולכן הזרם שעובר בו הוא הזרם הכללי.',
      hints: c => [
        'הזרם שעובר ב-R1 הוא הזרם הכללי: I = ⟦E⁄Rtot⟧, כאשר E הוא מתח המקור (המסומן V בציור) ו-Rtot = R1 + Rp. ההספק על R1 הוא P = I² · R1.',
        'R1 כבר נתון באוהם, אבל R2 ו-R3 נתונים בקילו-אוהם (kΩ), ולכן המירו אותם לאוהם לפני החישוב: kΩ אחד שווה 1000 Ω. ההספק יוצא בוואט (W), והתבקשה תשובה במיליוואט: W אחד שווה 1000 mW.',
        `בדקו בדרך: Rp = ⟦${fmt(c.R('R2'))}·${fmt(c.R('R3'))}⁄${fmt(c.R('R2'))} + ${fmt(c.R('R3'))}⟧ = ${fmt(c.Rp)} Ω, Rtot = ${fmt(c.R('R1'))} + ${fmt(c.Rp)} = ${fmt(c.Rtot)} Ω ולכן I = ⟦${fmt(c.E)}⁄${fmt(c.Rtot)}⟧ A.`,
      ],
      traps: [
        { f: c => c.P('R1'), msg: MSG_W_TO_MW },
        { f: c => c.E * c.Itot / c.scale, msg: 'זה ההספק הכולל שהמקור מספק, E · I. התבקש ההספק על R1 בלבד.' },
        { f: c => c.E ** 2 / c.R('R1') / c.scale, msg: 'השתמשתם במתח המקור כאילו כולו נופל על R1. חלק מהמתח נופל גם על הבלוק המקבילי.' },
        { f: c => c.Itot * c.R('R1'), msg: 'הערך הזה הוא הזרם במיליאמפר, או המכפלה I · R שנותנת מתח (V). התבקש הספק: P = I² · R, עם הזרם בריבוע.' },
      ],
    },
  ],
};

function convPrompt(ask, name) {
  if (ask === 'current') return `מהו הזרם (I) העובר דרך ${name}?`;
  if (ask === 'voltage') return `מהו מפל המתח (V) על ${name}?`;
  return `מהו ההספק (P) המתפזר ב-${name}?`;
}

function buildConversionLevel(topicKey, localId) {
  const def = CONV_DEFS[topicKey][localId - RANDOM_LEVELS[topicKey] - 1];
  if (!def) throw new RangeError(`${topicKey}: שלב לא קיים (${localId})`);

  const root = buildConvTree(def.circuit);
  labelLeaves(root);
  const { root: solved } = solveCircuit(root, def.E, 0);
  const leaves = collectLeaves(solved);
  const byLabel = {};
  leaves.forEach(l => { byLabel[l.label] = l; });
  const target = byLabel[def.target];
  const block = solved.children && solved.children.find(ch => ch.children);

  const c = {
    E: def.E, scale: def.scale,
    R: label => byLabel[label].value,
    I: label => byLabel[label].current.abs(),
    V: label => byLabel[label].voltageDrop.abs(),
    P: label => byLabel[label].current.abs() ** 2 * byLabel[label].value,
    shown: label => (byLabel[label].unitDisplay === 'k' ? `${fmt(byLabel[label].value / 1000)} kΩ` : `${fmt(byLabel[label].value)} Ω`),
    Itot: solved.current.abs(),
    Rtot: solved._Z.abs(),
    Rp: block ? block._Z.abs() : null,
  };
  const si = def.ask === 'current' ? c.I(def.target) : def.ask === 'voltage' ? c.V(def.target) : c.P(def.target);
  const answer = sig(si / def.scale);

  return {
    topicId: topicKey, id: localId,
    title: topicKey === 'basic' ? `אתגר טירונות #${localId - 10}` : `רשת נגדים מעורבת #${localId}`,
    description: def.concept + NOTE[def.note],
    circuitKind: 'tree', isAC: false, source: { voltage: def.E, freqHz: 0 },
    root: solved, leaves, noBurn: true,
    question: {
      ask: def.ask, targetId: target.id, targetLabel: target.label,
      unit: def.unit, scale: def.scale,
      prompt: convPrompt(def.ask, target.label),
      answer, hints: def.hints(c),
      traps: def.traps.map(t => ({ value: sig(t.f(c, answer)), message: t.msg })),
    },
  };
}

// ---------- ניתוב לפי נושא ----------
// TOPIC_SEED_OFFSET שומר על אותם seed-ים בדיוק שהיו קיימים כשהכל היה ממוספר
// גלובלית 1-50 (כדי לא לשנות אף מעגל שכבר נבדק ואומת חזותית).
// basic ו-advanced: 15 שלבים אקראיים + 5 שלבי המרה מפורשים (בלי seed), ולכן ה-offset של ac (30) ושל boss (40) לא זז.
const TOPIC_SEED_OFFSET = { basic: 0, advanced: 15, ac: 30, boss: 40 };
const TOPIC_LEVEL_COUNT = { basic: 20, advanced: 20, ac: 10, boss: 10 };

function generateForTopic(topicKey, localId, rng) {
  const sub = localId - 1;
  if (topicKey === 'basic') return genBasic(sub, rng);
  if (topicKey === 'advanced') return genAdvanced(sub, rng);
  if (topicKey === 'ac') return genAC(sub, rng);
  if (topicKey === 'boss') return localId <= 7 ? genBossTree(sub, rng) : genBossOpamp(localId - 8, rng);
  throw new Error('נושא לא מוכר: ' + topicKey);
}

/** מייצר (או שולף מהמטמון) שלב לפי (topicKey, localId 1..N), כולל פתרון פיזיקלי מלא. */
const cache = new Map();
export function generateTopicLevel(topicKey, localId) {
  const cacheKey = topicKey + ':' + localId;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  // שלבי ההמרה המפורשים (אחרי השלבים האקראיים) - בלי RNG ובלי seed
  if (CONV_DEFS[topicKey] && localId > RANDOM_LEVELS[topicKey]) {
    const convLevel = buildConversionLevel(topicKey, localId);
    cache.set(cacheKey, convLevel);
    return convLevel;
  }

  const globalSeedId = TOPIC_SEED_OFFSET[topicKey] + localId;
  const rng = mulberry32(9973 * globalSeedId + 12345);
  const g = generateForTopic(topicKey, localId, rng);

  let level;
  if (g.circuitKind === 'opamp') {
    level = {
      topicId: topicKey, id: localId, title: g.title, description: g.desc,
      circuitKind: 'opamp', isAC: false, source: { voltage: g.V, freqHz: 0 },
      opamp: g.opamp, leaves: [], labelMap: {}, question: g.question,
    };
  } else {
    labelLeaves(g.root);
    attachSafeMaxPower(g.root, rng);
    const leaves = collectLeaves(g.root);
    const targetLeaf = g.ask === 'req' ? null : pickAskableLeaf(g.root, rng, g.ask);
    const question = buildQuestion(g, g.root, g.ask, targetLeaf, rng);
    level = {
      topicId: topicKey, id: localId, title: g.title, description: g.desc,
      circuitKind: 'tree', isAC: g.isAC, source: { voltage: g.V, freqHz: g.freq },
      root: g.root, leaves, question,
    };
  }
  cache.set(cacheKey, level);
  return level;
}

export function topicLevelCount(topicKey) {
  return TOPIC_LEVEL_COUNT[topicKey];
}
