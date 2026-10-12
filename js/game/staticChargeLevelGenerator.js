// ==========================================================================
// staticChargeLevelGenerator.js - "מטען, כוח ושדה חשמלי" (פרק 1): 16 שלבים
// בנוסח ניסויי חשמל סטטי פשוטים (סרגל ונייר, בלון וקיר, בלון וזרם מים), עם מדרגת המרות יחידות:
//   1-5 בלי המרות כלל (נתונים ותשובה ב-SI) | 6-8 נתון אחד להמרה בכל שלב (Q, אחר כך r, אחר כך q) |
//   9-10 המרה בתשובה בלבד | 11-16 המרה של כמה נתונים (ובתשובה). ראו NOTE_* ו-staticChargeFormulas.js.
//
// כל תשובה ו"מלכודת" מחושבות מערכי הנתונים עצמם (ערך SI שנגזר מהטקסט המוצג
// בשורת הנתון) באמצעות electroEngine.js (KC, coulombForceSigned, electricField,
// distanceForForce) - אין תשובות קשיחות. קבוע שאינו במנוע: g (למטה); e נלקח משורת הנתון בשלב 5.
//
// ---------------------------------------------------------------- צורת level
// level = {
//   id, title, description,
//   world: {
//     scene:   'ruler_paper' | 'balloon_wall' | 'water_balloon',
//     variant: 'basic'          // המצב הרגיל של הסצנה
//            | 'touched'        // שלבים 2, 8: פיסת הנייר נגעה בסרגל - סימני − על הנייר
//            | 'hair_patch'     // שלב 5: טלאי שיער קטן עם סימני + בפינה
//            | 'two_distances', // שלב 3: בלון מלא רחוק (r) + בלון רפאים קרוב (r')
//     source:  { kind: 'ruler' | 'balloon', sign: -1 },   // הגוף הטעון (תמיד שלילי)
//     target:  { kind: 'paper' | 'wall' | 'drop', sign: +1 | -1 } | null,
//              // sign = סימן המטען בצד הקרוב של המטרה (נייר/קיר/טיפה).
//              // null בשלב 5 (אין זוג גופים - יש רק טלאי שיער).
//     interaction: 'attract' | 'repel' | null, // נגזר מסימני source/target; null כש-target=null
//     unknown: 'force' | 'force_new_distance' | 'electron_count' | 'field'
//            | 'source_charge' | 'distance' | 'min_source_charge' | 'force_over_weight',
//     signed:  boolean,         // true = התשובה חתומה (חיובי=דחייה, שלילי=משיכה): שלבים 1, 2, 6, 7, 8, 9, 11, 12
//     show: { r: boolean,       // האם מצוייר סמן המרחק r (שלב 5: false)
//             rPrime: boolean,  // שלב 3 בלבד: סמן r' + בלון רפאים
//             hairPatch: boolean },
//     geometry: { rFarRel: 1, rNearRel: number } | null, // שלב 3: יחס מרחקים לציור (קרוב/רחוק = 1/3)
//     success: {                // מה להציג רק ב-render(level, true)
//       anim: string,           // שם האנימציה (ראו successAnim בכל שלב)
//       arrows: [{ kind: 'force' | 'weight', lengthRel: number }], // חצי כוח/משקל (אורך יחסי)
//       fieldLines: boolean,    // קווי שדה מקווקווים (שלבים 4, 10, 16)
//       deflectionDeg: number | null, // שלב 16: סטיית הזרם מהאנכי (מעלות)
//     },
//   },
//   question: { prompt (HTML: סיפור, <br>, שאלה - בלי ספרות), data: [{label, value}],
//               unit, answer, hints, traps: [{value, message}] },
// }
// - ציור הסצנה לא מכיל ספרות; סימני ה-+/− בציור נקבעים מ-source.sign / target.sign.
// - evaluateStaticChargeAnswer מחזיר רק 'correct' | 'incorrect' (אין פסילה).
// ==========================================================================
import { KC, CM, coulombForceSigned, electricField, distanceForForce } from './electroEngine.js';
import { CONFIG } from '../config.js';

// g אינו ב-electroEngine.js ("נוסחאות בתוכנית": g = 10). e מגיע משורת הנתון בשלב 5.
const G = 10; // m/s²
// מכפילי יחידות SI (CM מגיע מהמנוע).
const NC = 1e-9, MM = 1e-3, MN = 1e-3, UN = 1e-6, KILO = 1e3;

// ---------------------------------------------------------------- עזרי בסיס
/** עיגול ל-6 ספרות משמעותיות - מנקה רעש נקודה צפה (למשל -0.40000000000000002). */
const sig = x => Number(x.toPrecision(6));

const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
const sup = n => String(n).split('').map(ch => SUP[ch] || ch).join('');

/**
 * שורת נתון: ערך SI נגזר מהמספר המוצג בדיוק (Number('-30e-9')) - כך הטקסט שהתלמיד
 * רואה והערך שמחשבים ממנו זהים תמיד. opts.sci = כתיב מדעי (m×10ᵉ), opts.sign =
 * מציגים + מפורש למטען חיובי. המינוס המוצג הוא − יוניקוד (קריאות בלבד).
 */
function datum(key, label, shown, unit, exp10, opts = {}) {
  const neg = shown < 0;
  const signChar = neg ? '−' : (opts.sign ? '+' : '');
  const body = String(Math.abs(shown)) + (opts.sci ? `×10${sup(exp10)}` : '');
  return { key, label, value: `${signChar}${body} ${unit}`, si: Number(`${shown}e${exp10}`) };
}

// קבועים שהשלב צריך (def.consts) מתווספים לסוף רשימת הנתונים - שורה נפרדת לכל קבוע,
// כמו כל נתון אחר, ולא בתוך משפט. הערך מוצג בלבד: החישוב משתמש ב-KC / G.
const CONST_ROWS = {
  k: { label: 'קבוע קולון k', value: '9×10⁹ N·m²/C²' },
  g: { label: 'תאוצת הכובד g', value: '10 m/s²' },
};

const SIGN_NOTE = '(חיובי = דחייה, שלילי = משיכה)';

// ----------------------------------------------------------- הגדרות השלבים
const RULER = { kind: 'ruler', sign: -1 };
const BALLOON = { kind: 'balloon', sign: -1 };
const PAPER_NEAR_PLUS = { kind: 'paper', sign: +1 };   // נייר ניטרלי: בצד הקרוב נוצר +
const PAPER_TOUCHED = { kind: 'paper', sign: -1 };     // נייר שנגע בסרגל: קיבל − (שלב 3)
const WALL_NEAR_PLUS = { kind: 'wall', sign: +1 };
const DROP_PLUS = { kind: 'drop', sign: +1 };          // טיפה בזרם מחובר לברז: נשארת +

