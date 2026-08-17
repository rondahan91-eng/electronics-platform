// ==========================================================================
// svgUtils.js - עזרי SVG משותפים לכל רינדררי הנושאים (circuitRenderer.js,
// chargeRenderer.js וכל נושא עתידי) - מונע כפילות של באגים שכבר תוקנו.
// ==========================================================================

let pid = 0;
export function resetPid() { pid = 0; }
export function nextPid() { return 'p' + (++pid); }

// שימו לב: filterUnits="userSpaceOnUse" עם תחום קבוע (במקום האחוזים המחושבים
// כברירת מחדל לפי ה-bounding box של האלמנט) - חיוני כאן כי לחוטים/קווים
// אנכיים/אופקיים טהורים יש bounding box עם מימד אחד = 0 (רוחב או גובה), מה
// שהופך את תחום הפילטר האחוזי לבלתי-קיים (220%×0=0) וגורם לקו כולו "להיעלם".
export const GLOW_FILTERS = `
      <filter id="glow" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="4000" height="4000">
        <feGaussianBlur stdDeviation="2.6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="dotglow" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="4000" height="4000">
        <feGaussianBlur stdDeviation="2.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`;

// תווית עם "לוחית" רקע כהה מאחוריה - כדי שתישאר קריאה גם כשקו זוהר או
// אלמנט נע עובר מתחתיה (רוחב מוערך לפי מונוספייס, בלי תלות ב-DOM).
export function labelPlate(x, y, text, { fontSize = 11, anchor = 'middle' } = {}) {
  const charW = fontSize * 0.62;
  const w = text.length * charW + 10;
  const h = fontSize + 9;
  let rx = x - w / 2;
  if (anchor === 'start') rx = x;
  else if (anchor === 'end') rx = x - w;
  const ry = y - h * 0.62;
  return `<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="4" fill="#080b16" fill-opacity="0.86"/>`;
}
export function labeledText(x, y, text, cls, opts = {}) {
  const anchor = opts.anchor || 'middle';
  const fontSize = opts.fontSize || (cls === 'comp-label' ? 12 : 11);
  const plate = labelPlate(x, y, text, { fontSize, anchor });
  return `${plate}<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}">${text}</text>`;
}
