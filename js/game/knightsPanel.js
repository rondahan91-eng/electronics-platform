// ==========================================================================
// knightsPanel.js - פאנל התשובה האינטראקטיבי בן ארבעת השלבים של "צדיקים ונוכלים".
//   שלב 1: מהמלל לפסוק (תפריט סמלים קבוע, בלי הקלדה חופשית)   שלב 2: שיבוץ חלקי הפסוק בעמודות (גרירה + בחירה בלחיצה/מקלדת)
//   שלב 3: רישום הקביעות בכל שורה                              שלב 4: בדיקת עקביות (✓/✗) והמסקנה
// כל ההיגיון (שורות, בדיקת פסוק, חלקים, קביעות, עקביות) מגיע מ-knightsLogic.js; כאן רק ממשק.
// חוזה מול המנוע (gameEngine.js, topic.mountPanel): mountKnightsPanel(container, level, api) -> dispose.
//   api.wrongAttempt() בכל בדיקה כושלת של ממש (לא על קלט חסר/לא שלם), api.solved() פעם אחת בסיום שלב 4.
// הסגנון מוזרק פעם אחת (#knights-panel-style), כל המחלקות בקידומת kn-.
// ==========================================================================
import {
  rows, table, checkFormula, chips, columns, placeChip, checkDeterminations, checkConsistency,
  sentenceText, columnName, varMeaning, personOf, NOT, OPS,
} from './knightsLogic.js';

const STYLE_ID = 'knights-panel-style';
const TITLES = ['מהמלל לפסוק', 'שיבוץ חלקי הפסוק בעמודות', 'רישום הקביעות', 'בדיקת עקביות'];
const MAX_TOKENS = 8;
// בדיקה על קלט חסר (פסוק ריק או לא שלם, תאים ריקים בטבלה) מציגה הודעה אבל לא נספרת כניסיון שגוי, כמו קלט לא תקין בשדה התשובה הרגיל
// של המנוע. מי שרוצה לספור גם אותה (ולהשמיע את צליל השגיאה) משנה ל-true.
const COUNT_INCOMPLETE_AS_WRONG = false;
let uidCounter = 0;

