// ==========================================================================
// currentLevelGenerator.js - "זרם חשמלי". 20 שלבים, 4 מנגנוני שאלה, קושי
// עולה בהדרגה:
//  - 'direct' find:'I'  : הצבה ישירה I=Q/t (הכי בסיסי).
//  - 'direct' find:'Q'  : סידור מחדש - נתונים I,t, מוצאים Q=I·t.
//  - 'direct' find:'t'  : סידור מחדש - נתונים I,Q, מוצאים t=Q/I.
//  - 'direction'        : כמו find:'I', אבל גם נתון כיוון תנועת האלקטרונים
//    בפועל, וצריך לקבוע גם כיוון (הפוך) בנוסף לגודל - תשובה חתומה, אותו
//    עיקרון בדיוק כמו הזרם החתום במשחק האסטרואידים.
// דרגות הקושי (1-7 יסודי/עגול, 8-13 סידור נוסחה/כיוון, 14-16 כיוון עם
// מספרים פחות עגולים, 17-20 מספרים ריאליים קטנים - עשרוני/כתיב מדעי).
// בלי "קצר חשמלי" ב-find:'Q'/'t' - אין סיפור פיזיקלי טבעי ל"יותר מדי
// מטען/זמן" (בניגוד לזרם עצמו).
// ==========================================================================
import { CONFIG } from '../config.js';

const roundTo = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const dirArrowText = (dir) => (dir === 'AtoB' ? 'A → B' : 'B → A');

const LEVEL_DEFS = [
  // --- יסודי: הצבה ישירה I=Q/t, מספרים עגולים ---
  { type: 'direct', find: 'I', Q: 8, t: 4, context: 'תיל המזין מנוע חשמלי קטן' },
  { type: 'direct', find: 'I', Q: 12, t: 3, context: 'תיל טעינה של סוללה ניידת (Power Bank)' },
  { type: 'direct', find: 'I', Q: 18, t: 6, context: 'תיל הזנה למאוורר שולחני' },
  { type: 'direct', find: 'I', Q: 9, t: 1.5, context: 'תיל המחבר לפנס יד חזק' },
  { type: 'direct', find: 'I', Q: 7.5, t: 3, context: 'תיל הזנה לרמקול נייד' },
  { type: 'direct', find: 'I', Q: 4.2, t: 1.2, context: 'תיל הזנה למטען שעון חכם' },
  { type: 'direct', find: 'I', Q: 0.6, t: 0.2, context: 'תיל בתוך שלט רחוק' },
  // --- בינוני: סידור מחדש של הנוסחה (Q=I·t) ---
  { type: 'direct', find: 'Q', I: 3, t: 5, context: 'תיל המזין רצועת תאורת LED' },
  { type: 'direct', find: 'Q', I: 1.5, t: 8, context: 'תיל טעינת אוזניות אלחוטיות' },
  { type: 'direct', find: 'Q', I: 4, t: 2.5, context: 'תיל מנוע מכונית צעצוע' },
  // --- בינוני: סידור מחדש של הנוסחה (t=Q/I) ---
  { type: 'direct', find: 't', I: 2, Q: 10, context: 'תיל הזנה למייבש שיער קטן' },
  { type: 'direct', find: 't', I: 0.5, Q: 6, context: 'תיל טעינת מצלמה דיגיטלית' },
  { type: 'direct', find: 't', I: 5, Q: 7.5, context: 'תיל הזנה לתנור צעצוע' },
  // --- מתקדם: כיוון (חתום) - מספרים פחות עגולים ---
  { type: 'direction', Q: 6, t: 2, electronDir: 'AtoB', context: 'קטע תיל בין שני הדקים A ו-B (מאוורר קטן)' },
  { type: 'direction', Q: 10, t: 4, electronDir: 'BtoA', context: 'קטע תיל שני בין שני הדקים A ו-B (רמקול)' },
  { type: 'direction', Q: 14, t: 4, electronDir: 'AtoB', context: 'קטע תיל שלישי בין A ל-B (מטען טלפון)' },
  // --- קשה: מספרים ריאליים קטנים (עשרוני/כתיב מדעי) ---
  { type: 'direct', find: 'I', Q: 0.05, t: 2, context: 'תיל בתוך חיישן תנועה קטן' },
  { type: 'direct', find: 'Q', I: 0.002, t: 600, context: 'תיל בתוך שעון קיר דיגיטלי' },
  { type: 'direct', find: 't', I: 0.15, Q: 9, context: 'תיל הזנה לשעון מעורר קטן' },
  { type: 'direction', Q: 0.75, t: 0.25, electronDir: 'BtoA', context: 'תיל חיישן זעיר בין הדקים A ו-B' },
];