// שלבים 1-2 (תשובה חתומה): התיאור מציג את ההתקנה בלי לומר אם התוצאה משיכה או דחייה.
const DESC_RULER_SETUP = 'הנייר ניטרלי, אבל הסרגל השלילי דוחף אלקטרונים בנייר הרחק ממנו והצד הקרוב נטען חיובית. נתייחס רק למטען שבצד הקרוב, כשני מטענים נקודתיים במרחק r.';
const DESC_WALL_SETUP = 'הבלון שחיככו בשיער קיבל אלקטרונים ונטען שלילית. הקיר ניטרלי, אבל בפניו מול הבלון נוצר מטען חיובי. נתייחס לבלון ולמטען בקיר כשני מטענים נקודתיים במרחק r.';
// שאר השלבים (תשובה בגודל): אפשר לומר שהאינטראקציה היא משיכה.
const DESC_RULER = 'הנייר ניטרלי, אבל הסרגל השלילי דוחף אלקטרונים בנייר הרחק ממנו והצד הקרוב נטען חיובית. לכן הנייר נמשך, ונתייחס רק למטען שבצד הקרוב, כשני מטענים נקודתיים במרחק r.';
const DESC_WALL = 'הבלון שחיככו בשיער קיבל אלקטרונים ונטען שלילית. הקיר ניטרלי, אבל בפניו מול הבלון נוצר מטען חיובי, ולכן הבלון נמשך אליו. נתייחס אליהם כשני מטענים נקודתיים במרחק r.';
const DESC_WATER = 'זרם המים מחובר לברז. הבלון השלילי דוחף אלקטרונים במעלה הזרם, ולכן הטיפות שנופלות נשארות חיוביות והזרם מתכופף אל הבלון. נתייחס לבלון ולטיפה כשני מטענים נקודתיים.';

// הערות "מדרגת המרות" שמתווספות להסבר המתקפל לפי סוג השלב (בלי מספרים, ובלי לומר איזה נתון להמיר -
// זה תפקיד הרמזים).
const NOTE_C0 = ' בשלב הזה כל הנתונים כבר ביחידות SI והתשובה מבוקשת ביחידת SI, ולכן אין צורך בהמרות.';
const NOTE_D1 = ' בשלב הזה אחד הנתונים אינו ביחידת SI.';
const NOTE_A = ' בשלב הזה כל הנתונים ב-SI. שימו לב ליחידה שבה מבוקשת התשובה.';
const NOTE_DM = ' בשלב הזה כמה מהנתונים אינם ביחידת SI.';
const NOTE_DM_PURE = ' בשלב הזה כמה מהנתונים אינם ביחידת SI. התשובה היא מספר טהור (יחס).';

const forcePair = (anim, extra = {}) => ({ anim, arrows: [{ kind: 'force', lengthRel: 1 }], fieldLines: false, deflectionDeg: null, ...extra });

