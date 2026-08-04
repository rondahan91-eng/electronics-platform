# מפת דרכים - חלוקת עבודה לרבדים

הפרויקט מחולק ל-4 רבדי עבודה עצמאיים, כל אחד ב-branch נפרד. אפשר לעבוד על
כמה רבדים במקביל כי הם נוגעים בחלקים שונים של הקוד.

## 1. `infra/apps-script-deploy` — תשתית ופריסה אמיתית
כרגע הכל רץ במצב DEV MODE (סימולציה ב-localStorage, ראו [js/api.js](js/api.js)).
- [ ] פריסת [backend/Code.gs](backend/Code.gs) כ-Web App אמיתי על Google Apps Script
- [ ] יצירת Google Sheet מחובר ואימות שהגיליונות (`Users`, `LevelProgress`, `Grades`) נוצרים נכון אוטומטית
- [ ] עדכון `API_URL` ב-[js/config.js](js/config.js) ובדיקת כל הפעולות מול השרת האמיתי (לא רק דמו מקומי)
- [ ] בחירת אירוח סטטי לפרונט (GitHub Pages / Google Sites / שרת בית הספר)

## 2. `content/new-topics` — הרחבת תוכן
כרגע יש רק שכבה אחת ('י') עם 4 נושאי חשמל (ראו [js/curriculum.js](js/curriculum.js)).
- [ ] הוספת שכבות נוספות (יא, יב) ל-`CURRICULA`
- [ ] נושאים חדשים מעבר לחשמל (לוגיקה דיגיטלית, תכנות) - דורש מנוע תרגול ייעודי חדש לכל נושא, בהשראת [js/game/circuitEngine.js](js/game/circuitEngine.js)
- [ ] סנכרון תוכן `CURRICULUM_TOPIC_COUNTS` בין [js/curriculum.js](js/curriculum.js) ל-[backend/Code.gs](backend/Code.gs) (כרגע ידני - אולי כדאי מקור אמת יחיד)

## 3. `feature/teacher-tools` — כלי מורה מתקדמים
- [ ] עריכה/מחיקה של תלמידים קיימים מהדשבורד ([js/dashboard.js](js/dashboard.js))
- [ ] ריבוי כיתות מקבילות באותה שכבה (כרגע כל השכבה מתקדמת יחד)
- [ ] דוחות/ייצוא נתונים (CSV/Excel) של התקדמות התלמידים
- [ ] תצוגת פירוט לפי שלב בודד (לא רק ממוצעים)

## 4. `security/hardening` — חיזוק אבטחה
- [ ] Salting לסיסמאות (כרגע SHA-256 ללא salt, ראו [backend/Code.gs](backend/Code.gs))
- [ ] הגבלת קצב ניסיונות התחברות (rate limiting)
- [ ] מדיניות סיסמאות (אורך מינימלי אכיף, לא רק `minlength` בצד לקוח)

---
כל שורה עם `[ ]` היא משימה קונקרטית - אפשר להפוך אותה ל-GitHub Issue בקלות
(העתק/הדבק את הטקסט + שם ה-branch הרלוונטי כתווית).
