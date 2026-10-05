// ==========================================================================
// staticChargeLevelGenerator.js - "מטען, כוח ושדה חשמלי" (פרק 1): 10 שלבים
// בנוסח ניסויי חשמל סטטי פשוטים (סרגל ונייר, בלון וקיר, בלון וזרם מים).
// מחליף את הדמיית החללית והאסטרואידים הקודמת.
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
//            | 'touched'        // שלב 3: פיסת הנייר נגעה בסרגל - סימני − על הנייר
//            | 'hair_patch'     // שלב 5: טלאי שיער קטן עם סימני + בפינה
//            | 'two_distances', // שלב 4: בלון מלא רחוק (r) + בלון רפאים קרוב (r')
//     source:  { kind: 'ruler' | 'balloon', sign: -1 },   // הגוף הטעון (תמיד שלילי)
//     target:  { kind: 'paper' | 'wall' | 'drop', sign: +1 | -1 } | null,
//              // sign = סימן המטען בצד הקרוב של המטרה (נייר/קיר/טיפה).
//              // null בשלב 5 (אין זוג גופים - יש רק טלאי שיער).
//     interaction: 'attract' | 'repel' | null, // נגזר מסימני source/target; null כש-target=null
//     unknown: 'force' | 'force_new_distance' | 'electron_count' | 'field'
//            | 'source_charge' | 'distance' | 'min_source_charge' | 'force_over_weight',
//     signed:  boolean,         // true = התשובה חתומה (חיובי=דחייה, שלילי=משיכה): שלבים 1-3
//     show: { r: boolean,       // האם מצוייר סמן המרחק r (שלב 5: false)
//             rPrime: boolean,  // שלב 4 בלבד: סמן r' + בלון רפאים
//             hairPatch: boolean },
//     geometry: { rFarRel: 1, rNearRel: number } | null, // שלב 4: יחס מרחקים לציור (קרוב/רחוק = 1/3)
//     success: {                // מה להציג רק ב-render(level, true)
//       anim: string,           // שם האנימציה (ראו successAnim בכל שלב)
//       arrows: [{ kind: 'force' | 'weight', lengthRel: number }], // חצי כוח/משקל (אורך יחסי)
//       fieldLines: boolean,    // קווי שדה מקווקווים (שלבים 6, 10)
//       deflectionDeg: number | null, // שלב 10: סטיית הזרם מהאנכי (מעלות)
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
const NC = 1e-9, MM = 1e-3, MG = 1e-6 /* mg → kg */, MN = 1e-3, UN = 1e-6, BILLION = 1e9, KILO = 1e3;

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

const forcePair = (anim, extra = {}) => ({ anim, arrows: [{ kind: 'force', lengthRel: 1 }], fieldLines: false, deflectionDeg: null, ...extra });