const LEVEL_DEFS = [
  // ===== שלבים 1-5: בלי המרות יחידות. כל הנתונים וגם התשובה ביחידות SI (כתיב מדעי מותר) =====
  // 1 - ruler_paper: הצבה ישירה בחוק קולון. תשובה חתומה (משיכה), בניוטון.
  {
    scene: 'ruler_paper', title: 'סרגל ופיסת נייר', desc: DESC_RULER_SETUP + NOTE_C0,
    story: 'סרגל שחיככו בצמר מעל פיסת נייר.',
    ask: `מהו הכוח בין הסרגל לנייר? ${SIGN_NOTE}`,
    unit: 'N', signed: true, unknown: 'force', source: RULER, target: PAPER_NEAR_PLUS, consts: ['k'],
    data: [
      datum('Q', 'מטען הסרגל Q', -2, 'C', -8, { sci: true }),
      datum('q', 'מטען בצד הקרוב של הנייר q', 2, 'C', -9, { sci: true, sign: true }),
      datum('r', 'מרחק r', 0.03, 'm', 0),
    ],
    compute: v => coulombForceSigned(v.Q, v.q, v.r),
    traps: [
      { f: (v, a) => -a, msg: 'הסימן נשמט. סרגל שלילי ומטען חיובי בצד הקרוב של הנייר הם מטענים מנוגדים, ולכן משיכה (שלילי).' },
      { f: v => KC * v.Q * v.q / v.r, msg: 'שכחתם לרבע את r. בחוק קולון המרחק מופיע בריבוע: r².' },
      { f: v => coulombForceSigned(v.Q, v.q, v.r) / 1e9, msg: 'k הוא 9×10⁹ ולא 9. שכחתם את החזקה של הקבוע.' },
      { f: (v, a) => a * 1000, msg: 'התבקשה תשובה בניוטון (N). אין צורך להמיר ליחידה אחרת בשלב הזה.' },
    ],
    hints: [
      'חוק קולון: F = k·Q·q / r², עם k = 9×10⁹ N·m²/C². הציבו את שני המטענים כולל הסימן שלהם.',
      'מכפלה שלילית של המטענים = משיכה = כוח שלילי. מכפלה חיובית = דחייה = כוח חיובי.',
      'בדקו בדרך: k·Q·q = −3.6×10⁻⁷ ו-r² = 9×10⁻⁴. התוצאה בניוטון (N). אפשר להקליד אותה בכתיב מדעי, למשל 2.5e-3.',
    ],
    success: () => forcePair('paper_jumps_to_ruler'),
  },
  // 2 - ruler_paper (אחרי מגע): מטענים באותו סימן = דחייה (חיובי). בניוטון.
  {
    scene: 'ruler_paper', variant: 'touched', title: 'נייר שנגע בסרגל',
    desc: 'כשהנייר נוגע בסרגל עוברים אליו אלקטרונים, והוא נטען מאותו סוג של מטען כמו הסרגל. נתייחס אליהם כשני מטענים נקודתיים במרחק r.' + NOTE_C0,
    story: 'פיסת נייר נגעה בסרגל וקיבלה ממנו מטען.',
    ask: `מהו הכוח בין הסרגל לנייר? ${SIGN_NOTE}`,
    unit: 'N', signed: true, unknown: 'force', source: RULER, target: PAPER_TOUCHED, consts: ['k'],
    data: [
      datum('Q', 'מטען הסרגל Q', -2, 'C', -8, { sci: true }),
      datum('q', 'מטען הנייר אחרי המגע q', -5, 'C', -9, { sci: true }),
      datum('r', 'מרחק r', 0.015, 'm', 0),
    ],
    compute: v => coulombForceSigned(v.Q, v.q, v.r),
    traps: [
      { f: (v, a) => -a, msg: 'שני המטענים שליליים, ומטענים באותו סימן דוחים זה את זה. הכוח חיובי.' },
      { f: v => KC * v.Q * v.q / v.r, msg: 'שכחתם לרבע את r. בחוק קולון המרחק בריבוע.' },
      { f: v => coulombForceSigned(v.Q, v.q, v.r) / 1e9, msg: 'k הוא 9×10⁹ ולא 9. שכחתם את החזקה של הקבוע.' },
      { f: (v, a) => a * 1000, msg: 'התבקשה תשובה בניוטון (N). אין צורך להמיר ליחידה אחרת בשלב הזה.' },
    ],
    hints: [
      'השוו את הסימנים של שני המטענים. מה קורה בין שני מטענים כשהסימנים שלהם זהים?',
      'שני מטענים באותו סימן: המכפלה חיובית, כלומר דחייה וכוח חיובי.',
      'בדקו בדרך: k·Q·q = +9×10⁻⁷ ו-r² = 2.25×10⁻⁴. התוצאה בניוטון.',
    ],
    success: () => forcePair('paper_thrown_away'),
  },
  // 3 - water_balloon: חוק הריבוע ההפוך כיחס, בלי מטענים. גודל חיובי, ב-SI.
  {
    scene: 'water_balloon', variant: 'two_distances', title: 'בלון מתקרב לזרם מים', desc: DESC_WATER + NOTE_C0,
    story: 'מקרבים בלון טעון אל זרם מים, ומטען הטיפה לא משתנה.',
    ask: 'מהו גודל הכוח על הטיפה כשהבלון קרוב?',
    unit: 'N', signed: false, unknown: 'force_new_distance', source: BALLOON, target: DROP_PLUS,
    show: { rPrime: true },
    geometry: v => ({ rFarRel: 1, rNearRel: sig(v.rNear / v.rFar) }),
    data: [
      datum('F1', 'הכוח על הטיפה כשהבלון רחוק', 2, 'N', -5, { sci: true }),
      datum('rFar', 'מרחק כשהבלון רחוק', 0.06, 'm', 0),
      datum('rNear', 'מרחק כשהבלון קרוב', 0.02, 'm', 0),
    ],
    compute: v => v.F1 * (v.rFar / v.rNear) ** 2,
    traps: [
      { f: v => v.F1 * (v.rFar / v.rNear), msg: 'הכוח גדל פי 3 בלבד. הכוח הפוך ל-r², לכן צריך לרבע את יחס המרחקים (פי 9).' },
      { f: v => v.F1 / (v.rFar / v.rNear) ** 2, msg: 'הפכתם את היחס. כשהבלון מתקרב הכוח גדל, הוא לא קטן.' },
      { f: v => v.F1 / (v.rFar / v.rNear), msg: 'חילקתם ב-3. כשהבלון מתקרב הכוח גדל (ובריבוע), הוא לא קטן.' },
    ],
    hints: [
      'בחוק קולון הכוח הפוך ל-r² (F ∝ 1/r²). המטענים לא השתנו, לכן הכוח משתנה רק בגלל המרחק.',
      'בכמה קטן המרחק? מ-0.06 m ל-0.02 m, כלומר פי 3. הכוח משתנה בריבוע של היחס הזה, ובכיוון ההפוך: קרוב יותר = חזק יותר.',
      'F₂ = F₁ · (r₁ / r₂)². המרחקים באותה יחידה, והתוצאה באותה יחידה כמו F₁.',
    ],
    success: () => forcePair('balloon_slides_near_stream_bends'),
  },
  // 4 - water_balloon: שדה חשמלי E = k|Q|/r², ב-SI (N/C). אין חץ כוח - קווי שדה בהצלחה.
  {
    scene: 'water_balloon', title: 'שדה חשמלי ליד זרם מים', desc: DESC_WATER + NOTE_C0,
    story: 'בלון טעון עומד ליד זרם מים.',
    ask: 'מהו גודל השדה החשמלי של הבלון במקום שבו עובר הזרם?',
    unit: 'N/C', signed: false, unknown: 'field', source: BALLOON, target: DROP_PLUS, consts: ['k'],
    data: [
      datum('Q', 'מטען הבלון Q', -2.5, 'C', -8, { sci: true }),
      datum('r', 'מרחק מהזרם r', 0.05, 'm', 0),
    ],
    compute: v => electricField(v.Q, v.r),
    traps: [
      { f: v => KC * Math.abs(v.Q) / v.r, msg: 'שכחתם לרבע את r. בנוסחת השדה המרחק בריבוע.' },
      { f: v => electricField(v.Q, v.r) / 1e9, msg: 'k הוא 9×10⁹ ולא 9. שכחתם את החזקה של הקבוע.' },
    ],
    hints: [
      'שדה חשמלי של מטען נקודתי: E = k·|Q| / r², עם k = 9×10⁹. מחשבים גודל, בלי הסימן של Q. (בהמשך נשתמש בו: הכוח על מטען q בשדה E הוא F = q·E.)',
      'Q בקולון ו-r במטרים. שימו לב: r מופיע בריבוע.',
      'בדקו בדרך: k·|Q| = 225 ו-r² = 2.5×10⁻³. התוצאה ב-N/C.',
    ],
    success: () => ({ anim: 'field_lines_stream_bends_slightly', arrows: [], fieldLines: true, deflectionDeg: null }),
  },
  // 5 - balloon_wall (טלאי שיער): Q = N·e. הכול ב-SI (Q בקולון), התשובה מספר טהור בכתיב מדעי.
  {
    scene: 'balloon_wall', variant: 'hair_patch', title: 'ספירת אלקטרונים בבלון',
    desc: 'בחיכוך עוברים אלקטרונים מהשיער אל הבלון, והבלון נטען שלילית. המטען הכולל שווה למספר האלקטרונים כפול מטען של אלקטרון אחד.' + NOTE_C0,
    story: 'בלון נחכך בשיער ולקח ממנו אלקטרונים.',
    ask: 'כמה אלקטרונים עברו מהשיער אל הבלון?',
    unit: 'אלקטרונים', signed: false, unknown: 'electron_count', source: BALLOON, target: null,
    show: { r: false, hairPatch: true },
    data: [
      datum('Q', 'מטען הבלון Q', -3.2, 'C', -8, { sci: true }),
      datum('e', 'גודל מטען האלקטרון e', 1.6, 'C', -19, { sci: true }),
    ],
    // e נלקח משורת הנתון עצמה (אותו ערך שהתלמיד רואה) - אין קבוע כפול.
    compute: v => Math.abs(v.Q) / v.e,
    traps: [
      { f: v => Math.abs(v.Q) / 1.6, msg: 'שכחתם את החזקה של e. e הוא 1.6×10⁻¹⁹ C ולא 1.6.' },
      { f: v => Math.abs(v.Q) / v.e / 10, msg: 'טעות של פי 10 בחזקות. בדקו שוב את החילוק 10⁻⁸ / 10⁻¹⁹.' },
      { f: v => Math.abs(v.Q) / v.e * 1000, msg: 'טעות של פי 1000 בחזקות. בדקו שוב את החילוק 10⁻⁸ / 10⁻¹⁹: מחסרים חזקות.' },
    ],
    hints: [
      'המטען הכולל הוא מספר האלקטרונים כפול מטען של אלקטרון אחד: |Q| = N·e. לכן N = |Q| / e.',
      'משתמשים בגודל המטען, בלי הסימן: |Q| = 3.2×10⁻⁸ C.',
      'חלקו |Q| ב-e ובדקו את החזקות: 10⁻⁸ / 10⁻¹⁹ = 10¹¹. את התוצאה מקלידים בכתיב מדעי, למשל 5e9.',
    ],
    success: () => ({ anim: 'electrons_hop_to_balloon', arrows: [], fieldLines: false, deflectionDeg: null }),
  },
  // ===== שלבים 6-8: המרת יחידות לנתון אחד בכל פעם: Q, אחר כך r, אחר כך q (שאר הנתונים והתשובה ב-SI) =====
  // 6 - balloon_wall: המטען Q נתון ב-nC (נתון אחד להמרה). תשובה חתומה (משיכה), בניוטון.
  {
    scene: 'balloon_wall', title: 'בלון ליד קיר', desc: DESC_WALL_SETUP + NOTE_D1,
    story: 'בלון שחיככו בשיער ליד קיר.',
    ask: `מהו הכוח בין הבלון לקיר? ${SIGN_NOTE}`,
    unit: 'N', signed: true, unknown: 'force', source: BALLOON, target: WALL_NEAR_PLUS, consts: ['k'],
    data: [
      datum('Q', 'מטען הבלון Q', -50, 'nC', -9),
      datum('q', 'מטען בקיר מול הבלון q', 2, 'C', -9, { sci: true, sign: true }),
      datum('r', 'מרחק r', 0.03, 'm', 0),
    ],
    compute: v => coulombForceSigned(v.Q, v.q, v.r),
    traps: [
      { f: (v, a) => -a, msg: 'הסימן נשמט. בלון שלילי ומטען חיובי בקיר מושכים זה את זה, ולכן הכוח שלילי.' },
      { f: v => coulombForceSigned(v.Q / NC, v.q, v.r), msg: 'Q נשאר ב-nC. המירו ל-C (1 nC = 10⁻⁹ C) לפני ההצבה.' },
      { f: v => coulombForceSigned(v.Q / NC * UN, v.q, v.r), msg: 'המרת nC שגויה. 1 nC = 10⁻⁹ C ולא 10⁻⁶ C.' },
      { f: v => KC * v.Q * v.q / v.r, msg: 'שכחתם לרבע את r. בחוק קולון המרחק בריבוע.' },
    ],
    hints: [
      'חוק קולון: F = k·Q·q / r². רק Q נתון ב-nC: ממירים רק אותו ל-C לפני ההצבה.',
      '1 nC = 10⁻⁹ C, לכן Q = −50×10⁻⁹ C = −5×10⁻⁸ C. שאר הנתונים כבר ב-SI, והתוצאה בניוטון.',
      'בדקו בדרך: k·Q·q = −9×10⁻⁷ ו-r² = 9×10⁻⁴. התוצאה בניוטון, בלי המרה נוספת.',
    ],
    success: () => forcePair('balloon_slides_to_wall'),
  },
  // 7 - ruler_paper: המרחק r נתון ב-cm (נתון אחד להמרה). תשובה חתומה (משיכה), בניוטון.
  {
    scene: 'ruler_paper', title: 'סרגל קרוב לנייר', desc: DESC_RULER_SETUP + NOTE_D1,
    story: 'סרגל טעון קרוב מאוד לפיסת נייר.',
    ask: `מהו הכוח החשמלי שפועל על הנייר? ${SIGN_NOTE}`,
    unit: 'N', signed: true, unknown: 'force', source: RULER, target: PAPER_NEAR_PLUS, consts: ['k'],
    data: [
      datum('Q', 'מטען הסרגל Q', -1, 'C', -8, { sci: true }),
      datum('q', 'מטען בצד הקרוב של הנייר q', 3, 'C', -9, { sci: true, sign: true }),
      datum('r', 'מרחק r', 3, 'cm', -2),
    ],
    compute: v => coulombForceSigned(v.Q, v.q, v.r),
    traps: [
      { f: (v, a) => -a, msg: 'הסימן נשמט. סרגל שלילי ומטען חיובי בצד הקרוב של הנייר הם מטענים מנוגדים, ולכן משיכה (שלילי).' },
      { f: v => coulombForceSigned(v.Q, v.q, v.r / CM), msg: 'r נשאר בס"מ. המירו ס"מ למטרים (1 cm = 10⁻² m) לפני ההצבה.' },
      { f: v => coulombForceSigned(v.Q, v.q, v.r / CM * MM), msg: 'המרת ס"מ למטרים שגויה. 1 cm = 10⁻² m ולא 10⁻³ m.' },
      { f: v => KC * v.Q * v.q / v.r, msg: 'שכחתם לרבע את r. בחוק קולון המרחק בריבוע.' },
    ],
    hints: [
      'חוק קולון: F = k·Q·q / r². רק המרחק נתון בסנטימטרים: ממירים רק אותו למטרים לפני ההצבה.',
      '1 cm = 10⁻² m, לכן r = 3 cm = 0.03 m. המטענים כבר ב-C, והתוצאה בניוטון.',
      'בדקו בדרך: k·Q·q = −2.7×10⁻⁷ ו-r² = 9×10⁻⁴. התוצאה בניוטון, בלי המרה נוספת.',
    ],
    success: () => forcePair('paper_jumps_to_ruler'),
  },
  // 8 - ruler_paper (אחרי מגע): המטען q נתון ב-nC (נתון אחד להמרה). דחייה, בניוטון.
  {
    scene: 'ruler_paper', variant: 'touched', title: 'נייר טעון ליד הסרגל',
    desc: 'כשהנייר נוגע בסרגל עוברים אליו אלקטרונים, והוא נטען מאותו סוג של מטען כמו הסרגל. נתייחס אליהם כשני מטענים נקודתיים במרחק r.' + NOTE_D1,
    story: 'פיסת נייר שנגעה בסרגל מוחזקת במרחק קטן ממנו.',
    ask: `מהו הכוח הפועל על הנייר? ${SIGN_NOTE}`,
    unit: 'N', signed: true, unknown: 'force', source: RULER, target: PAPER_TOUCHED, consts: ['k'],
    data: [
      datum('Q', 'מטען הסרגל Q', -3, 'C', -8, { sci: true }),
      datum('q', 'מטען הנייר אחרי המגע q', -2, 'nC', -9),
      datum('r', 'מרחק r', 0.03, 'm', 0),
    ],
    compute: v => coulombForceSigned(v.Q, v.q, v.r),
    traps: [
      { f: (v, a) => -a, msg: 'שני המטענים שליליים, ומטענים באותו סימן דוחים זה את זה. הכוח חיובי.' },
      { f: v => coulombForceSigned(v.Q, v.q / NC, v.r), msg: 'q נשאר ב-nC. המירו ל-C (1 nC = 10⁻⁹ C) לפני ההצבה.' },
      { f: v => coulombForceSigned(v.Q, v.q / NC * UN, v.r), msg: 'המרת nC שגויה. 1 nC = 10⁻⁹ C ולא 10⁻⁶ C.' },
      { f: v => KC * v.Q * v.q / v.r, msg: 'שכחתם לרבע את r. בחוק קולון המרחק בריבוע.' },
    ],
    hints: [
      'חוק קולון: F = k·Q·q / r². רק המטען q של הנייר נתון ב-nC: ממירים רק אותו ל-C לפני ההצבה.',
      '1 nC = 10⁻⁹ C, לכן q = −2×10⁻⁹ C. שני המטענים שליליים, ולכן מכפלתם חיובית: דחייה.',
      'בדקו בדרך: k·Q·q = +5.4×10⁻⁷ ו-r² = 9×10⁻⁴. התוצאה בניוטון.',
    ],
    success: () => forcePair('paper_thrown_away'),
  },
  // ===== שלבים 9-10: המרת יחידות לתשובה (כל הנתונים ב-SI, התשובה ביחידה אחרת) =====
  // 9 - balloon_wall: כל הנתונים ב-SI, התשובה ב-mN. תשובה חתומה (משיכה).
  {
    scene: 'balloon_wall', title: 'בלון על הקיר', desc: DESC_WALL_SETUP + NOTE_A,
    story: 'בלון שחיככו בשיער צמוד כמעט לקיר.',
    ask: `מהו הכוח שהקיר מפעיל על הבלון? ${SIGN_NOTE}`,
    unit: 'mN', signed: true, unknown: 'force', source: BALLOON, target: WALL_NEAR_PLUS, consts: ['k'],
    data: [
      datum('Q', 'מטען הבלון Q', -5, 'C', -8, { sci: true }),
      datum('q', 'מטען בקיר מול הבלון q', 3, 'C', -9, { sci: true, sign: true }),
      datum('r', 'מרחק r', 0.03, 'm', 0),
    ],
    compute: v => coulombForceSigned(v.Q, v.q, v.r) / MN,
    traps: [
      { f: v => coulombForceSigned(v.Q, v.q, v.r), msg: 'החישוב נכון, אבל התוצאה נשארה בניוטון. התבקשה תשובה ב-mN (כפלו ב-1000).' },
      { f: v => coulombForceSigned(v.Q, v.q, v.r) * MN, msg: 'המרה בכיוון ההפוך. מ-N ל-mN מכפילים ב-1000, לא מחלקים.' },
      { f: v => coulombForceSigned(v.Q, v.q, v.r) / UN, msg: 'המרת mN שגויה. 1 mN = 10⁻³ N (לא 10⁻⁶).' },
      { f: (v, a) => -a, msg: 'הסימן נשמט. בלון שלילי ומטען חיובי בקיר מושכים זה את זה, ולכן הכוח שלילי.' },
    ],
    hints: [
      'חוק קולון: F = k·Q·q / r². מחשבים קודם בניוטון, עם הסימנים של המטענים.',
      'התשובה מבוקשת ב-mN: ממירים את התוצאה בסוף. 1 mN = 10⁻³ N, ולכן מכפילים ב-1000.',
      'בדקו בדרך: k·Q·q = −1.35×10⁻⁶ ו-r² = 9×10⁻⁴. התוצאה בניוטון צריכה להיות בסדר גודל של 10⁻³.',
    ],
    success: () => forcePair('balloon_slides_to_wall'),
  },
  // 10 - water_balloon: שדה חשמלי; כל הנתונים ב-SI, התשובה ב-kN/C. אין חץ כוח - קווי שדה בהצלחה.
  {
    scene: 'water_balloon', title: 'שדה הבלון בזרם המים', desc: DESC_WATER + NOTE_A,
    story: 'בלון שחיככו בשיער מוצב ליד זרם מים.',
    ask: 'מהו גודל השדה החשמלי בנקודה שבה עובר הזרם?',
    unit: 'kN/C', signed: false, unknown: 'field', source: BALLOON, target: DROP_PLUS, consts: ['k'],
    data: [
      datum('Q', 'מטען הבלון Q', -4, 'C', -8, { sci: true }),
      datum('r', 'מרחק מהזרם r', 0.06, 'm', 0),
    ],
    compute: v => electricField(v.Q, v.r) / KILO,
    traps: [
      { f: v => electricField(v.Q, v.r), msg: 'החישוב נכון, אבל התוצאה ב-N/C. התבקשה תשובה ב-kN/C (חלקו ב-1000).' },
      { f: v => electricField(v.Q, v.r) * KILO, msg: 'המרה בכיוון ההפוך. מ-N/C ל-kN/C מחלקים ב-1000, לא מכפילים.' },
      { f: v => KC * Math.abs(v.Q) / v.r / KILO, msg: 'שכחתם לרבע את r. בנוסחת השדה המרחק בריבוע.' },
    ],
    hints: [
      'שדה חשמלי של מטען נקודתי: E = k·|Q| / r², עם k = 9×10⁹. התוצאה יוצאת ב-N/C.',
      'התשובה מבוקשת ב-kN/C: מחלקים את התוצאה ב-N/C ב-1000 (1 kN/C = 10³ N/C).',
      'בדקו בדרך: k·|Q| = 360 ו-r² = 3.6×10⁻³. התוצאה ב-N/C בסדר גודל של 10⁵.',
    ],
    success: () => ({ anim: 'field_lines_stream_bends_slightly', arrows: [], fieldLines: true, deflectionDeg: null }),
  },
  // ===== שלבים 11-16: המרת יחידות לכמה נתונים: קודם שניים (תשובה ב-SI), אחר כך שלושה ותשובה, ואז המיומנויות הקשות =====
  // 11 - ruler_paper: שני נתונים להמרה (Q ב-nC, r ב-cm), q ב-SI, התשובה בניוטון. משיכה.
  {
    scene: 'ruler_paper', title: 'סרגל מעל נייר בקרבה', desc: DESC_RULER_SETUP + NOTE_DM,
    story: 'סרגל שחיככו בצמר נמצא קרוב לפיסת נייר.',
    ask: `מהו הכוח בין הסרגל לנייר? ${SIGN_NOTE}`,
    unit: 'N', signed: true, unknown: 'force', source: RULER, target: PAPER_NEAR_PLUS, consts: ['k'],
    data: [
      datum('Q', 'מטען הסרגל Q', -40, 'nC', -9),
      datum('q', 'מטען בצד הקרוב של הנייר q', 2, 'C', -8, { sci: true, sign: true }),
      datum('r', 'מרחק r', 6, 'cm', -2),
    ],
    compute: v => coulombForceSigned(v.Q, v.q, v.r),
    traps: [
      { f: (v, a) => -a, msg: 'הסימן נשמט. סרגל שלילי ומטען חיובי בצד הקרוב של הנייר הם מטענים מנוגדים, ולכן משיכה (שלילי).' },
      { f: v => coulombForceSigned(v.Q / NC, v.q, v.r), msg: 'Q נשאר ב-nC. המירו ל-C (1 nC = 10⁻⁹ C) לפני ההצבה.' },
      { f: v => coulombForceSigned(v.Q, v.q, v.r / CM), msg: 'r נשאר בס"מ. המירו ס"מ למטרים (1 cm = 10⁻² m) לפני ההצבה.' },
      { f: v => KC * v.Q * v.q / v.r, msg: 'שכחתם לרבע את r. בחוק קולון המרחק בריבוע.' },
    ],
    hints: [
      'חוק קולון: F = k·Q·q / r². שני נתונים צריכים המרה ל-SI לפני ההצבה: המטען Q והמרחק r. המטען q כבר ב-C.',
      '1 nC = 10⁻⁹ C ו-1 cm = 10⁻² m, לכן Q = −40×10⁻⁹ C = −4×10⁻⁸ C ו-r = 0.06 m.',
      'בדקו בדרך: k·Q·q = −7.2×10⁻⁶ ו-r² = 3.6×10⁻³. התוצאה בניוטון.',
    ],
    success: () => forcePair('paper_jumps_to_ruler'),
  },
  // 12 - balloon_wall: Q ב-nC, q ב-nC, r ב-cm, התשובה ב-mN (משיכה).
  {
    scene: 'balloon_wall', title: 'בלון קרוב לקיר', desc: DESC_WALL_SETUP + NOTE_DM,
    story: 'בלון טעון עומד קרוב מאוד לקיר.',
    ask: `מהו הכוח ההדדי בין הבלון לקיר? ${SIGN_NOTE}`,
    unit: 'mN', signed: true, unknown: 'force', source: BALLOON, target: WALL_NEAR_PLUS, consts: ['k'],
    data: [
      datum('Q', 'מטען הבלון Q', -30, 'nC', -9),
      datum('q', 'מטען בקיר מול הבלון q', 4, 'nC', -9, { sign: true }),
      datum('r', 'מרחק r', 2, 'cm', -2),
    ],
    compute: v => coulombForceSigned(v.Q, v.q, v.r) / MN,
    traps: [
      { f: (v, a) => -a, msg: 'הסימן נשמט. בלון שלילי ומטען חיובי בקיר מושכים זה את זה, ולכן הכוח שלילי.' },
      { f: v => KC * v.Q * v.q / v.r / MN, msg: 'שכחתם לרבע את r. בחוק קולון המרחק בריבוע.' },
      { f: v => coulombForceSigned(v.Q, v.q, v.r / CM) / MN, msg: 'r נשאר בס"מ. המירו ס"מ למטרים (×10⁻²) לפני ההצבה.' },
      { f: v => coulombForceSigned(v.Q, v.q, v.r), msg: 'החישוב נכון, אבל התוצאה נשארה בניוטון. כפלו ב-1000 כדי לקבל mN.' },
      { f: v => coulombForceSigned(v.Q / NC, v.q / NC, v.r) / MN, msg: 'Q ו-q נשארו ב-nC. המירו ל-C (1 nC = 10⁻⁹ C) לפני ההצבה.' },
    ],
    hints: [
      'המירו ל-SI לפני ההצבה: 1 nC = 10⁻⁹ C ו-1 cm = 10⁻² m.',
      'F = k·Q·q / r² עם הסימנים של המטענים. מטענים מנוגדים נותנים כוח שלילי (משיכה).',
      'אחרי ההמרה: Q = −3×10⁻⁸ C, q = 4×10⁻⁹ C, r = 0.02 m. בדקו בדרך: k·Q·q = −1.08×10⁻⁶. התוצאה בניוטון, כפלו ב-1000 כדי לקבל mN.',
    ],
    success: () => forcePair('balloon_slides_to_wall'),
  },
  // 13 - ruler_paper: בידוד Q מחוק קולון (המרות μN, nC, cm: כמה נתונים + תשובה). גודל חיובי.
  {
    scene: 'ruler_paper', title: 'כמה טעון הסרגל?', desc: DESC_RULER + NOTE_DM,
    story: 'נמדד הכוח בין סרגל טעון לפיסת נייר.',
    ask: 'מהו גודל המטען של הסרגל?',
    unit: 'nC', signed: false, unknown: 'source_charge', source: RULER, target: PAPER_NEAR_PLUS, consts: ['k'],
    data: [
      datum('F', 'הכוח שנמדד על הנייר F', 900, 'μN', -6),
      datum('q', 'מטען בצד הקרוב של הנייר q', 1, 'nC', -9, { sign: true }),
      datum('r', 'מרחק r', 2, 'cm', -2),
    ],
    compute: v => v.F * v.r ** 2 / (KC * v.q) / NC,
    traps: [
      { f: v => v.F * v.r / (KC * v.q) / NC, msg: 'שכחתם לרבע את r. בנוסחה מופיע r² ולא r.' },
      { f: v => (v.F / UN * MN) * v.r ** 2 / (KC * v.q) / NC, msg: 'המרת μN שגויה. 1 μN = 10⁻⁶ N (לא 10⁻³).' },
      { f: v => v.F * (v.r / CM) ** 2 / (KC * v.q) / NC, msg: 'r נשאר בס"מ. המירו למטרים (×10⁻²) לפני ההצבה.' },
      { f: v => v.F * v.r ** 2 / (KC * v.q), msg: 'התוצאה בקולון. התבקשה תשובה ב-nC, לכן כפלו ב-10⁹.' },
    ],
    hints: [
      'הפכו את חוק קולון כדי לבודד את Q: Q = F·r² / (k·q).',
      'המירו ל-SI: μN → N (×10⁻⁶), nC → C (×10⁻⁹), cm → m (×10⁻²). הציבו גדלים בלבד, בלי סימנים.',
      'בדקו בדרך: F·r² = 3.6×10⁻⁷ ו-k·q = 9. את התוצאה בקולון כפלו ב-10⁹ כדי לקבל nC.',
    ],
    success: () => forcePair('paper_leaps_to_ruler'),
  },
  // 14 - balloon_wall: בידוד r מחוק קולון (שורש ריבועי, המרת mN). distanceForForce מהמנוע.
  {
    scene: 'balloon_wall', title: 'כמה רחוק הבלון מהקיר?', desc: DESC_WALL + NOTE_DM,
    story: 'מכשיר מודד את הכוח בין הבלון לקיר.',
    ask: 'מהו המרחק r בין הבלון לקיר?',
    unit: 'cm', signed: false, unknown: 'distance', source: BALLOON, target: WALL_NEAR_PLUS, consts: ['k'],
    data: [
      datum('Q', 'מטען הבלון Q', -20, 'nC', -9),
      datum('q', 'מטען בקיר מול הבלון q', 8, 'nC', -9, { sign: true }),
      datum('F', 'הכוח שנמדד F', 0.9, 'mN', -3),
    ],
    compute: v => distanceForForce(v.Q, v.q, v.F) / CM,
    traps: [
      { f: v => KC * Math.abs(v.Q * v.q) / v.F / CM, msg: 'שכחתם להוציא שורש. חישבתם r² ולא r.' },
      { f: v => KC * Math.abs(v.Q * v.q) / v.F / CM ** 2, msg: 'שכחתם להוציא שורש. חישבתם r² (ב-cm²) ולא r.' },
      { f: v => KC * Math.abs(v.Q * v.q) / v.F, msg: 'חישבתם r² במטרים רבועים ושכחתם שורש. הוציאו שורש כדי לקבל את r.' },
      { f: v => distanceForForce(v.Q, v.q, v.F), msg: 'המרחק יצא נכון, אבל במטרים. התבקשה תשובה בס"מ (כפלו ב-100).' },
      { f: v => distanceForForce(v.Q, v.q, v.F / MN) / CM, msg: 'המרת mN שגויה. 0.9 mN = 9×10⁻⁴ N ולא 0.9 N.' },
    ],
    hints: [
      'בודדו את r² מחוק קולון: r² = k·|Q|·q / F, ורק בסוף קחו שורש.',
      'הציבו גדלים בלבד, ביחידות SI: mN → N (×10⁻³) ו-nC → C (×10⁻⁹).',
      'בדקו בדרך: k·|Q|·q = 1.44×10⁻⁶ ו-F = 9×10⁻⁴ N. אחרי השורש תקבלו r במטרים. כפלו ב-100 כדי לקבל cm.',
    ],
    success: () => forcePair('balloon_slides_to_wall_r_blinks'),
  },
  // 15 - ruler_paper: תנאי הרמה גבולי F = W (מיליגרם, nC, cm: כמה נתונים). גודל חיובי.
  {
    scene: 'ruler_paper', title: 'הרמת פיסת נייר', desc: `${DESC_RULER} מטען הנייר q נתון וקבוע, ורק מטען הסרגל משתנה.${NOTE_DM}`,
    story: 'הסרגל מנסה להרים פיסת נייר קלה.',
    ask: 'מהו הגודל המינימלי של מטען הסרגל שמצליח להרים את הנייר?',
    unit: 'nC', signed: false, unknown: 'min_source_charge', source: RULER, target: PAPER_NEAR_PLUS, consts: ['k', 'g'],
    data: [
      datum('m', 'מסת הנייר m', 5, 'מיליגרם', -6),
      datum('q', 'מטען בצד הקרוב של הנייר q', 0.5, 'nC', -9, { sign: true }),
      datum('r', 'מרחק r', 3, 'cm', -2),
    ],
    // F = W = m·g  =>  k·Q·q / r² = m·g  =>  Q = m·g·r² / (k·q)
    compute: v => v.m * G * v.r ** 2 / (KC * v.q) / NC,
    traps: [
      { f: v => v.m * v.r ** 2 / (KC * v.q) / NC, msg: 'שכחתם להכפיל ב-g. המשקל הוא W = m·g ולא m בלבד.' },
      { f: v => v.m * G * v.r / (KC * v.q) / NC, msg: 'שכחתם לרבע את r. בנוסחה מופיע r² ולא r.' },
      { f: v => (v.m * KILO) * G * v.r ** 2 / (KC * v.q) / NC, msg: 'המסה נתונה במיליגרם: 1 מיליגרם = 10⁻⁶ kg (לא גרם). המסה היא 5×10⁻⁶ kg.' },
      { f: v => v.m * G * v.r ** 2 / (KC * v.q), msg: 'התוצאה בקולון. התבקשה תשובה ב-nC, לכן כפלו ב-10⁹.' },
    ],
    hints: [
      'הנייר מתרומם כשהכוח החשמלי לפחות כמשקלו. המטען המינימלי מתקבל כשהכוחות שווים: F = W.',
      'W = m·g, עם g = 10 m/s². שימו לב: המסה נתונה במיליגרם. 1 מיליגרם = 10⁻⁶ kg.',
      'בדקו בדרך: W = 5×10⁻⁵ N. מתוך k·|Q|·q / r² = W בודדים |Q| = W·r² / (k·q). את התוצאה בקולון כפלו ב-10⁹ כדי לקבל nC.',
    ],
    success: () => ({
      anim: 'paper_hangs_in_equilibrium', fieldLines: false, deflectionDeg: null,
      arrows: [{ kind: 'force', lengthRel: 1 }, { kind: 'weight', lengthRel: 1 }], // F = W: אורכים שווים
    }),
  },
  // 16 - water_balloon: שרשרת של שלושה צעדים: E, אחר כך F = q·E, אחר כך F / W.
  {
    scene: 'water_balloon', title: 'טיפה בשדה הבלון', desc: DESC_WATER + NOTE_DM_PURE,
    story: 'שדה הבלון מסיט טיפה מזרם המים.',
    ask: 'פי כמה גדול הכוח החשמלי על הטיפה ממשקל הטיפה?',
    unit: ' פעמים', signed: false, unknown: 'force_over_weight', source: BALLOON, target: DROP_PLUS, consts: ['k', 'g'],
    data: [
      datum('Q', 'מטען הבלון Q', -40, 'nC', -9),
      datum('r', 'מרחק הטיפה מהבלון r', 6, 'cm', -2),
      datum('q', 'מטען הטיפה q', 0.2, 'nC', -9, { sign: true }),
      datum('m', 'מסת הטיפה m', 1, 'מיליגרם', -6),
    ],
    compute: v => (v.q * electricField(v.Q, v.r)) / (v.m * G),
    traps: [
      { f: v => (v.q * electricField(v.Q, v.r)) / v.m, msg: 'שכחתם g. המשקל הוא W = m·g ולא m בלבד.' },
      { f: v => (v.m * G) / (v.q * electricField(v.Q, v.r)), msg: 'היחס הפוך. חילקתם משקל בכוח, והשאלה היא כוח חלקי משקל.' },
      { f: v => (v.q * KC * Math.abs(v.Q) / v.r) / (v.m * G), msg: 'שכחתם לרבע את r בחישוב השדה.' },
      { f: v => (v.q * electricField(v.Q, v.r)) / ((v.m * KILO) * G), msg: 'המסה נתונה במיליגרם: 1 מיליגרם = 10⁻⁶ kg. המסה היא 10⁻⁶ kg ולא 10⁻³ kg.' },
    ],
    hints: [
      'שלושה צעדים: (1) השדה של הבלון בטיפה, E = k·|Q| / r². (2) הכוח על הטיפה, F = q·E. (3) המשקל W = m·g, ואז מחלקים כוח במשקל.',
      'המירו ל-SI: nC → C (×10⁻⁹), cm → m (×10⁻²), מיליגרם → kg (1 מיליגרם = 10⁻⁶ kg). E מחושב עם Q של הבלון, ו-F עם q של הטיפה.',
      'בדיקת סדרי גודל בדרך: E אמור לצאת בסדר גודל של 10⁵ N/C, ו-W בסדר גודל של 10⁻⁵ N. שניהם בניוטון לפני החילוק.',
    ],
    // הטיפה נתונה לכוח חשמלי אופקי F ולמשקל W כלפי מטה: הסטייה מהאנכי = arctan(F/W).
    success: (v, answer) => ({
      anim: 'stream_bends_sharply', fieldLines: true,
      deflectionDeg: Math.round(Math.atan(answer) * 180 / Math.PI * 10) / 10,
      arrows: [{ kind: 'weight', lengthRel: 1 }, { kind: 'force', lengthRel: answer }],
    }),
  },
];

