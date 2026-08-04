# ⚡ מסע הזרם — סימולטור למידה אינטראקטיבי

משחק רשת חינוכי ללימוד תורת החשמל והאלקטרוניקה, עם מנוע פיזיקלי אמיתי (פותר מעגלים
טוריים/מקביליים/מעורבים, כולל AC ומגברי שרת), 50 שלבים עולים בקושי, מערכת
משתמשים (תלמיד/מורה) ופאנל ניהול למורה.

## מבנה הפרויקט

```
index.html              נקודת הכניסה
css/style.css           עיצוב Dark/Neon
js/config.js            הגדרות גלובליות (כולל כתובת ה-API)
js/api.js               שכבת תקשורת מול השרת + מצב פיתוח מקומי
js/ui.js                רכיבי ממשק משותפים
js/auth.js              מסך התחברות
js/dashboard.js         פאנל ניהול למורה
js/main.js              ניתוב בין המסכים
js/game/circuitEngine.js    פותר המעגלים (Ohm/Kirchhoff/AC מרוכב)
js/game/levelGenerator.js   יצירת 50 השלבים
js/game/circuitRenderer.js  רינדור SVG + אנימציות
js/game/gameEngine.js       מפת שלבים + מסך משחק + לוגיקת שריפה
js/game/audio.js            חיווי קולי (Web Audio API)
backend/Code.gs          קוד השרת ל-Google Apps Script
```

## הרצה מקומית מיידית (ללא שרת)

האפליקציה כוללת **מצב פיתוח מקומי** שמדמה את ה-API באמצעות `localStorage`, כדי
שאפשר יהיה לבדוק הכל בלי לפרוס שום דבר. חשוב: יש להריץ מתוך שרת HTTP מקומי
(לא לפתוח את `index.html` ישירות כקובץ), כי הדפדפן חוסם ES Modules ב-`file://`.

```bash
py -m http.server 8000
```

ואז לפתוח `http://localhost:8000`.

משתמשי ברירת מחדל במצב הפיתוח:
- **מורה/ניהול:** `admin` / `admin123`
- **תלמיד/ה לדוגמה:** `demo` / `demo1234`

## חיבור לשרת אמיתי (Google Apps Script + Google Sheets)

1. פתחו [sheets.google.com](https://sheets.google.com) וצרו גיליון חדש (למשל "מסע הזרם - נתונים").
2. בתפריט **הרחבות ← Apps Script** יפתח עורך הסקריפטים המחובר לגיליון.
3. מחקו את התוכן שבקובץ `Code.gs` שנפתח כברירת מחדל, והדביקו במקומו את התוכן
   המלא של [`backend/Code.gs`](backend/Code.gs) מתוך הפרויקט הזה.
4. לחצו **פריסה (Deploy) ← פריסה חדשה (New deployment)**.
   - סוג: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (כדי שהאפליקציה תוכל לקרוא לשרת ללא התחברות Google)
5. אשרו הרשאות, ואז העתיקו את כתובת ה-**Web app URL** שמתקבלת (מסתיימת ב-`/exec`).
6. הדביקו את הכתובת בשדה `API_URL` בקובץ [`js/config.js`](js/config.js):
   ```js
   API_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
   ```
7. בפעם הראשונה שקוראים לשרת, הוא ייצור אוטומטית שני גיליונות (`Users`,
   `LevelProgress`) עם משתמשי ברירת מחדל זהים לאלו של מצב הפיתוח (`admin`/`admin123`,
   `demo`/`demo1234`) — **מומלץ להחליף את סיסמת המורה מיד** דרך פאנל הניהול.
8. פרסמו את התיקייה (index.html + css/ + js/) לכל אירוח סטטי (GitHub Pages,
   Google Sites, שרת בית הספר, או הטמעה כ-iframe בפטל/מודל).

### עדכון פריסה קיימת
כל שינוי בקוד ה-`Code.gs` דורש **Manage deployments ← Edit ← New version** כדי
שהשינויים ייכנסו לתוקף (Apps Script לא מעדכן פריסות קיימות אוטומטית).

## אבטחה - הערה חשובה

הסיסמאות נשמרות בגיליון כגיבוב SHA-256 בלבד (לא כטקסט גלוי), והתעבורה מוצפנת
דרך HTTPS. עם זאת, זהו פתרון אימות פשוט המתאים לכלי כיתתי פנימי — אין בו
salting, הגבלת קצב ניסיונות (rate limiting) או ניהול הרשאות מתקדם, ואינו מיועד
לאחסון מידע רגיש. לשימוש בסביבה בעלת דרישות אבטחה גבוהות יותר יש להוסיף שכבות
הגנה נוספות (למשל Firebase Auth).

## הרחבת שכבת ה-API

בקובץ `js/api.js` מוגדרות הפעולות המרכזיות:

| פונקציה | תיאור |
|---|---|
| `authenticateUser(user, pass)` | אימות התחברות, מחזיר תפקיד (student/admin) |
| `fetchClassProgress()` | טבלת התקדמות כל התלמידים (למורה) |
| `createNewStudent(user, pass, displayName)` | יצירת תלמיד חדש |
| `updateStudentPassword(studentId, newPass)` | עדכון סיסמה לתלמיד קיים |
| `saveLevelResult(studentId, levelId, result)` | שמירת תוצאת שלב (הצלחה/פסילה/זמן) |
| `fetchMyProgress(studentId)` | טעינת התקדמות אישית בכניסה למשחק |

כל הפונקציות אורזות את הבקשה כ-JSON ושולחות `POST` יחיד ל-`Code.gs`
(עם `action` ו-`payload`), כדי להימנע מ-CORS preflight מול Apps Script.