const LEVEL_DEFS = [
  // 1 - ruler_paper: הצבה ישירה בחוק קולון, הכול כבר ב-SI. תשובה חתומה (משיכה).
  {
    scene: 'ruler_paper', title: 'סרגל ופיסת נייר', desc: DESC_RULER_SETUP,
    story: 'סרגל שחיככו בצמר מעל פיסת נייר.',
    ask: `מהו הכוח בין הסרגל לנייר? ${SIGN_NOTE}`,
    unit: 'mN', signed: true, unknown: 'force', source: RULER, target: PAPER_NEAR_PLUS, consts: ['k'],
    data: [
      datum('Q', 'מטען הסרגל Q', -2, 'C', -8, { sci: true }),
      datum('q', 'מטען בצד הקרוב של הנייר q', 2, 'C', -9, { sci: true, sign: true }),
      datum('r', 'מרחק r', 0.03, 'm', 0),
    ],
    compute: v => coulombForceSigned(v.Q, v.q, v.r) / MN,
    traps: [
      { f: (v, a) => -a, msg: 'הסימן נשמט. סרגל שלילי ומטען חיובי בצד הקרוב של הנייר הם מטענים מנוגדים, ולכן משיכה (שלילי).' },
      { f: v => KC * v.Q * v.q / v.r / MN, msg: 'שכחתם לרבע את r. בחוק קולון המרחק מופיע בריבוע: r².' },
      { f: v => coulombForceSigned(v.Q, v.q, v.r), msg: 'החישוב נכון, אבל התוצאה נשארה בניוטון. התבקשה תשובה ב-mN (כפלו ב-1000).' },
    ],
    hints: [
      'חוק קולון: F = k·Q·q / r², עם k = 9×10⁹ N·m²/C². הציבו את שני המטענים כולל הסימן שלהם.',
      'מכפלה שלילית של המטענים = משיכה = כוח שלילי. מכפלה חיובית = דחייה = כוח חיובי.',
      'הנתונים כבר ב-SI, לכן התוצאה בניוטון. בדקו בדרך: k·Q·q = −3.6×10⁻⁷. כדי לעבור מ-N ל-mN כפלו ב-1000.',
    ],
    success: () => forcePair('paper_jumps_to_ruler'),
  },
  // 2 - balloon_wall: המרות nC, cm + הצבה בחוק קולון עם סימן (משיכה).
  {
    scene: 'balloon_wall', title: 'בלון ליד קיר', desc: DESC_WALL_SETUP,
    story: 'בלון שחיככו בשיער ליד קיר.',
    ask: `מהו הכוח בין הבלון לקיר? ${SIGN_NOTE}`,
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
    ],
    hints: [
      'המירו ל-SI לפני ההצבה: 1 nC = 10⁻⁹ C ו-1 cm = 10⁻² m.',
      'F = k·Q·q / r² עם הסימנים של המטענים. מטענים מנוגדים נותנים כוח שלילי (משיכה).',
      'אחרי ההמרה: Q = −3×10⁻⁸ C, q = 4×10⁻⁹ C, r = 0.02 m. בדקו בדרך: k·Q·q = −1.08×10⁻⁶. התוצאה בניוטון, כפלו ב-1000 כדי לקבל mN.',
    ],
    success: () => forcePair('balloon_slides_to_wall'),
  },
  // 3 - ruler_paper (אחרי מגע): מטענים באותו סימן = דחייה (חיובי), המרת mm.
  {
    scene: 'ruler_paper', variant: 'touched', title: 'נייר שנגע בסרגל',
    desc: 'כשהנייר נוגע בסרגל עוברים אליו אלקטרונים, והוא נטען מאותו סוג של מטען כמו הסרגל. נתייחס אליהם כשני מטענים נקודתיים במרחק r.',
    story: 'פיסת נייר נגעה בסרגל וקיבלה ממנו מטען.',
    ask: `מהו הכוח בין הסרגל לנייר? ${SIGN_NOTE}`,
    unit: 'mN', signed: true, unknown: 'force', source: RULER, target: PAPER_TOUCHED, consts: ['k'],
    data: [
      datum('Q', 'מטען הסרגל Q', -20, 'nC', -9),
      datum('q', 'מטען הנייר אחרי המגע q', -5, 'nC', -9),
      datum('r', 'מרחק r', 15, 'mm', -3),
    ],
    compute: v => coulombForceSigned(v.Q, v.q, v.r) / MN,
    traps: [
      { f: (v, a) => -a, msg: 'שני המטענים שליליים, ומטענים באותו סימן דוחים זה את זה. הכוח חיובי.' },
      { f: v => coulombForceSigned(v.Q, v.q, (v.r / MM) * CM) / MN, msg: 'המרת mm למטרים שגויה. 1 mm = 10⁻³ m ולא 10⁻² m.' },
      { f: v => KC * v.Q * v.q / v.r / MN, msg: 'שכחתם לרבע את r. בחוק קולון המרחק בריבוע.' },
      { f: v => coulombForceSigned(v.Q, v.q, v.r), msg: 'החישוב נכון, אבל התוצאה נשארה בניוטון. כפלו ב-1000 כדי לקבל mN.' },
    ],
    hints: [
      'השוו את הסימנים של שני המטענים. מה קורה בין שני מטענים כשהסימנים שלהם זהים?',
      'שני מטענים באותו סימן: המכפלה חיובית, כלומר דחייה וכוח חיובי. שימו לב: 1 mm = 10⁻³ m (לא 10⁻²).',
      'r = 0.015 m, ולכן r² = 2.25×10⁻⁴. בדקו בדרך: k·Q·q = +9×10⁻⁷. התוצאה בניוטון, כפלו ב-1000 כדי לקבל mN.',
    ],
    success: () => forcePair('paper_thrown_away'),
  },
  // 4 - water_balloon: חוק הריבוע ההפוך כיחס, בלי מטענים. גודל חיובי.
  {
    scene: 'water_balloon', variant: 'two_distances', title: 'בלון מתקרב לזרם מים', desc: DESC_WATER,
    story: 'מקרבים בלון טעון אל זרם מים, ומטען הטיפה לא משתנה.',
    ask: 'מהו גודל הכוח על הטיפה כשהבלון קרוב?',
    unit: 'μN', signed: false, unknown: 'force_new_distance', source: BALLOON, target: DROP_PLUS,
    show: { rPrime: true },
    geometry: v => ({ rFarRel: 1, rNearRel: sig(v.rNear / v.rFar) }),
    data: [
      datum('F1', 'הכוח על הטיפה כשהבלון רחוק', 20, 'μN', -6),
      datum('rFar', 'מרחק כשהבלון רחוק', 6, 'cm', -2),
      datum('rNear', 'מרחק כשהבלון קרוב', 2, 'cm', -2),
    ],
    compute: v => v.F1 * (v.rFar / v.rNear) ** 2 / UN,
    traps: [
      { f: v => v.F1 * (v.rFar / v.rNear) / UN, msg: 'הכוח גדל פי 3 בלבד. הכוח הפוך ל-r², לכן צריך לרבע את יחס המרחקים (פי 9).' },
      { f: v => v.F1 / (v.rFar / v.rNear) ** 2 / UN, msg: 'הפכתם את היחס. כשהבלון מתקרב הכוח גדל, הוא לא קטן.' },
      { f: v => v.F1 / (v.rFar / v.rNear) / UN, msg: 'חילקתם ב-3. כשהבלון מתקרב הכוח גדל (ובריבוע), הוא לא קטן.' },
    ],
    hints: [
      'בחוק קולון הכוח הפוך ל-r² (F ∝ 1/r²). המטענים לא השתנו, לכן הכוח משתנה רק בגלל המרחק.',
      'בכמה קטן המרחק? מ-6 cm ל-2 cm, כלומר פי 3. הכוח משתנה בריבוע של היחס הזה, ובכיוון ההפוך: קרוב יותר = חזק יותר.',
      'F₂ = F₁ · (r₁ / r₂)². אין צורך בהמרת יחידות, כי יחס בין שני מרחקים לא תלוי ביחידה, והתשובה יוצאת ב-μN.',
    ],
    success: () => forcePair('balloon_slides_near_stream_bends'),
  },
  // 5 - balloon_wall (טלאי שיער): Q = N·e, חזקות של 10, מיליארדים. אין זוג גופים ואין סמן r.
  {
    scene: 'balloon_wall', variant: 'hair_patch', title: 'ספירת אלקטרונים בבלון',
    desc: 'בחיכוך עוברים אלקטרונים מהשיער אל הבלון, והבלון נטען שלילית. המטען הכולל שווה למספר האלקטרונים כפול מטען של אלקטרון אחד.',
    story: 'בלון נחכך בשיער ולקח ממנו אלקטרונים.',
    ask: 'כמה אלקטרונים עברו מהשיער אל הבלון? (ענו במיליארדים)',
    unit: ' מיליארד', signed: false, unknown: 'electron_count', source: BALLOON, target: null,
    show: { r: false, hairPatch: true },
    data: [
      datum('Q', 'מטען הבלון', -24, 'nC', -9),
      datum('e', 'גודל מטען האלקטרון e', 1.6, 'C', -19, { sci: true }),
    ],
    // e נלקח משורת הנתון עצמה (אותו ערך שהתלמיד רואה) - אין קבוע כפול.
    compute: v => Math.abs(v.Q) / v.e / BILLION,
    traps: [
      { f: v => Math.abs(v.Q) / v.e, msg: 'זה מספר האלקטרונים עצמו. התבקשה תשובה במיליארדים, לכן חלקו ב-10⁹.' },
      { f: v => Math.abs(v.Q) * KILO / v.e / BILLION, msg: 'יצא פי 1000 גדול מדי: כנראה התייחסתם ל-nC כאל μC, או ספרתם במיליונים ולא במיליארדים. 1 nC = 10⁻⁹ C.' },
      { f: v => Math.abs(v.Q) / v.e / 1e11, msg: '1.5×10¹¹ אינו 1.5 מיליארד. מיליארד הוא 10⁹, ו-10¹¹ הם 100 מיליארד.' },
      { f: v => Math.abs(v.Q) / v.e / 10 / BILLION, msg: 'טעות של פי 10 בחזקות. בדקו שוב את החילוק 10⁻⁸ / 10⁻¹⁹.' },
    ],
    hints: [
      'המטען הכולל הוא מספר האלקטרונים כפול מטען של אלקטרון אחד: |Q| = N·e. לכן N = |Q| / e.',
      'המירו קודם nC ל-C: 1 nC = 10⁻⁹ C. השתמשו בגודל המטען, בלי הסימן.',
      '|Q| = 2.4×10⁻⁸ C. בדקו את החזקות: 10⁻⁸ / 10⁻¹⁹ = 10¹¹. מיליארד הוא 10⁹, ולכן 10¹¹ הם 100 מיליארד. כמה מיליארדים יש במספר שקיבלתם?',
    ],
    success: () => ({ anim: 'electrons_hop_to_balloon', arrows: [], fieldLines: false, deflectionDeg: null }),
  },
  // 6 - water_balloon: שדה חשמלי E = k|Q|/r², המרת kN/C. אין חץ כוח - קווי שדה בהצלחה.
  {
    scene: 'water_balloon', title: 'שדה חשמלי ליד זרם מים', desc: DESC_WATER,
    story: 'בלון טעון עומד ליד זרם מים.',
    ask: 'מהו גודל השדה החשמלי של הבלון במקום שבו עובר הזרם?',
    unit: 'kN/C', signed: false, unknown: 'field', source: BALLOON, target: DROP_PLUS, consts: ['k'],
    data: [
      datum('Q', 'מטען הבלון Q', -25, 'nC', -9),
      datum('r', 'מרחק מהזרם r', 5, 'cm', -2),
    ],
    compute: v => electricField(v.Q, v.r) / KILO,
    traps: [
      { f: v => KC * Math.abs(v.Q) / v.r / KILO, msg: 'שכחתם לרבע את r. בנוסחת השדה המרחק בריבוע.' },
      { f: v => electricField(v.Q, v.r), msg: 'החישוב נכון, אבל התוצאה ב-N/C. התבקשה תשובה ב-kN/C (חלקו ב-1000).' },
      { f: v => electricField(v.Q, v.r / CM) / KILO, msg: 'r נשאר בס"מ. המירו למטרים (5 cm = 0.05 m) לפני ההצבה.' },
      { f: v => electricField(v.Q, v.r * 10) / KILO, msg: 'המרת ס"מ למטרים שגויה. 5 cm = 0.05 m ולא 0.5 m.' },
    ],
    hints: [
      'שדה חשמלי של מטען נקודתי: E = k·|Q| / r², עם k = 9×10⁹. מחשבים גודל, בלי הסימן של Q. (בהמשך נשתמש בו: הכוח על מטען q בשדה E הוא F = q·E.)',
      'המירו ל-SI: Q = 25×10⁻⁹ C ו-r = 0.05 m. שימו לב: r מופיע בריבוע.',
      'בדקו בדרך: k·|Q| = 225 ו-r² = 2.5×10⁻³. התוצאה ב-N/C. חלקו ב-1000 כדי לקבל kN/C.',
    ],
    success: () => ({ anim: 'field_lines_stream_bends_slightly', arrows: [], fieldLines: true, deflectionDeg: null }),
  },
  // 7 - ruler_paper: בידוד Q מחוק קולון (המרות μN, nC, cm). גודל חיובי.
  {
    scene: 'ruler_paper', title: 'כמה טעון הסרגל?', desc: DESC_RULER,
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
  // 8 - balloon_wall: בידוד r מחוק קולון (שורש ריבועי, המרת mN). distanceForForce מהמנוע.
  {
    scene: 'balloon_wall', title: 'כמה רחוק הבלון מהקיר?', desc: DESC_WALL,
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
      'בודדו את r² מחוק קולון: r² = k·Q·q / F, ורק בסוף קחו שורש.',
      'הציבו גדלים בלבד, ביחידות SI: mN → N (×10⁻³) ו-nC → C (×10⁻⁹).',
      'בדקו בדרך: k·Q·q = 1.44×10⁻⁶ ו-F = 9×10⁻⁴ N. אחרי השורש תקבלו r במטרים. כפלו ב-100 כדי לקבל cm.',
    ],
    success: () => forcePair('balloon_slides_to_wall_r_blinks'),
  },
  // 9 - ruler_paper: תנאי הרמה גבולי F = W (mg = מיליגרם, לא m·g). גודל חיובי.
  {
    scene: 'ruler_paper', title: 'הרמת פיסת נייר', desc: `${DESC_RULER} מטען הנייר q נתון וקבוע, ורק מטען הסרגל משתנה.`,
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
      'בדקו בדרך: W = 5×10⁻⁵ N. מתוך k·Q·q / r² = W בודדים Q = W·r² / (k·q). את התוצאה בקולון כפלו ב-10⁹ כדי לקבל nC.',
    ],
    success: () => ({
      anim: 'paper_hangs_in_equilibrium', fieldLines: false, deflectionDeg: null,
      arrows: [{ kind: 'force', lengthRel: 1 }, { kind: 'weight', lengthRel: 1 }], // F = W: אורכים שווים
    }),
  },
  // 10 - water_balloon: שרשרת של שלושה צעדים: E, אחר כך F = q·E, אחר כך F / W.
  {
    scene: 'water_balloon', title: 'טיפה בשדה הבלון', desc: DESC_WATER,
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
  const near = (x, target) => Math.abs(x - target) <= Math.max(Math.abs(target) * pct, 1e-12);

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