// ---------------------------------------------------------- בניית ה-level
const cache = new Map();

function interactionOf(source, target) {
  if (!target) return null;
  return source.sign * target.sign > 0 ? 'repel' : 'attract';
}

export function generateStaticChargeLevel(localId) {
  if (cache.has(localId)) return cache.get(localId);
  const def = LEVEL_DEFS[localId - 1];
  if (!def) throw new RangeError(`staticCharge: שלב לא קיים (${localId})`);

  const v = {};
  def.data.forEach(d => { v[d.key] = d.si; });
  const answer = sig(def.compute(v));
  const traps = def.traps.map(t => ({ value: sig(t.f(v, answer)), message: t.msg }));

  const world = {
    scene: def.scene, variant: def.variant || 'basic',
    source: def.source, target: def.target,
    interaction: interactionOf(def.source, def.target),
    unknown: def.unknown, signed: !!def.signed,
    show: { r: true, rPrime: false, hairPatch: false, ...(def.show || {}) },
    geometry: def.geometry ? def.geometry(v) : null,
    success: def.success(v, answer),
  };

  const level = {
    id: localId, title: def.title, description: def.desc,
    world,
    question: {
      prompt: `${def.story}<br>${def.ask}`,
      data: [
        ...def.data.map(({ label, value }) => ({ label, value })),
        ...(def.consts || []).map(c => ({ ...CONST_ROWS[c] })),
      ],
      unit: def.unit, answer, hints: def.hints, traps,
    },
  };
  cache.set(localId, level);
  return level;
}

