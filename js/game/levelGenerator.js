// ==========================================================================
// levelGenerator.js - יוצר שלבי תרגול בצורה פרוצדורלית ודטרמיניסטית עבור
// כל אחד מנושאי הלימוד (topics) המוגדרים ב-curriculum.js.
// אותו (topicKey, localId) תמיד מייצר בדיוק אותו מעגל (RNG עם seed קבוע).
// ==========================================================================
import { R, Cap, Series, Parallel, solveCircuit, collectLeaves } from './circuitEngine.js';

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
  current: ['חוק אוהם: I = V ÷ R', 'בטור - הזרם זהה בכל הרכיבים. במקביל - הזרם מתחלק בין הענפים.'],
  voltage: ['מפל מתח על רכיב: V = I × R', 'סכום מפלי המתח בעל טורי שווה למתח המקור (חוק קירכהוף למתח).'],
  power: ['הספק: P = I² × R', 'אם ההספק המחושב חורג מההספק המרבי המותר - הנגד יישרף!'],
  req: ['התנגדות שקולה בטור: Req = R1+R2+...', 'התנגדות שקולה במקביל: 1/Req = 1/R1 + 1/R2 + ...'],
  veff: ['במעגל AC משתמשים במתח האפקטיבי (Veff) בדיוק כמו במתח DC.', 'V = I × |Z|'],
  impedance: ['עכבת קבל: Xc = 1 / (2πfC)', 'עכבה כוללת בטור: Z = R + jXc (משתמשים בגודל |Z|)'],
  gain: ['מגבר אינברטי: Vout = −(Rf/Rin) × Vin', 'מגבר לא-אינברטי: Vout = (1 + Rf/Rin) × Vin'],
};

function buildQuestion(level, root, ask, targetLeaf, rng) {
  const isAC = level.isAC;
  let value, unit, label, prompt;
  const t = targetLeaf || root;
  const name = targetLeaf ? targetLeaf.label : (isAC ? 'העכבה הכוללת (Z)' : 'ההתנגדות השקולה (Req)');

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
    prompt = isAC ? 'מהי העכבה הכוללת (|Z|) של המעגל?' : 'מהי ההתנגדות השקולה (Req) של המעגל כולו?';
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
  return { root: solved, V, freq: 0, isAC: false, ask, title,
    desc: 'אמפר נכנס למבוך החשמלי הראשון. עליו לפענח את חוקי אוהם כדי להמשיך הלאה בבטחה.' };
}

function genAdvanced(sub, rng) {
  const V = pick(rng, V_ADV);
  const branches = sub < 5 ? 2 : 3;
  let root = sub < 10 ? mkMixed(rng, R_ADV, branches) : mkDeepMixed(rng, R_ADV, 2);
  const ask = pick(rng, ['current', 'power', 'power', 'voltage', 'req']);
  const { root: solved } = solveCircuit(root, V, 0);
  return { root: solved, V, freq: 0, isAC: false, ask,
    title: `רשת נגדים מעורבת #${sub + 1}`,
    desc: 'הצמתים מתרבים והזרם מתפצל לכמה ענפים. אמפר זקוק לחישוב מדויק של חלוקת הזרמים כדי לא להעמיס על אף רכיב.' };
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

// ---------- ניתוב לפי נושא ----------
// TOPIC_SEED_OFFSET שומר על אותם seed-ים בדיוק שהיו קיימים כשהכל היה ממוספר
// גלובלית 1-50 (כדי לא לשנות אף מעגל שכבר נבדק ואומת חזותית).
const TOPIC_SEED_OFFSET = { basic: 0, advanced: 15, ac: 30, boss: 40 };
const TOPIC_LEVEL_COUNT = { basic: 15, advanced: 15, ac: 10, boss: 10 };

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