function generateDirectLevel(localId, def) {
  if (def.find === 'Q') {
    const Q = roundTo(def.I * def.t, 5);
    return {
      type: 'direct', find: 'Q', Q, t: def.t, I: def.I, context: def.context,
      title: `כמה מטען עבר? #${localId}`,
      desc: `דרך חתך הרוחב של ${def.context} זורם זרם קבוע של I=${def.I}A, במשך זמן של t=${def.t} שניות. חשבו את כמות המטען הכוללת Q שעברה דרך החתך באותו זמן.`,
      prompt: `זרם של I=${def.I}A זורם דרך חתך רוחב של תיל במשך t=${def.t} שניות. איזה מטען כולל Q עבר דרך החתך?`,
      answer: Q, unit: 'C',
    };
  }
  if (def.find === 't') {
    const t = roundTo(def.Q / def.I, 5);
    return {
      type: 'direct', find: 't', Q: def.Q, I: def.I, t, context: def.context,
      title: `כמה זמן לקח? #${localId}`,
      desc: `דרך חתך הרוחב של ${def.context} זורם זרם קבוע של I=${def.I}A, עד שעבר מטען כולל של Q=${def.Q} קולון. חשבו כמה זמן (t) לקח לכך.`,
      prompt: `זרם של I=${def.I}A זורם דרך חתך רוחב של תיל, עד שעובר מטען כולל Q=${def.Q}C. כמה זמן (t) לקח לכך?`,
      answer: t, unit: " שנ'",
    };
  }
  const current = roundTo(def.Q / def.t, 5);
  return {
    type: 'direct', find: 'I', Q: def.Q, t: def.t, context: def.context,
    title: `מהו הזרם? #${localId}`,
    desc: `דרך חתך הרוחב של ${def.context} עובר מטען כולל של Q=${def.Q} קולון, במשך זמן של t=${def.t} שניות. חשבו את עוצמת הזרם החשמלי I הזורם בתיל.`,
    prompt: `מטען של Q=${def.Q}C עובר דרך חתך רוחב של תיל בזמן t=${def.t} שניות. מהו הזרם I?`,
    answer: current, unit: 'A',
  };
}

function generateDirectionLevel(localId, def) {
  const magnitude = roundTo(def.Q / def.t, 5);
  const currentDir = def.electronDir === 'AtoB' ? 'BtoA' : 'AtoB';
  const answer = currentDir === 'AtoB' ? magnitude : -magnitude; // חיובי=A→B, שלילי=B→A
  return {
    type: 'direction', Q: def.Q, t: def.t, context: def.context, electronDir: def.electronDir, currentDir,
    title: `כיוון הזרם #${localId}`,
    desc: `בקטע תיל בין שני הדקים A ל-B, האלקטרונים החופשיים זורמים בפועל בכיוון ${dirArrowText(def.electronDir)}. דרך חתך הרוחב שלו עובר מטען של Q=${def.Q} קולון במשך t=${def.t} שניות. קבעו את גודל וכיוון הזרם החשמלי המוסכם I.`,
    prompt: `האלקטרונים בתיל זורמים בפועל בכיוון ${dirArrowText(def.electronDir)}. מטען Q=${def.Q}C עובר דרך חתך רוחב שלו בזמן t=${def.t} שניות. מהו הזרם המוסכם I (גודל וכיוון)? הזינו ערך חיובי אם כיוונו A→B, ושלילי אם כיוונו B→A.`,
    answer, unit: 'A',
  };
}