export function topicLevelCount() { return LEVEL_DEFS.length; }

// ---------------------------------------------------------------- הערכת תשובה
const GENERIC_MSG = 'לא מדויק. בדקו את ההצבה בנוסחה, את החזקות ואת היחידות, ונסו שוב.';
const SIGN_MSG = 'הגודל נכון אבל הסימן הפוך. מטענים מנוגדים נמשכים (שלילי), מטענים באותו סימן נדחים (חיובי).';

const MAGNITUDE_MSG = 'התבקש גודל, ולכן התשובה חיובית. הערך שלכם נכון, בלי המינוס.';

export function evaluateStaticChargeAnswer(level, val) {
  const q = level.question;
  const pct = CONFIG.ANSWER_TOLERANCE_PCT;
  const near = (x, target) => Math.abs(x - target) <= Math.abs(target) * pct;

  if (near(val, q.answer)) return { outcome: 'correct', value: val };
  const trap = q.traps.find(t => near(val, t.value));
  if (trap) return { outcome: 'incorrect', value: val, message: trap.message };
  if (level.world.signed && val !== 0 && near(val, -q.answer)) {
    return { outcome: 'incorrect', value: val, message: SIGN_MSG };
  }
  if (!level.world.signed && val !== 0 && near(val, -q.answer)) {
    return { outcome: 'incorrect', value: val, message: MAGNITUDE_MSG };
  }
  return { outcome: 'incorrect', value: val, message: GENERIC_MSG };
}
