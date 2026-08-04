// ==========================================================================
// home.js - מסך הבית של התלמיד/ה: תוכנית הלימודים של השכבה שלו/ה כרשימת
// נושאים מסודרת, נעולים/פתוחים לפי קצב ההתקדמות של השכבה (נקבע ע"י המורה).
// ==========================================================================
import { curriculumForGrade } from './curriculum.js';
import { mountTopic } from './game/gameEngine.js';
import { fetchMyProgress, fetchGrades } from './api.js';
import { CONFIG } from './config.js';
import { topbarHtml, wireLogout, toast } from './ui.js';
import { playClick } from './game/audio.js';

export async function mountHome(app, session, onLogout) {
  const topics = curriculumForGrade(session.grade);
  let progress = {};
  let unlockedCount = 1;

  try {
    progress = await fetchMyProgress(session.studentId);
  } catch (e) { toast('שגיאה בטעינת התקדמות: ' + e.message, true); }
  try {
    const grades = await fetchGrades();
    const g = grades.find(g => g.grade === session.grade);
    if (g) unlockedCount = g.unlockedCount;
  } catch (e) { toast('שגיאה בטעינת שכבה: ' + e.message, true); }

  render();

  function render() {
    const cards = topics.length ? topics.map((topic, i) => {
      const locked = i >= unlockedCount;
      const tp = progress[topic.id] || { highestLevel: 0 };
      const done = tp.highestLevel >= topic.totalLevels;
      const started = tp.highestLevel > 0;
      const cls = ['level-node'];
      if (locked) cls.push('locked');
      if (done) cls.push('done');
      if (!locked && !done) cls.push('current');
      return `
      <div class="${cls.join(' ')}" data-topic="${topic.id}" style="aspect-ratio:auto;padding:18px;text-align:right;align-items:flex-start;">
        <div style="display:flex;align-items:center;gap:8px;width:100%;">
          <span class="dot" style="background:${topic.color};color:${topic.color}"></span>
          <b style="font-size:16px;">${topic.title}</b>
          ${done ? '<span class="check">✅</span>' : ''}
        </div>
        <p style="color:var(--text-1);font-size:13px;margin:6px 0;font-weight:400;">${topic.subtitle || ''}</p>
        <span class="badge">${locked ? '🔒 ייפתח בהמשך השנה' : done ? 'הושלם — ' + topic.totalLevels + '/' + topic.totalLevels : started ? `בתהליך — ${tp.highestLevel}/${topic.totalLevels}` : 'פתוח לתרגול'}</span>
      </div>`;
    }).join('') : `<div class="center-msg">אין עדיין תוכנית לימודים מוגדרת לשכבה שלך.</div>`;

    app.innerHTML = `
      ${topbarHtml(session, 'תוכנית הלימודים')}
      <div class="map-wrap">
        <div class="glass" style="padding:20px 24px;margin-bottom:24px;">
          <h1 class="neon-title" style="font-size:22px;">📚 נושאי הלימוד שלי — כיתה ${session.grade || ''}</h1>
          <p style="color:var(--text-1);margin:0;">לחצו על נושא פתוח כדי להתחיל לתרגל. נושאים נוספים ייפתחו בהמשך השנה, בהתאם לקצב הלמידה בכיתה.</p>
        </div>
        <div class="tier-block">
          <div class="level-grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr));">${cards}</div>
        </div>
      </div>
      <footer class="foot">${CONFIG.APP_NAME} ⚡ סימולטור למידה אינטראקטיבי</footer>`;

    wireLogout(onLogout);
    app.querySelectorAll('.level-node:not(.locked)').forEach(n => {
      n.addEventListener('click', () => {
        playClick();
        const topic = topics.find(t => t.id === n.dataset.topic);
        if (topic) mountTopic(app, session, topic, () => mountHome(app, session, onLogout), onLogout);
      });
    });
  }
}