function generateForLocal(localId) {
  const def = LEVEL_DEFS[localId - 1];
  return def.type === 'direction' ? generateDirectionLevel(localId, def) : generateDirectLevel(localId, def);
}

const cache = new Map();
export function generateCurrentLevel(localId) {
  if (cache.has(localId)) return cache.get(localId);
  const g = generateForLocal(localId);

  let hints;
  if (g.type === 'direction') {
    hints = [
      'הזרם החשמלי המוסכם זורם תמיד בכיוון ההפוך לכיוון התנועה בפועל של האלקטרונים (מטענים שליליים) - זו הגדרת הכיוון המוסכם.',
      'גודל הזרם מחושב באותו אופן כמו תמיד: I = Q/t.',
      `התנועה בפועל של האלקטרונים: ${dirArrowText(g.electronDir)} ← לכן כיוון הזרם המוסכם: ${dirArrowText(g.currentDir)}.`,
    ];
  } else if (g.find === 'Q') {
    hints = [
      'אותה נוסחה בדיוק, רק מסודרת אחרת: I = Q/t ⇒ Q = I·t.',
      'יחידת המטען היא קולון (C).',
      `הציבו את הנתונים: Q = ${g.I}A × ${g.t}s.`,
    ];
  } else if (g.find === 't') {
    hints = [
      'אותה נוסחה בדיוק, רק מסודרת אחרת: I = Q/t ⇒ t = Q/I.',
      'יחידת הזמן היא שניות (s).',
      `הציבו את הנתונים: t = ${g.Q}C / ${g.I}A.`,
    ];
  } else {
    hints = [
      'זרם חשמלי מוגדר כקצב זרימת המטען דרך חתך הרוחב של המוליך: I = Q/t.',
      'יחידת הזרם היא אמפר (A): 1A = 1C/1s - קולון אחד שעובר בשנייה אחת.',
      `הציבו את הנתונים: I = ${g.Q}C / ${g.t}s.`,
    ];
  }

  const question = { type: g.type, find: g.find, prompt: g.prompt, unit: g.unit, answer: g.answer, hints, Q: g.Q, t: g.t, I: g.I };
  if (g.type === 'direction') { question.electronDir = g.electronDir; question.currentDir = g.currentDir; }
  // "קצר חשמלי" - שייך רק לשלבים שבהם val מייצג *זרם* (לא מטען כולל/זמן) -
  // זרם גדול בהרבה מהריאלי פוסל את הניסיון, אותו עיקרון פיזיקלי-פדגוגי
  // כמו "התחממות יתר" במקורות מתח. אין סיפור פיזיקלי דומה ל"יותר מדי
  // מטען/זמן".
  if (g.type === 'direction' || g.find === 'I') {
    question.crashCeiling = roundTo(Math.abs(question.answer) * 6, 5);
  }

  const level = {
    id: localId, title: g.title, description: g.desc,
    world: { type: g.type, find: g.find, Q: g.Q, t: g.t, I: g.I, context: g.context, electronDir: g.electronDir },
    question,
  };
  cache.set(localId, level);
  return level;
}

export function topicLevelCount() { return LEVEL_DEFS.length; }

// ---------------------------------------------------------------- הערכת תשובה
function evaluateFindQ(q, val) {
  const iTol = Math.max(Math.abs(q.I) * CONFIG.ANSWER_TOLERANCE_PCT, 1e-9);
  const tTol = Math.max(Math.abs(q.t) * CONFIG.ANSWER_TOLERANCE_PCT, 1e-9);
  if (Math.abs(val - q.I) <= iTol) {
    return { outcome: 'incorrect', value: val, message: '⚡ זה ערך הזרם עצמו (I), לא המטען - זכרו להכפיל בזמן: Q = I·t.' };
  }
  if (Math.abs(val - q.t) <= tTol) {
    return { outcome: 'incorrect', value: val, message: '⚡ זה ערך הזמן עצמו (t), לא המטען - בדקו שוב את הנוסחה Q = I·t.' };
  }
  return { outcome: 'incorrect', value: val, message: '🔌 לא מדויק - סדרו מחדש את הנוסחה I=Q/t כך שתבודד את Q (Q=I·t), ונסו שוב.' };
}

