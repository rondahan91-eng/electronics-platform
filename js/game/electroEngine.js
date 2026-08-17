// ==========================================================================
// electroEngine.js - מנוע פיזיקלי לחוק קולון ושדה חשמלי (מטען, כוח ושדה).
// כל החישובים הפנימיים ביחידות SI (קולון, מטר) - הרמות ממירות מ-µC/ס"מ.
// ==========================================================================

export const KC = 9e9;  // מקדם קולון (N·m²/C²), מעוגל כנהוג בתוכנית הלימודים
export const UC = 1e-6; // מכפיל: מיקרו-קולון → קולון
export const CM = 1e-2; // מכפיל: ס"מ → מטר

/** גודל הכוח בין שני מטענים נקודתיים במרחק r (חוק קולון, גודל בלבד). */
export function coulombForceMagnitude(q1C, q2C, rM) {
  return KC * Math.abs(q1C * q2C) / (rM * rM);
}

/**
 * כוח קולון *עם סימן*, לפי הקונבנציה הפיזיקלית המקובלת: חיובי = דחייה
 * (מטענים באותו סימן), שלילי = משיכה (מטענים מנוגדים) - הסימן יוצא ישירות
 * מסימן המכפלה q1·q2, בלי צורך בגיאומטריה/מיקומים.
 */
export function coulombForceSigned(q1C, q2C, rM) {
  return KC * q1C * q2C / (rM * rM);
}

/** גודל השדה החשמלי במרחק r ממטען בודד q. */
export function electricField(qC, rM) {
  return KC * Math.abs(qC) / (rM * rM);
}

/** היפוך חוק קולון: המרחק הדרוש כדי לקבל כוח נתון בין שני מטענים נתונים. */
export function distanceForForce(q1C, q2C, forceN) {
  return Math.sqrt(KC * Math.abs(q1C * q2C) / forceN);
}

/**
 * כוח וקטורי (בניוטון) שמפעיל מטען-מקור בודד qSourceC (במיקום sourcePos,
 * מטרים) על מטען-מבחן qTestC הנמצא ב-testPos. הכיוון מחושב ישירות מהנוסחה
 * הווקטורית F = kC·q1·q2·(r⃗)/|r|³ - כך שסימני המטענים כבר קובעים דחייה/משיכה.
 */
export function pairForce(qSourceC, sourcePos, qTestC, testPos) {
  const dx = testPos.x - sourcePos.x;
  const dy = testPos.y - sourcePos.y;
  const r2 = dx * dx + dy * dy;
  const r = Math.sqrt(r2);
  const coeff = KC * qSourceC * qTestC / (r2 * r);
  return { fx: coeff * dx, fy: coeff * dy, r };
}

/** עיקרון הסופרפוזיציה: סכימה וקטורית של הכוח על מטען מבחן ממספר מקורות. */
export function netForce(sources, qTestC, testPos) {
  let fx = 0, fy = 0;
  sources.forEach(s => {
    const f = pairForce(s.q, { x: s.x, y: s.y }, qTestC, testPos);
    fx += f.fx;
    fy += f.fy;
  });
  const magnitude = Math.hypot(fx, fy);
  const angleDeg = Math.atan2(fy, fx) * 180 / Math.PI;
  return { fx, fy, magnitude, angleDeg };
}