const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const ltr = s => `<span class="kn-ltr" dir="ltr">${esc(s)}</span>`;
const iso = s => `\u2066${s}\u2069`; // בידוד כיווני לטקסט פשוט (aria-label, הודעות)
const tv = b => (b ? 'אמת' : 'שקר');
const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** פסוק כמחרוזת: בלי רווח אחרי ¬ ("¬x ∧ L"). */
function tokensText(tokens) {
  let out = '';
  tokens.forEach((t, i) => { if (i > 0 && tokens[i - 1] !== NOT) out += ' '; out += t; });
  return out;
}
/** הקראה לקורא מסך: ¬ = "לא", ∧ = "וגם", ∨ = "או". */
function spoken(tokens) {
  return tokens.map(t => (t === NOT ? 'לא' : t === OPS.and ? 'וגם' : t === OPS.or ? 'או' : t)).join(' ');
}
/** רשימה בעברית: "a", "a ו-b", "a, b ו-c" (הפריטים כבר HTML; הפריט האחרון מקבל ו' צמודה). */
function heList(items, and = 'ו') {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} ${and}${items[items.length - 1]}`;
}

// ---------------------------------------------------------------- עיצוב
const CSS = `
.kn-panel{--kn-navy:#173a6d;--kn-navy-2:#2c5391;--kn-navy-soft:#e8eef7;--kn-navy-line:#b4c4dc;
  --kn-t-bg:#dff4e7;--kn-t-fg:#0a6637;--kn-t-bd:#3fae6d;
  --kn-f-bg:#fde5e2;--kn-f-fg:#a1281a;--kn-f-bd:#e4695b;
  --kn-am-bg:#fdf1dc;--kn-am-bd:#e3ad54;--kn-am-fg:#7a4c05;--kn-am-strong:#f2a93b;
  --kn-sky-bg:#e4f3fc;--kn-sky-bd:#a6d3ee;--kn-sky-fg:#17597f;
  --kn-hint-bg:#e9eef4;--kn-hint-bd:#bccadb;--kn-hint-fg:#33465b;
  --kn-warn:#5b3fb0;--kn-warn-bg:#f1ecfe;--kn-warn-line:#cdbff2;
  display:grid;gap:14px;min-width:0;font-size:14.5px;line-height:1.7;color:var(--px-ink,#0e1c17);text-align:start}
.kn-panel *{box-sizing:border-box}
.kn-panel :focus-visible{outline:3px solid var(--kn-navy);outline-offset:2px;box-shadow:none}
.kn-ltr{unicode-bidi:isolate;direction:ltr;font-family:var(--font-mono,ui-monospace,monospace);font-weight:700;white-space:nowrap}
.kn-sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.kn-box-label{font:700 11px/1 var(--font-main);letter-spacing:.12em;margin-bottom:8px}

/* תרחיש (תכלת) */
.kn-scenario{background:var(--kn-sky-bg);border:1px solid var(--kn-sky-bd);border-radius:20px;padding:14px 18px}
.kn-scenario .kn-box-label{color:var(--kn-sky-fg)}
.kn-scenario p{margin:0 0 8px;color:#16394f}
.kn-scenario p:last-child{margin-bottom:0}
.kn-scenario em,.kn-body em{font-style:normal;font-weight:700;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px}
.kn-quote{margin:2px 0 10px;padding:9px 16px;background:#fff;border:1px solid var(--kn-sky-bd);border-inline-start:5px solid var(--kn-navy);border-radius:14px;font-weight:700;color:var(--kn-navy)}

/* שלבים */
.kn-stages{display:grid;gap:12px}
.kn-stage{background:#fff;border:1px solid var(--px-hairline-strong,#c9d2cd);border-radius:20px;overflow:hidden;min-width:0;scroll-margin-top:72px}
.kn-stage.is-active{border-color:var(--kn-navy);box-shadow:0 0 0 1px var(--kn-navy)}
.kn-stage.is-locked{background:var(--px-paper-sunken,#f1f0eb);opacity:.8}
.kn-stage.is-done{border-color:var(--kn-am-bd)}
.kn-stage-top{display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--kn-navy-soft)}
.kn-stage.is-done .kn-stage-top{background:var(--kn-am-bg)}
.kn-stage.is-locked .kn-stage-top{background:transparent}
.kn-num{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--kn-navy);color:#fff;font:700 14px/1 var(--font-main)}
.kn-stage.is-done .kn-num{background:var(--kn-am-strong);color:#3d2700}
.kn-stage.is-locked .kn-num{background:#7d8ba0}
.kn-stage-title{margin:0;flex:1 1 auto;min-width:0;font:700 15px/1.4 var(--font-main);color:var(--kn-navy)}
.kn-stage.is-locked .kn-stage-title{color:#4d5b6e}
.kn-stage-status{flex:none;font-size:12px;color:#4d5b6e}
.kn-stage.is-done .kn-stage-status{color:var(--kn-am-fg);font-weight:700}
.kn-panel button.kn-toggle{padding:5px 14px;font-size:13px;box-shadow:none;transform:none}
.kn-summary{padding:8px 16px 12px;font-size:13.5px;color:var(--kn-am-fg);background:var(--kn-am-bg)}
.kn-body{padding:14px 16px 16px;display:grid;gap:12px;min-width:0}
.kn-body[hidden],.kn-summary[hidden],.kn-toggle[hidden]{display:none}
.kn-lead{margin:0;color:var(--px-ink-soft,#41564e)}
.kn-rule,.kn-method{margin:0;background:var(--kn-navy-soft);border-inline-start:4px solid var(--kn-navy);border-radius:10px;padding:8px 14px;color:var(--kn-navy)}
.kn-rule b,.kn-method b{font-weight:700}

/* שלב 1: בונה הפסוק */
.kn-sent{border:1px solid var(--kn-navy-line);border-radius:16px;padding:12px;background:#fafcff;display:grid;gap:10px;min-width:0}
.kn-sent.is-ok{background:var(--kn-am-bg);border-color:var(--kn-am-bd)}
.kn-sent.is-bad{border-style:dashed;border-width:2px;border-color:var(--kn-warn)}
.kn-sent-head{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.kn-label{font-weight:700;color:var(--kn-navy)}
.kn-sent-quote{color:#16394f}
.kn-formula-row{display:flex;align-items:center;gap:10px}
.kn-formula{flex:1 1 auto;min-width:0;min-height:52px;display:flex;align-items:center;direction:ltr;text-align:left;padding:6px 14px;background:#fff;border:2px solid var(--kn-navy-line);border-radius:12px;overflow-x:auto;
  font:700 24px/1.3 var(--font-mono,ui-monospace,monospace);letter-spacing:.04em;color:var(--kn-navy);white-space:pre}
.kn-sent.is-ok .kn-formula{border-color:var(--kn-am-strong);background:#fffaf0}
.kn-sent.is-bad .kn-formula{border-color:var(--kn-warn)}
.kn-ph{font:500 14px/1.3 var(--font-main);color:var(--px-ink-muted,#5b6f67);direction:rtl;letter-spacing:0;white-space:normal}
.kn-sent-mark{flex:none;min-width:26px;text-align:center;font:700 20px/1 var(--font-main)}
.kn-sent.is-ok .kn-sent-mark{color:var(--kn-am-fg)}
.kn-sent.is-bad .kn-sent-mark{color:var(--kn-warn)}
.kn-menu{display:flex;flex-wrap:wrap;gap:8px 16px}
.kn-menu-group{display:flex;flex-wrap:wrap;gap:6px}
.kn-panel button.kn-sym{min-width:48px;min-height:48px;padding:6px 12px;border-radius:12px;background:#fff;color:var(--kn-navy);border:2px solid var(--kn-navy-line);box-shadow:none;transform:none;
  display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font:700 14px/1.2 var(--font-main)}
.kn-panel button.kn-sym:hover:not(:disabled){background:var(--kn-navy-soft);border-color:var(--kn-navy);transform:none}
.kn-panel button.kn-sym:active:not(:disabled){background:#d6e1f1}
.kn-panel button.kn-sym:disabled{opacity:.4}
.kn-sym-main{font:700 20px/1.1 var(--font-mono,ui-monospace,monospace);direction:ltr;unicode-bidi:isolate}
.kn-sym-sub{font:500 11px/1.25 var(--font-main);color:var(--px-ink-soft,#41564e);max-width:11em;text-align:center}
.kn-panel button.kn-ctl{min-width:auto;font-weight:600}

/* שלב 2: חלקים ועמודות */
.kn-s2{display:grid;gap:12px;min-width:0}
.kn-tray{display:grid;gap:8px;padding:10px;border:2px dashed var(--kn-navy-line);border-radius:14px;min-height:64px;background:#fafcff;align-content:center}
.kn-tray-title{font-weight:700;color:var(--kn-navy);font-size:13px}
.kn-tray-group{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center}
.kn-tray-who{font-weight:700;color:var(--kn-navy);font-size:13px;min-width:2.2em}
.kn-tray-empty{color:var(--kn-am-fg);font-weight:700}
.kn-chip{display:inline-flex;flex-direction:column;align-items:center;gap:1px;min-width:60px;padding:6px 14px;border:2px solid var(--kn-navy-line);border-radius:12px;background:#fff;
  cursor:grab;user-select:none;-webkit-user-select:none;touch-action:manipulation;color:var(--kn-navy)}
.kn-chip.kn-whole{border-color:var(--kn-navy);background:var(--kn-navy-soft)}
.kn-chip:hover{border-color:var(--kn-navy)}
.kn-chip.is-selected{background:var(--kn-navy);border-color:var(--kn-navy);color:#fff;box-shadow:0 0 0 4px rgba(23,58,109,.25)}
.kn-chip.is-selected .kn-chip-kind{color:#dbe6f7}
.kn-chip.is-dragging{opacity:.45}
.kn-chip.is-rejected{border-color:var(--kn-warn);background:var(--kn-warn-bg);color:var(--kn-warn);animation:kn-shake .4s ease}
.kn-chip-text{font:700 19px/1.25 var(--font-mono,ui-monospace,monospace);direction:ltr;unicode-bidi:isolate;white-space:nowrap}
.kn-chip-kind{font-size:11px;line-height:1.3;color:var(--px-ink-soft,#41564e)}
.kn-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:10px}
.kn-col{display:flex;flex-direction:column;min-width:0;border:2px solid var(--kn-navy-line);border-radius:14px;overflow:hidden;background:#fff}
.kn-col.is-over{border-color:var(--kn-navy);box-shadow:0 0 0 3px rgba(23,58,109,.25)}
.kn-col.is-rejected{border-color:var(--kn-warn);animation:kn-shake .4s ease}
.kn-col-head{background:var(--kn-navy);color:#fff;padding:7px 8px;text-align:center}
.kn-col-det .kn-col-head{background:var(--kn-navy-2)}
.kn-col-name{display:block;font-weight:700;overflow-wrap:anywhere}
.kn-col-sub{display:block;font-size:11px;line-height:1.4;color:#dbe6f7}
.kn-col-sub .kn-ltr{font-weight:600}
.kn-panel button.kn-drop{flex:1;min-height:76px;padding:8px;border:none;border-radius:0;background:#fff;color:inherit;box-shadow:none;transform:none;font:500 12.5px/1.4 var(--font-main);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:default}
.kn-panel button.kn-drop:hover{background:#fff;transform:none}
.kn-cols.is-armed button.kn-drop{cursor:pointer;background:var(--kn-navy-soft);outline:2px dashed var(--kn-navy);outline-offset:-5px}
.kn-cols.is-armed button.kn-drop:hover{background:#d6e1f1}
.kn-cols.is-armed button.kn-drop:focus-visible{outline:3px solid var(--kn-navy);outline-offset:-3px}
.kn-drop-ph{color:var(--px-ink-muted,#5b6f67)}
.kn-cols.is-armed .kn-drop-ph{color:var(--kn-navy);font-weight:700}
.kn-placed{display:inline-flex;flex-direction:column;align-items:center;padding:4px 12px;border:2px solid var(--kn-am-bd);border-radius:10px;background:var(--kn-am-bg);color:var(--kn-am-fg)}
.kn-placed .kn-chip-kind{color:var(--kn-am-fg)}

/* שלבים 3-4: טבלאות */
.kn-tablewrap{overflow-x:auto;max-width:100%;padding:4px;-webkit-overflow-scrolling:touch}
.kn-table{border-collapse:separate;border-spacing:0;margin:0 auto;min-width:min-content;border-top:1px solid var(--kn-navy-line);border-inline-end:1px solid var(--kn-navy-line)}
.kn-table th,.kn-table td{border-bottom:1px solid var(--kn-navy-line);border-inline-start:1px solid var(--kn-navy-line);padding:6px 8px;text-align:center;font-size:13px;line-height:1.35;white-space:nowrap}
.kn-table thead th{background:var(--kn-navy-soft);color:var(--kn-navy);font-weight:700}
.kn-table thead tr:first-child th{background:#d8e3f2}
.kn-table tbody th{background:#f4f7fb;color:var(--kn-navy);font-weight:700}
.kn-markcell{background:#fff}
.kn-scrollhint{display:none;margin:4px 0 0;font-size:12px;color:var(--px-ink-soft,#41564e)}
.kn-scrollhint.show{display:block}
/* בטבלת העקביות (תשעה טורים בשני דוברים) עמודת השורה ועמודת הסימון נשארות בתצוגה בזמן גלילה אופקית */
.kn-t4 thead tr:first-child>th:first-child,.kn-t4 tbody th{position:sticky;inset-inline-start:0;z-index:2}
.kn-t4 thead tr:first-child>th:last-child,.kn-t4 .kn-markcell{position:sticky;inset-inline-end:0;z-index:2}
.kn-th-sub{display:block;font:600 11px/1.3 var(--font-mono,ui-monospace,monospace);color:var(--kn-navy-2);direction:ltr;unicode-bidi:isolate}
.kn-val{font-weight:700;min-width:46px}
.kn-val.is-t{background:var(--kn-t-bg);color:var(--kn-t-fg)}
.kn-val.is-f{background:var(--kn-f-bg);color:var(--kn-f-fg)}
.kn-panel button.kn-cell,.kn-panel button.kn-mark{min-width:62px;min-height:40px;padding:4px 8px;border-radius:10px;border:2px dashed var(--kn-navy-line);background:#fff;color:var(--px-ink-soft,#41564e);
  font:700 13px/1.2 var(--font-main);box-shadow:none;transform:none;cursor:pointer}
.kn-panel button.kn-mark{min-width:52px;font-size:17px}
.kn-panel button.kn-cell:hover:not(:disabled),.kn-panel button.kn-mark:hover:not(:disabled){background:var(--kn-navy-soft);border-color:var(--kn-navy);transform:none}
.kn-panel button.kn-cell.is-t,.kn-panel button.kn-mark.is-t{border:2px solid var(--kn-t-bd);background:var(--kn-t-bg);color:var(--kn-t-fg)}
.kn-panel button.kn-cell.is-f,.kn-panel button.kn-mark.is-f{border:2px solid var(--kn-f-bd);background:var(--kn-f-bg);color:var(--kn-f-fg)}
.kn-panel button.kn-cell.is-need,.kn-panel button.kn-mark.is-need{border:3px dashed var(--kn-navy);background:var(--kn-navy-soft)}
.kn-panel button.kn-cell.is-bad,.kn-panel button.kn-mark.is-bad{border:3px dashed var(--kn-warn);animation:kn-shake .4s ease}
.kn-panel button.kn-cell:disabled,.kn-panel button.kn-mark:disabled{opacity:1;cursor:default}
.kn-panel button.kn-cell.is-locked,.kn-panel button.kn-mark.is-locked{box-shadow:inset 0 0 0 2px var(--kn-am-strong)}
.kn-bang{margin-inline-start:4px;color:var(--kn-warn);font-weight:700}
.kn-table tr.is-solution>th,.kn-table tr.is-solution>td.kn-markcell{background:var(--kn-am-bg)}
.kn-table tr.is-solution>*{border-top:3px solid var(--kn-am-strong);border-bottom:3px solid var(--kn-am-strong)}
.kn-table tr.is-solution>*:first-child{border-inline-start:3px solid var(--kn-am-strong)}
.kn-table tr.is-solution>*:last-child{border-inline-end:3px solid var(--kn-am-strong)}
.kn-panel button.kn-mark.is-solution{background:var(--kn-am-strong);border-color:var(--kn-am-strong);color:#3d2700;box-shadow:none}

/* פעולות, משוב, רמזים */
.kn-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.kn-panel button.kn-check{padding:10px 24px;font-size:15px}
.kn-panel button.kn-hint-btn{padding:9px 18px;font-size:14px}
.kn-panel button.kn-hint-btn[aria-disabled="true"]{opacity:.5;cursor:not-allowed;box-shadow:none;transform:none}
.kn-hint-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.kn-hint-count{font-size:13px;font-weight:600;color:var(--kn-hint-fg)}
.kn-fb{display:none;padding:10px 14px;border-radius:14px;font-size:13.5px;line-height:1.65}
.kn-fb.show{display:grid;gap:4px}
.kn-fb.is-bad{background:var(--kn-warn-bg);border:1px solid var(--kn-warn-line);color:#3f2b86}
.kn-fb.is-ok{background:var(--kn-am-bg);border:1px solid var(--kn-am-bd);color:var(--kn-am-fg)}
.kn-fb.is-note{background:var(--kn-navy-soft);border:1px solid var(--kn-navy-line);color:var(--kn-navy)}
.kn-fb-line{display:flex;gap:8px;align-items:flex-start}
.kn-fb-ic{flex:none;font-weight:700;min-width:1em;text-align:center}
.kn-hints{display:grid;gap:8px}
.kn-hint{display:flex;gap:10px;align-items:flex-start;padding:10px 14px;background:var(--kn-hint-bg);border:1px solid var(--kn-hint-bd);border-radius:14px;color:var(--kn-hint-fg);font-size:13.5px;line-height:1.7}
.kn-hint-tag{flex:none;margin-top:2px;padding:0 10px;background:#fff;border:1px solid var(--kn-hint-bd);border-radius:999px;font:700 11px/1.7 var(--font-main);color:var(--kn-hint-fg)}
.kn-hint-text{min-width:0}
.kn-stage.is-done .kn-actions,.kn-stage.is-done .kn-fb{display:none}
.kn-conclusion{background:var(--kn-am-bg);border:2px solid var(--kn-am-strong);border-radius:16px;padding:12px 16px;color:var(--kn-am-fg)}
.kn-conclusion .kn-box-label{color:var(--kn-am-fg)}
.kn-conclusion p{margin:0;font-weight:600}

@keyframes kn-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
/* מכל הפאנל (.qa-panel-custom מגיע מהמנוע): בטלפון מצמצמים את הריפוד כדי שהטבלאות לא ייסחטו */
@media (max-width:600px){
  .qa-panel.qa-panel-custom{padding:12px 10px;margin-inline:-12px;border-radius:20px}
}
@media (max-width:480px){
  .kn-stage-top{padding:10px 12px}
  .kn-stage-status{display:none}
  .kn-stage-title{font-size:14px}
  .kn-scenario{padding:12px 14px}
  .kn-formula{font-size:21px;padding:6px 10px}
  .kn-body{padding:12px 8px}
  .kn-tablewrap{padding:2px}
  .kn-table th,.kn-table td{padding:3px 3px;font-size:12px}
  .kn-th-sub{font-size:10px}
  .kn-th-formula{display:none}
  .kn-t4 thead th{white-space:normal;line-height:1.25}
  .kn-val{min-width:32px}
  .kn-panel button.kn-cell{min-width:44px;min-height:38px;padding:3px 2px;font-size:12px;border-width:2px}
  .kn-panel button.kn-mark{min-width:40px;min-height:38px;padding:3px 2px}
  .kn-cols{grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px}
  .kn-panel button.kn-sym{min-width:44px}
}
@media (prefers-reduced-motion:reduce){
  .kn-panel *{animation:none!important;transition:none!important}
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}

// ---------------------------------------------------------------- הפאנל
export function mountKnightsPanel(container, level, api) {
  injectStyle();
  const ex = level.ex;
  if (!ex) throw new Error('knightsPanel: level.ex חסר');
  const uid = `kn${++uidCounter}`;
  const R = rows(ex), T = table(ex), CHIPS = chips(ex), COLS = columns(ex);
  const nS = ex.sentences.length, nV = ex.vars.length;
  const solution = T.find(r => r.consistent);
  const sName = i => { const p = personOf(ex, ex.sentences[i].speaker); return p ? p.name : ''; };
  const sLabel = i => `S${nS > 1 ? ex.sentences[i].speaker : ''}`;
  const hintList = k => (ex.hints && (ex.hints[String(k)] || ex.hints[k])) || [];

  const S = {
    status: [null, 'active', 'locked', 'locked', 'locked'],
    open: [null, false, false, false, false],
    built: [false, false, false, false, false],
    sent: ex.sentences.map(() => ({ tokens: [], ok: false, bad: false })),
    placed: {}, selected: null, dragging: null,
    dets: Object.fromEntries(R.map(r => [r.n, ex.sentences.map(() => null)])),
    detLock: {}, detBad: {}, detNeed: {},
    marks: Object.fromEntries(R.map(r => [r.n, null])),
    markLock: {}, markBad: {}, markNeed: {},
    hints: [0, 0, 0, 0, 0],
    solved: false,
  };
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  const q = (sel, root = container) => root.querySelector(sel);
  const qa = (sel, root = container) => Array.from(root.querySelectorAll(sel));
  const stageEl = k => q(`.kn-stage[data-stage="${k}"]`);

  // ---- תרחיש: הפסקאות והציטוטים (ציטוט מופיע אחרי פסקה שנגמרת בנקודתיים)
  function scenarioHtml() {
    const out = [];
    let qi = 0;
    const quote = i => `<blockquote class="kn-quote">“${esc(ex.quotes[i])}”</blockquote>`;
    ex.paragraphs.forEach(p => {
      out.push(`<p>${p}</p>`);
      const plainP = p.replace(/<[^>]+>/g, '').replace(/[\u2066-\u2069]/g, '').trim();
      if (/[:׃]$/.test(plainP) && qi < ex.quotes.length) out.push(quote(qi++));
    });
    while (qi < ex.quotes.length) out.push(quote(qi++));
    return `<div class="kn-scenario"><div class="kn-box-label">התרחיש</div>${out.join('')}</div>`;
  }

  function stageShell(k) {
    return `<section class="kn-stage is-locked" data-stage="${k}" aria-labelledby="${uid}-h${k}">
      <div class="kn-stage-top">
        <span class="kn-num" aria-hidden="true">${k}</span>
        <h3 class="kn-stage-title" id="${uid}-h${k}" tabindex="-1">שלב ${k} מתוך 4 · ${TITLES[k - 1]}</h3>
        <span class="kn-stage-status"></span>
        <button type="button" class="secondary kn-toggle" data-act="toggle" data-stage="${k}" aria-expanded="false" hidden>הצגה</button>
      </div>
      <div class="kn-summary" hidden></div>
      <div class="kn-body" hidden></div>
    </section>`;
  }

  container.innerHTML = `<div class="kn-panel" dir="rtl" lang="he">
    ${scenarioHtml()}
    <div class="kn-stages">${[1, 2, 3, 4].map(stageShell).join('')}</div>
    <div class="kn-sr-only" data-sr aria-live="polite"></div>
  </div>`;

  let srFlip = false;
  function announce(text) { const el = q('[data-sr]'); if (el) { srFlip = !srFlip; el.textContent = text + (srFlip ? '\u200b' : ''); } }

  /** הודעות: lines = [{ k: 'ok'|'bad'|'note', html }]. kind של הקופסה לפי החמורה ביותר. */
  function showFb(k, lines) {
    const fb = q(`[data-fb="${k}"]`);
    if (!fb) return;
    if (!lines.length) { fb.className = 'kn-fb'; fb.innerHTML = ''; return; }
    const kind = lines.some(l => l.k === 'bad') ? 'bad' : lines.every(l => l.k === 'ok') ? 'ok' : 'note';
    fb.className = `kn-fb show is-${kind}`;
    fb.innerHTML = lines.map(l => `<div class="kn-fb-line"><span class="kn-fb-ic" aria-hidden="true">${l.k === 'ok' ? '✓' : l.k === 'bad' ? '!' : 'i'}</span><span>${l.html}</span></div>`).join('');
    if (fb.scrollIntoView) fb.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  const wrong = () => { try { api.wrongAttempt(); } catch (e) { console.warn('knights wrongAttempt', e); } };

  // ---- רמזים
  function hintBlock(k) {
    return `<div class="kn-hint-row"><button type="button" class="secondary kn-hint-btn" data-act="hint" data-stage="${k}">רמז נוסף</button><span class="kn-hint-count" data-hint-count="${k}">רמז 0/${hintList(k).length}</span></div>`;
  }
  const hintsHost = k => `<div class="kn-hints" data-hints="${k}" aria-live="polite" aria-relevant="additions"></div>`;
  function revealHint(k) {
    const list = hintList(k);
    if (S.hints[k] >= list.length) return;
    const idx = S.hints[k]++;
    const host = q(`[data-hints="${k}"]`);
    if (host) host.insertAdjacentHTML('beforeend', `<div class="kn-hint"><span class="kn-hint-tag">רמז ${idx + 1}</span><div class="kn-hint-text">${list[idx]}</div></div>`);
    updateHintUi(k);
  }
  function updateHintUi(k) {
    const total = hintList(k).length;
    const cnt = q(`[data-hint-count="${k}"]`);
    if (cnt) cnt.textContent = `רמז ${S.hints[k]}/${total}`;
    const btn = q(`.kn-hint-btn[data-stage="${k}"]`);
    if (btn) {
      const exhausted = S.hints[k] >= total;
      btn.setAttribute('aria-disabled', String(exhausted));
      btn.setAttribute('aria-label', exhausted ? `רמז נוסף: כל ${total} הרמזים כבר נפתחו` : `רמז נוסף: נפתחו ${S.hints[k]} מתוך ${total}`);
    }
  }

  function updateScrollHints() {
    qa('.kn-tablewrap').forEach(w => {
      const hint = w.nextElementSibling;
      if (hint && hint.hasAttribute('data-scrollhint')) hint.classList.toggle('show', w.scrollWidth > w.clientWidth + 2);
    });
  }

  // ---- מחזור החיים של השלבים
  function summaryHtml(k) {
    if (k === 1) return `הפסוק נבנה: ${ex.sentences.map((s, i) => `${nS > 1 ? `${esc(sName(i))}: ` : ''}${ltr(tokensText(S.sent[i].tokens))}`).join(' · ')}`;
    if (k === 2) return `כל ${CHIPS.length} החלקים שובצו בעמודות המתאימות.`;
    if (k === 3) return `הקביעות נרשמו בכל ${R.length} השורות.`;
    return `שורה ${solution.n} היא השורה העקבית היחידה.`;
  }
  function refreshStage(k) {
    const el = stageEl(k), st = S.status[k];
    el.classList.remove('is-locked', 'is-active', 'is-done');
    el.classList.add(`is-${st}`);
    if (st === 'active') el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
    q('.kn-num', el).textContent = st === 'done' ? '✓' : String(k);
    q('.kn-stage-status', el).textContent = st === 'locked' ? 'ייפתח בסיום השלב הקודם' : st === 'done' ? 'הושלם' : 'בעבודה';
    const open = st === 'active' || (st === 'done' && S.open[k]);
    q('.kn-body', el).hidden = !open;
    const sum = q('.kn-summary', el);
    sum.hidden = !(st === 'done' && !S.open[k]);
    if (st === 'done') sum.innerHTML = summaryHtml(k);
    const tog = q('.kn-toggle', el);
    tog.hidden = !(st === 'done' && k < 4);
    tog.setAttribute('aria-expanded', String(!!S.open[k]));
    tog.textContent = S.open[k] ? 'הסתרה' : 'הצגה';
    tog.setAttribute('aria-label', `${S.open[k] ? 'הסתרת' : 'הצגת'} שלב ${k}: ${TITLES[k - 1]}`);
  }
  function activate(k) {
    S.status[k] = 'active';
    if (!S.built[k]) {
      S.built[k] = true;
      q('.kn-body', stageEl(k)).innerHTML = [body1, body2, body3, body4][k - 1]();
      if (k === 1) ex.sentences.forEach((_, i) => renderSent(i));
      if (k === 2) renderS2();
      if (k === 3) refreshAllDet();
      if (k === 4) refreshAllMarks();
      updateHintUi(k);
    }
    refreshStage(k);
    updateScrollHints();
  }
  function completeStage(k) {
    S.status[k] = 'done';
    S.open[k] = (k === 4);
    refreshStage(k);
    if (k < 4) {
      activate(k + 1);
      announce(`שלב ${k} הושלם. שלב ${k + 1} נפתח: ${TITLES[k]}.`);
      const next = stageEl(k + 1);
      later(() => {
        const h = q(`#${uid}-h${k + 1}`);
        if (h) h.focus({ preventScroll: true });
        next.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
      }, 30);
    }
  }

  // ================================================================ שלב 1
  function sentHtml(i) {
    const nm = sName(i);
    const ops = [[NOT, 'לא'], [OPS.and, 'וגם'], [OPS.or, 'או']];
    const varBtns = ex.vars.map(v => `<button type="button" class="kn-sym kn-var" data-act="tok" data-i="${i}" data-tok="${esc(v)}" aria-label="${esc(iso(v))}: ${esc(varMeaning(ex, v))}"><span class="kn-sym-main">${esc(v)}</span><span class="kn-sym-sub">${esc(varMeaning(ex, v))}</span></button>`).join('');
    const opBtns = ops.map(([t, w]) => `<button type="button" class="kn-sym kn-op" data-act="tok" data-i="${i}" data-tok="${t}" aria-label="${w}, ${t}"><span class="kn-sym-main">${t}</span><span class="kn-sym-sub">${w}</span></button>`).join('');
    return `<div class="kn-sent" data-sent="${i}">
      <div class="kn-sent-head"><span class="kn-label">המשפט של ${esc(nm)}:</span><span class="kn-sent-quote">“${esc(ex.quotes[i] || '')}”</span></div>
      <div class="kn-formula-row">
        <output class="kn-formula" dir="ltr" data-formula="${i}" aria-label="הפסוק של ${esc(nm)}"></output>
        <span class="kn-sent-mark" data-mark="${i}" aria-hidden="true"></span>
      </div>
      <div class="kn-menu" role="group" aria-label="תפריט סמלים לבניית הפסוק של ${esc(nm)}">
        <div class="kn-menu-group">${varBtns}</div>
        <div class="kn-menu-group">${opBtns}</div>
        <div class="kn-menu-group">
          <button type="button" class="secondary kn-sym kn-ctl" data-act="back" data-i="${i}" aria-label="מחיקת הסמל האחרון"><span class="kn-sym-main" aria-hidden="true">⌫</span><span class="kn-sym-sub">מחיקה</span></button>
          <button type="button" class="secondary kn-sym kn-ctl" data-act="clear" data-i="${i}" aria-label="ניקוי כל הפסוק"><span class="kn-sym-main" aria-hidden="true">✕</span><span class="kn-sym-sub">ניקוי</span></button>
        </div>
      </div>
    </div>`;
  }
  function body1() {
    return `<p class="kn-lead">${nS > 1 ? 'קראו כל משפט ובנו לו פסוק לוגי משלו' : 'קראו את מה שנאמר ובנו את הפסוק הלוגי המתאים'} מתוך תפריט הסמלים (${ltr('¬')} ${ltr('∧')} ${ltr('∨')} והמשתנים). אין צורך להקליד, רק ללחוץ על הלחצנים.</p>
      ${ex.sentences.map((_, i) => sentHtml(i)).join('')}
      <div class="kn-actions"><button type="button" class="kn-check" data-act="check1">בדיקה</button>${hintBlock(1)}</div>
      <div class="kn-fb" data-fb="1" role="status" aria-live="polite"></div>
      ${hintsHost(1)}`;
  }
  function renderSent(i) {
    const st = S.sent[i];
    const blk = q(`[data-sent="${i}"]`);
    if (!blk) return;
    const out = q(`[data-formula="${i}"]`, blk);
    out.innerHTML = st.tokens.length
      ? `<span aria-hidden="true" dir="ltr">${esc(tokensText(st.tokens))}</span><span class="kn-sr-only">${esc(spoken(st.tokens))}</span>`
      : '<span class="kn-ph" dir="rtl">הפסוק יופיע כאן</span>';
    blk.classList.toggle('is-ok', st.ok);
    blk.classList.toggle('is-bad', st.bad && !st.ok);
    q(`[data-mark="${i}"]`, blk).textContent = st.ok ? '✓' : st.bad ? '!' : '';
    qa('.kn-sym', blk).forEach(b => { b.disabled = st.ok; });
  }
  function addToken(i, tok) {
    const st = S.sent[i];
    if (st.ok) return;
    if (st.tokens.length >= MAX_TOKENS) { announce('הפסוק ארוך מדי. מחקו סמל לפני שמוסיפים עוד.'); return; }
    st.tokens.push(tok); st.bad = false;
    renderSent(i);
  }
  function check1() {
    const lines = [];
    let allOk = true, failed = false;
    ex.sentences.forEach((_, i) => {
      const st = S.sent[i];
      const who = nS > 1 ? `המשפט של ${esc(sName(i))}: ` : '';
      if (st.ok) { lines.push({ k: 'ok', html: `${who}הפסוק נכון.` }); return; }
      const r = checkFormula(ex, i, st.tokens);
      if (r.ok) { st.ok = true; st.bad = false; lines.push({ k: 'ok', html: `${who}הפסוק נכון.` }); return; }
      allOk = false; st.bad = true;
      let msg;
      if (r.reason === 'empty') { msg = 'עוד לא נבנה פסוק.'; if (COUNT_INCOMPLETE_AS_WRONG) failed = true; }
      else if (r.reason === 'syntax') { msg = `הפסוק לא שלם. פסוק כאן בנוי משני חלקים (משתנה, ואפשר גם ${ltr('¬')} לפניו) עם קשר אחד ביניהם.`; if (COUNT_INCOMPLETE_AS_WRONG) failed = true; }
      else if (r.reason === 'op') { msg = 'החלקים נכונים, אבל הקשר ביניהם לא. שימו לב למילת הקישור במשפט: "וגם" או "או".'; failed = true; }
      else { msg = `אחד החלקים לא מתאים. בדקו את השלילות (${ltr('¬')}) ואת המשתנה שבכל חלק.`; failed = true; }
      lines.push({ k: 'bad', html: who + msg });
    });
    ex.sentences.forEach((_, i) => renderSent(i));
    if (allOk) { showFb(1, [{ k: 'ok', html: nS > 1 ? 'כל הפסוקים נכונים.' : 'הפסוק נכון.' }]); completeStage(1); return; }
    showFb(1, lines);
    announce(lines.map(l => l.html.replace(/<[^>]+>/g, '')).join(' '));
    if (failed) wrong();
  }

  // ================================================================ שלב 2
  function body2() {
    return `<p class="kn-lead">פרקו את הפסוק לחלקיו ושבצו כל חלק בעמודת הטבלה שהוא מתאר (עמודת זהות של דובר, עמודת עובדה חיצונית כמו נורית), לא בעמודת התוצאה, שמחושבת ולא מוזנת. את הפסוק השלם משבצים בעמודת הקביעה.</p>
      <p class="kn-lead">גררו חלק לעמודה, או בחרו חלק (לחיצה, או Enter / רווח במקלדת) ואז בחרו עמודה. חלק ששובץ לא נכון חוזר למקומו.</p>
      <div class="kn-s2">
        <div class="kn-tray" data-tray role="group" aria-label="חלקים לשיבוץ"></div>
        <div class="kn-cols" data-cols role="group" aria-label="עמודות הטבלה"></div>
      </div>
      <div class="kn-actions">${hintBlock(2)}</div>
      <div class="kn-fb" data-fb="2" role="status" aria-live="polite"></div>
      ${hintsHost(2)}`;
  }
  const chipEl = id => q(`.kn-chip[data-chip="${id}"]`);
  function chipHtml(c) {
    const sel = S.selected === c.id;
    const whole = c.kind === 'whole';
    return `<div class="kn-chip ${whole ? 'kn-whole' : 'kn-part'}${sel ? ' is-selected' : ''}" role="button" tabindex="0" draggable="true" aria-pressed="${sel}" data-chip="${c.id}" data-fk="chip-${c.id}"
      aria-label="${whole ? 'הפסוק כולו' : 'חלק מהפסוק'} ${esc(iso(c.text))}${nS > 1 ? `, של ${esc(sName(c.sentence))}` : ''}">
      <span class="kn-chip-text" dir="ltr">${esc(c.text)}</span><span class="kn-chip-kind">${whole ? 'פסוק שלם' : 'חלק'}</span></div>`;
  }
  function placedHtml(c) {
    return `<span class="kn-placed"><span class="kn-chip-text" dir="ltr">${esc(c.text)}</span>${nS > 1 ? `<span class="kn-chip-kind">${esc(sName(c.sentence))}</span>` : ''}</span>`;
  }
  function colHtml(col) {
    const here = CHIPS.filter(c => S.placed[c.id] === col.id);
    const isVar = col.kind === 'var';
    const sub = isVar ? `${personOf(ex, col.v) ? 'זהות' : 'עובדה'} · ${ltr(col.v)}` : 'תוצאה מחושבת';
    const label = `עמודת ${col.name}${here.length ? `. שובצו בה: ${here.map(c => iso(c.text)).join(', ')}` : ''}. ${S.selected ? 'לחצו כדי לשבץ כאן את החלק הנבחר' : 'בחרו קודם חלק לשיבוץ'}`;
    return `<div class="kn-col ${isVar ? 'kn-col-var' : 'kn-col-det'}" data-col="${col.id}">
      <div class="kn-col-head"><span class="kn-col-name">${esc(col.name)}</span><span class="kn-col-sub">${sub}</span></div>
      <button type="button" class="kn-drop" data-act="drop" data-col="${col.id}" data-fk="col-${col.id}" aria-label="${esc(label)}">
        ${here.map(placedHtml).join('')}${here.length ? '' : `<span class="kn-drop-ph">${S.selected ? 'לחצו כאן לשיבוץ' : 'גררו לכאן'}</span>`}
      </button></div>`;
  }
  function renderS2(focusKey) {
    const trayEl = q('[data-tray]'), colsEl = q('[data-cols]');
    if (!trayEl || !colsEl) return;
    const rest = CHIPS.filter(c => !S.placed[c.id]);
    trayEl.innerHTML = rest.length
      ? ex.sentences.map((_, i) => {
        const arr = rest.filter(c => c.sentence === i);
        return arr.length ? `<div class="kn-tray-group">${nS > 1 ? `<span class="kn-tray-who">${esc(sName(i))}:</span>` : ''}${arr.map(chipHtml).join('')}</div>` : '';
      }).join('')
      : '<span class="kn-tray-empty">כל החלקים שובצו.</span>';
    colsEl.classList.toggle('is-armed', !!S.selected);
    colsEl.innerHTML = COLS.map(colHtml).join('');
    if (focusKey) { const el = q(`[data-fk="${focusKey}"]`); if (el) el.focus({ preventScroll: true }); }
  }
  function selectChip(id, viaKey) {
    if (S.placed[id]) return;
    S.selected = S.selected === id ? null : id;
    const c = CHIPS.find(x => x.id === id);
    renderS2(S.selected && viaKey ? `col-${COLS[0].id}` : `chip-${id}`);
    showFb(2, []);
    announce(S.selected ? `נבחר ${c.text}. בחרו עמודה לשיבוץ.` : 'הבחירה בוטלה.');
  }
  function dropReason(chip, col) {
    if (chip.kind === 'part') return col.kind === 'det' ? 'חלק מתאר זהות או עובדה, לא תוצאה.' : 'החלק מדבר על משהו אחר. בדקו על מי או על מה הוא מדבר.';
    return col.kind === 'var' ? 'הפסוק השלם הוא התוצאה, ולכן הוא שייך לעמודת הקביעה.' : 'זה הפסוק של דובר אחר.';
  }
  function tryPlace(chipId, colId) {
    const chip = CHIPS.find(c => c.id === chipId), col = COLS.find(c => c.id === colId);
    if (!chip || !col || S.placed[chipId]) return;
    if (placeChip(ex, chipId, colId)) {
      S.placed[chipId] = colId;
      S.selected = null;
      const left = CHIPS.filter(c => !S.placed[c.id]);
      showFb(2, left.length ? [{ k: 'ok', html: `${ltr(chip.text)} שובץ נכון בעמודה ${esc(col.name)}.` }] : []);
      announce(`${chip.text} שובץ נכון בעמודה ${col.name}.`);
      if (!left.length) {
        renderS2();
        completeStage(2);
      } else {
        const nextChip = left[0];
        renderS2(`chip-${nextChip.id}`);
      }
      return;
    }
    // שגוי: החלק חוזר למקומו (לא נעול), רעד והודעה קצרה
    S.selected = null;
    S.dragging = null;
    renderS2(`chip-${chipId}`);
    const el = chipEl(chipId), colNode = q(`.kn-col[data-col="${colId}"]`);
    if (el) { el.classList.add('is-rejected'); later(() => el.classList.remove('is-rejected'), 900); }
    if (colNode) { colNode.classList.add('is-rejected'); later(() => colNode.classList.remove('is-rejected'), 600); }
    const msg = `${ltr(chip.text)} חזר למקומו. ${dropReason(chip, col)}`;
    showFb(2, [{ k: 'bad', html: msg }]);
    announce(msg.replace(/<[^>]+>/g, ''));
    wrong();
  }

  // ================================================================ שלבים 3 ו-4: טבלאות
  const varHead = v => `<th scope="col">${esc(columnName(ex, v))}<span class="kn-th-sub">${esc(v)}</span></th>`;
  const valCell = b => `<td class="kn-val ${b ? 'is-t' : 'is-f'}">${tv(b)}</td>`;
  const wrapTable = (cap, html, cls = '') => `<div class="kn-tablewrap" role="region" aria-label="${esc(cap)} (אפשר לגלול הצידה)" tabindex="0"><table class="kn-table ${cls}"><caption class="kn-sr-only">${esc(cap)}</caption>${html}</table></div><p class="kn-scrollhint" data-scrollhint>הטבלה רחבה מהמסך: אפשר לגלול אותה הצידה.</p>`;
  const detKey = (n, i) => `${n}:${i}`;
  const cellState = v => (v === null ? 'ריק' : tv(v));

  function body3() {
    const method = `בכל שורה מניחים ערך ${heList(ex.vars.map(v => `ל־${ltr(v)}`))}, ומחשבים ${heList(ex.sentences.map((s, i) => ltr(`${sLabel(i)} = ${sentenceText(s)}`)), 'ו־')} לפי ההנחה.`;
    const head = `<thead>
      <tr><th rowspan="2" scope="col">שורה</th><th colspan="${nV}" scope="colgroup">מניחים</th><th colspan="${nS}" scope="colgroup">מחשבים</th></tr>
      <tr>${ex.vars.map(varHead).join('')}${ex.sentences.map((s, i) => `<th scope="col">${esc(s.col)}<span class="kn-th-sub kn-th-formula">${esc(`${sLabel(i)} = ${sentenceText(s)}`)}</span></th>`).join('')}</tr>
    </thead>`;
    const bodyRows = R.map(r => `<tr data-row="${r.n}"><th scope="row">${r.n}</th>${ex.vars.map(v => valCell(r.vals[v])).join('')}${ex.sentences.map((s, i) =>
      `<td><button type="button" class="kn-cell" data-act="det" data-row="${r.n}" data-i="${i}"></button></td>`).join('')}</tr>`).join('');
    return `<p class="kn-lead">לכל שורה בטבלה (כל שילוב אפשרי של אמת ושקר במשתנים) קבעו את ערך הפסוק שבניתם בשלב 1, ורשמו אותו בעמודת ${nS > 1 ? 'הקביעה של כל דובר' : 'הקביעה'}. לחיצה על תא מחליפה בין ריק, אמת ושקר.</p>
      <p class="kn-method"><b>השיטה:</b> ${method}</p>
      ${wrapTable('טבלת הקביעות', head + `<tbody>${bodyRows}</tbody>`)}
      <div class="kn-actions"><button type="button" class="kn-check" data-act="check3">בדיקה</button>${hintBlock(3)}</div>
      <div class="kn-fb" data-fb="3" role="status" aria-live="polite"></div>
      ${hintsHost(3)}`;
  }
  function refreshDetCell(btn) {
    const n = +btn.dataset.row, i = +btn.dataset.i, key = detKey(n, i);
    const v = S.dets[n][i];
    const locked = !!S.detLock[key], bad = !!S.detBad[key], need = !!S.detNeed[key];
    btn.className = `kn-cell ${v === null ? 'is-empty' : v ? 'is-t' : 'is-f'}${locked ? ' is-locked' : ''}${bad ? ' is-bad' : ''}${need ? ' is-need' : ''}`;
    btn.disabled = locked;
    btn.innerHTML = `${v === null ? '?' : tv(v)}${bad ? '<span class="kn-bang" aria-hidden="true">!</span>' : ''}`;
    btn.setAttribute('aria-label', `שורה ${n}, ${ex.sentences[i].col}: ${cellState(v)}${bad ? '. שגוי' : ''}${need ? '. חסר ערך' : ''}${locked ? '. נכון' : ''}`);
  }
  function refreshAllDet() { qa('.kn-cell').forEach(refreshDetCell); }
  function cycleDet(btn) {
    const n = +btn.dataset.row, i = +btn.dataset.i, key = detKey(n, i);
    if (S.detLock[key] || S.solved) return;
    const cur = S.dets[n][i];
    S.dets[n][i] = cur === null ? true : cur === true ? false : null;
    delete S.detBad[key]; delete S.detNeed[key];
    refreshDetCell(btn);
    announce(`שורה ${n}, ${ex.sentences[i].col}: ${cellState(S.dets[n][i])}`);
  }
  function check3() {
    const bad = checkDeterminations(ex, S.dets);
    const map = new Map(bad.map(b => [detKey(b.row, b.sentence), b]));
    let empties = 0; const badRows = new Set();
    R.forEach(r => ex.sentences.forEach((_, i) => {
      const key = detKey(r.n, i), b = map.get(key);
      delete S.detBad[key]; delete S.detNeed[key];
      if (!b) S.detLock[key] = true;
      else if (b.empty) { S.detNeed[key] = true; empties++; }
      else { S.detBad[key] = true; badRows.add(r.n); }
    }));
    refreshAllDet();
    if (!bad.length) { showFb(3, [{ k: 'ok', html: 'כל הקביעות נכונות.' }]); completeStage(3); return; }
    const lines = [];
    if (badRows.size) lines.push({ k: 'bad', html: `בשורות המסומנות (${[...badRows].join(', ')}) יש ערך שגוי. חשבו שוב את ${nS > 1 ? 'הפסוקים' : 'הפסוק'} לפי הערכים שהונחו באותה שורה.` });
    if (empties) lines.push({ k: badRows.size ? 'bad' : 'note', html: 'יש למלא את כל השורות.' });
    showFb(3, lines);
    announce(lines.map(l => l.html.replace(/<[^>]+>/g, '')).join(' '));
    if (badRows.size || (empties && COUNT_INCOMPLETE_AS_WRONG)) wrong();
  }

  function body4() {
    const head = `<thead>
      <tr><th rowspan="2" scope="col">שורה</th><th colspan="${nV}" scope="colgroup">מניחים</th>${ex.sentences.map((_, i) => `<th colspan="2" scope="colgroup">בדיקת ${esc(sName(i))}</th>`).join('')}<th rowspan="2" scope="col">מתאים?</th></tr>
      <tr>${ex.vars.map(varHead).join('')}${ex.sentences.map((s) => `<th scope="col">אמור (זהות)<span class="kn-th-sub">${esc(s.speaker)}</span></th><th scope="col">בפועל<span class="kn-th-sub">${esc(`${nS > 1 ? `S${s.speaker}` : 'S'}`)}</span></th>`).join('')}</tr>
    </thead>`;
    const bodyRows = T.map(r => `<tr data-row="${r.n}"><th scope="row">${r.n}</th>${ex.vars.map(v => valCell(r.vals[v])).join('')}${ex.sentences.map((_, i) => valCell(r.said[i]) + valCell(r.S[i])).join('')}
      <td class="kn-markcell"><button type="button" class="kn-mark" data-act="mark" data-row="${r.n}"></button></td></tr>`).join('');
    return `<p class="kn-lead">בדקו כל שורה בנפרד: השורה עקבית (✓) כשהערך שב"אמור (זהות)" שווה לערך שב"בפועל" (הקביעה), ${nS > 1 ? 'בשני הדוברים בו־זמנית' : 'ואחרת היא נפסלת (✗)'}. לחיצה על התא מחליפה בין ריק, ✓ ו־✗.</p>
      <p class="kn-rule"><b>חוק העקביות:</b> דובר אמין חייב לומר אמת, דובר נוכל חייב לומר שקר${nS > 1 ? '; בתרגיל עם שני דוברים שני התנאים צריכים להתקיים יחד' : ''}.</p>
      ${wrapTable('טבלת בדיקת העקביות', head + `<tbody>${bodyRows}</tbody>`, 'kn-t4')}
      <div class="kn-actions"><button type="button" class="kn-check" data-act="check4">בדיקה</button>${hintBlock(4)}</div>
      <div class="kn-fb" data-fb="4" role="status" aria-live="polite"></div>
      ${hintsHost(4)}
      <div data-conclusion aria-live="polite"></div>`;
  }
  const markGlyph = v => (v === null ? '?' : v ? '✓' : '✗');
  const markWord = v => (v === null ? 'ריק' : v ? 'עקבית' : 'לא עקבית');
  function refreshMark(btn) {
    const n = +btn.dataset.row;
    const v = S.marks[n];
    const locked = !!S.markLock[n], bad = !!S.markBad[n], need = !!S.markNeed[n];
    const sol = S.solved && solution.n === n;
    btn.className = `kn-mark ${v === null ? 'is-empty' : v ? 'is-t' : 'is-f'}${locked && !S.solved ? ' is-locked' : ''}${bad ? ' is-bad' : ''}${need ? ' is-need' : ''}${sol ? ' is-solution' : ''}`;
    btn.disabled = locked;
    btn.innerHTML = `${markGlyph(v)}${bad ? '<span class="kn-bang" aria-hidden="true">!</span>' : ''}`;
    btn.setAttribute('aria-label', `שורה ${n}, מתאים: ${markWord(v)}${bad ? '. שגוי' : ''}${need ? '. חסר סימון' : ''}${locked ? '. נכון' : ''}`);
  }
  function refreshAllMarks() { qa('.kn-mark').forEach(refreshMark); }
  function cycleMark(btn) {
    const n = +btn.dataset.row;
    if (S.markLock[n] || S.solved) return;
    const cur = S.marks[n];
    S.marks[n] = cur === null ? true : cur === true ? false : null;
    delete S.markBad[n]; delete S.markNeed[n];
    refreshMark(btn);
    announce(`שורה ${n}: ${markWord(S.marks[n])}`);
  }
  function check4() {
    const bad = checkConsistency(ex, S.marks);
    const map = new Map(bad.map(b => [b.row, b]));
    let empties = 0; const badRows = [];
    R.forEach(r => {
      const b = map.get(r.n);
      delete S.markBad[r.n]; delete S.markNeed[r.n];
      if (!b) S.markLock[r.n] = true;
      else if (b.empty) { S.markNeed[r.n] = true; empties++; }
      else { S.markBad[r.n] = true; badRows.push(r.n); }
    });
    if (!bad.length) { finish(); return; }
    refreshAllMarks();
    const lines = [];
    if (badRows.length) lines.push({ k: 'bad', html: `בשורות המסומנות (${badRows.join(', ')}) הבדיקה שגויה. השוו בין "אמור" ל"בפועל" ${nS > 1 ? 'אצל כל אחד מהדוברים' : 'באותה שורה'}.` });
    if (empties) lines.push({ k: badRows.length ? 'bad' : 'note', html: 'יש לסמן ✓ או ✗ בכל שורה.' });
    showFb(4, lines);
    announce(lines.map(l => l.html.replace(/<[^>]+>/g, '')).join(' '));
    if (badRows.length || (empties && COUNT_INCOMPLETE_AS_WRONG)) wrong();
  }
  function finish() {
    if (S.solved) return;
    S.solved = true;
    refreshAllMarks();
    const row = q(`.kn-table tr[data-row="${solution.n}"]`, stageEl(4));
    if (row) row.classList.add('is-solution');
    showFb(4, []);
    const slot = q('[data-conclusion]', stageEl(4));
    if (slot) slot.innerHTML = `<div class="kn-conclusion"><div class="kn-box-label">מסקנה</div><p>${ex.conclusion}</p></div>`;
    completeStage(4);
    announce(`שורה ${solution.n} היא העקבית היחידה. ${String(ex.conclusion).replace(/<[^>]+>/g, '').replace(/[\u2066-\u2069]/g, '')}`);
    api.solved();
  }

  // ================================================================ אירועים (האצלה על המכל)
  const onClick = e => {
    const chip = e.target.closest('.kn-chip[data-chip]');
    if (chip && container.contains(chip)) { selectChip(chip.dataset.chip, false); return; }
    const el = e.target.closest('[data-act]');
    if (!el || !container.contains(el)) return;
    const act = el.dataset.act;
    if (act === 'tok') addToken(+el.dataset.i, el.dataset.tok);
    else if (act === 'back') { const st = S.sent[+el.dataset.i]; if (!st.ok) { st.tokens.pop(); st.bad = false; renderSent(+el.dataset.i); } }
    else if (act === 'clear') { const st = S.sent[+el.dataset.i]; if (!st.ok) { st.tokens = []; st.bad = false; renderSent(+el.dataset.i); } }
    else if (act === 'check1') check1();
    else if (act === 'drop') {
      if (!S.selected) { showFb(2, [{ k: 'note', html: 'בחרו קודם חלק לשיבוץ: לחיצה על החלק, או Enter כשהוא בפוקוס. אפשר גם לגרור.' }]); announce('בחרו קודם חלק לשיבוץ.'); }
      else tryPlace(S.selected, el.dataset.col);
    }
    else if (act === 'det') cycleDet(el);
    else if (act === 'check3') check3();
    else if (act === 'mark') cycleMark(el);
    else if (act === 'check4') check4();
    else if (act === 'hint') { if (el.getAttribute('aria-disabled') !== 'true') revealHint(+el.dataset.stage); }
    else if (act === 'toggle') {
      const k = +el.dataset.stage;
      S.open[k] = !S.open[k];
      refreshStage(k);
    }
  };
  const onKeydown = e => {
    const chip = e.target.closest && e.target.closest('.kn-chip[data-chip]');
    if (chip && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) { e.preventDefault(); selectChip(chip.dataset.chip, true); return; }
    if (e.key === 'Escape' && S.selected) {
      const prev = S.selected;
      S.selected = null;
      renderS2(`chip-${prev}`);
      announce('הבחירה בוטלה.');
    }
  };
  // גרירה (HTML5, שולחן עבודה). במגע ובמקלדת: בחירה ואז עמודה.
  const onDragStart = e => {
    const chip = e.target.closest && e.target.closest('.kn-chip[data-chip]');
    if (!chip) return;
    S.dragging = chip.dataset.chip;
    try { e.dataTransfer.setData('text/plain', S.dragging); e.dataTransfer.effectAllowed = 'move'; } catch (_) { /* ignore */ }
    later(() => { const c = chipEl(S.dragging); if (c) c.classList.add('is-dragging'); }, 0);
  };
  const clearOver = () => qa('.kn-col.is-over').forEach(c => c.classList.remove('is-over'));
  const onDragEnd = () => { qa('.kn-chip.is-dragging').forEach(c => c.classList.remove('is-dragging')); clearOver(); S.dragging = null; };
  const onDragOver = e => {
    const col = e.target.closest && e.target.closest('.kn-col');
    if (!col || !S.dragging) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (_) { /* ignore */ }
    if (!col.classList.contains('is-over')) { clearOver(); col.classList.add('is-over'); }
  };
  const onDragLeave = e => {
    const col = e.target.closest && e.target.closest('.kn-col');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('is-over');
  };
  const onDrop = e => {
    const col = e.target.closest && e.target.closest('.kn-col');
    if (!col) return;
    e.preventDefault();
    let id = S.dragging;
    if (!id) { try { id = e.dataTransfer.getData('text/plain'); } catch (_) { id = null; } }
    clearOver();
    S.dragging = null;
    if (id) tryPlace(id, col.dataset.col);
  };
  window.addEventListener('resize', updateScrollHints);
  container.addEventListener('click', onClick);
  container.addEventListener('keydown', onKeydown);
  container.addEventListener('dragstart', onDragStart);
  container.addEventListener('dragend', onDragEnd);
  container.addEventListener('dragover', onDragOver);
  container.addEventListener('dragleave', onDragLeave);
  container.addEventListener('drop', onDrop);

  // ---- התחלה: שלב 1 פעיל, האחרים נעולים
  [4, 3, 2].forEach(refreshStage);
  activate(1);

  return function dispose() {
    window.removeEventListener('resize', updateScrollHints);
    container.removeEventListener('click', onClick);
    container.removeEventListener('keydown', onKeydown);
    container.removeEventListener('dragstart', onDragStart);
    container.removeEventListener('dragend', onDragEnd);
    container.removeEventListener('dragover', onDragOver);
    container.removeEventListener('dragleave', onDragLeave);
    container.removeEventListener('drop', onDrop);
    timers.forEach(clearTimeout);
    timers.clear();
  };
}