function evaluateFindT(q, val) {
  const iTol = Math.max(Math.abs(q.I) * CONFIG.ANSWER_TOLERANCE_PCT, 1e-9);
  const qTol = Math.max(Math.abs(q.Q) * CONFIG.ANSWER_TOLERANCE_PCT, 1e-9);
  if (Math.abs(val - q.I) <= iTol) {
    return { outcome: 'incorrect', value: val, message: '⚡ זה ערך הזרם עצמו (I), לא הזמן - זכרו: t = Q/I.' };
  }
  if (Math.abs(val - q.Q) <= qTol) {
    return { outcome: 'incorrect', value: val, message: '⚡ זה ערך המטען עצמו (Q), לא הזמן - בדקו שוב את הנוסחה t = Q/I.' };
  }
  return { outcome: 'incorrect', value: val, message: '🔌 לא מדויק - סדרו מחדש את הנוסחה I=Q/t כך שתבודד את t (t=Q/I), ונסו שוב.' };
}

export function evaluateCurrentAnswer(level, val) {
  const q = level.question;
  const tolerance = Math.max(Math.abs(q.answer) * CONFIG.ANSWER_TOLERANCE_PCT, 1e-9);
  if (Math.abs(val - q.answer) <= tolerance) return { outcome: 'correct', value: val };

  if (q.type === 'direct' && q.find === 'Q') return evaluateFindQ(q, val);
  if (q.type === 'direct' && q.find === 't') return evaluateFindT(q, val);

  // "קצר חשמלי": בשלב הכיוון גודל קיצוני פוסל בכל כיוון; בשלב הישיר (בלי
  // מושג כיוון) רק ערך חיובי קיצוני נחשב "יותר מדי זרם".
  const overCeiling = q.type === 'direction' ? Math.abs(val) >= q.crashCeiling : (val > 0 && val >= q.crashCeiling);
  if (overCeiling) {
    return {
      outcome: 'disqualified',
      value: val,
      message: '🔥 <b>קצר חשמלי!</b> זרם כה גבוה לנתונים האלה אינו ריאלי - התיל התחמם ונשרף. פוסלים את הניסיון - בדקו את החישוב ונסו שוב.',
    };
  }

  if (q.type === 'direction') {
    const magTol = Math.max(Math.abs(q.answer) * CONFIG.ANSWER_TOLERANCE_PCT, 1e-9);
    const sameMagnitudeWrongSign = Math.abs(Math.abs(val) - Math.abs(q.answer)) <= magTol && Math.sign(val) !== Math.sign(q.answer);
    if (sameMagnitudeWrongSign) {
      return {
        outcome: 'incorrect',
        value: val,
        message: '🔁 הגודל נכון, אבל הכיוון הפוך - זכרו: הזרם המוסכם זורם תמיד נגד כיוון התנועה בפועל של האלקטרונים, לא באותו כיוון.',
      };
    }
  }

  const qTol = Math.max(Math.abs(q.Q) * CONFIG.ANSWER_TOLERANCE_PCT, 1e-9);
  const tTol = Math.max(Math.abs(q.t) * CONFIG.ANSWER_TOLERANCE_PCT, 1e-9);
  if (Math.abs(Math.abs(val) - q.Q) <= qTol) {
    return { outcome: 'incorrect', value: val, message: '⚡ זה ערך המטען עצמו (Q), לא הזרם - זכרו לחלק בזמן: I = Q/t.' };
  }
  if (Math.abs(Math.abs(val) - q.t) <= tTol) {
    return { outcome: 'incorrect', value: val, message: '⚡ זה ערך הזמן עצמו (t), לא הזרם - בדקו שוב את הנוסחה I = Q/t.' };
  }

  return {
    outcome: 'incorrect',
    value: val,
    message: q.type === 'direction'
      ? '🔌 לא מדויק - בדקו מחדש גם את הגודל (I=Q/t) וגם את הכיוון (הפוך לתנועת האלקטרונים).'
      : '🔌 לא מדויק - חזרו על הגדרת הזרם (I = Q/t) ונסו שוב.',
  };
}
