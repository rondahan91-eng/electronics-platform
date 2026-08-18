// ==========================================================================
// home.js - מסך הבית של התלמיד/ה: פרקים→תת-נושאים לפי תוכנית הלימודים
// הרשמית (syllabus.js). המורה חושף פרקים; רק פרקים חשופים מוצגים כאן -
// לא עוד "רשימת נושאים שטוחה" עם unlockedCount.
// ==========================================================================
import { SYLLABUS, chapterKey, chapterHasPractice } from './syllabus.js';
import { TOPICS } from './curriculum.js';
import { mountTopic } from './game/gameEngine.js';
import { fetchMyProgress, fetchGrades } from './api.js';
import { CONFIG } from './config.js';
import { shellHtml, wireShell, toast, escapeHtml } from './ui.js';
import { playClick } from './game/audio.js';

export async function mountHome(app, session, onLogout) {
  let progress = {};
  let revealedSet = new Set();
  let expandedKey = null;

  try {
    progress = await fetchMyProgress(session.studentId);
  } catch (e) { toast('שגיאה בטעינת התקדמות: ' + e.message, true); }
  try {
    const grades = await fetchGrades();
    const g = grades.find(g => g.grade === session.grade);
    if (g) revealedSet = new Set(g.revealed || []);
  } catch (e) { toast('שגיאה בטעינת שכבה: ' + e.message, true); }

  render();

  // כמה מתוך שלבי תת-הנושא (levelStart..levelEnd באותו topic) פתורים בפועל.
  function subDoneTotal(sub) {
    const topicProg = progress[sub.topicId];
    let done = 0;
    for (let id = sub.levelStart; id <= sub.levelEnd; id++) {
      if (topicProg && topicProg.levels && topicProg.levels[id] && topicProg.levels[id].solved) done++;
    }
    return { done, total: sub.total };
  }

  function chapterStatus(item) {
    if (!chapterHasPractice(item)) {
      return { badge: 'חומר עיוני', bg: 'var(--px-paper-sunken)', fg: 'var(--px-ink-muted)', done: 0, total: 0 };
    }
    let done = 0, total = 0;
    item.subs.forEach(sb => {
      if (!sb.topicId) return;
      const dt = subDoneTotal(sb);
      done += dt.done; total += dt.total;
    });
    const complete = total > 0 && done >= total;
    const started = done > 0;
    const badge = complete ? 'הושלם' : started ? 'בתהליך' : 'פתוח לתרגול';
    const bg = complete ? 'var(--px-mint)' : started ? 'var(--px-sky-soft)' : 'var(--px-paper-sunken)';
    const fg = complete ? 'var(--px-brand-deep)' : started ? 'var(--px-sky-ink)' : 'var(--px-ink-soft)';
    return { badge, bg, fg, done, total };
  }

  function subtopicRowHtml(item, sb) {
    if (!sb.topicId) {
      return `
      <div class="subtopic-row">
        <span class="subtopic-n">${sb.n}</span>
        <span class="subtopic-title muted">${sb.title}</span>
        <span class="subtopic-meta muted">עיוני</span>
      </div>`;
    }
    const { done, total } = subDoneTotal(sb);
    const pct = total ? Math.round((done / total) * 100) : 0;
    return `
    <button type="button" class="subtopic-row clickable" data-topic="${sb.topicId}" data-start="${sb.levelStart}" data-end="${sb.levelEnd}"
      data-chapter-n="${item.n}" data-chapter-title="${escapeHtml(item.title)}" data-sub-n="${escapeHtml(sb.n)}" data-sub-title="${escapeHtml(sb.title)}" data-color="${item.color || 'var(--px-brand)'}">
      <span class="subtopic-n">${sb.n}</span>
      <span class="subtopic-title">${sb.title}</span>
      <span class="subtopic-meta">${done}/${total}</span>
      <span class="subtopic-progress">
        <span class="subtopic-bar-track"><span class="subtopic-bar-fill" style="background:${item.color || 'var(--px-brand)'};width:${pct}%;"></span></span>
        <span class="subtopic-arrow">←</span>
      </span>
    </button>`;
  }

  function chapterCardHtml(sec, item) {
    const key = chapterKey(sec.key, item.n);
    const expanded = expandedKey === key;
    const status = chapterStatus(item);
    const subsHtml = item.subs && item.subs.length
      ? item.subs.map(sb => subtopicRowHtml(item, sb)).join('')
      : `<div class="subtopic-row"><span class="subtopic-title muted">אין עדיין פירוט תת-נושאים לפרק הזה</span></div>`;
    const countLabel = status.total ? `${status.done}/${status.total} שלבים` : (item.h ? `${item.h} שעות` : 'ניסוי מעבדה');
    return `
    <div class="chapter-card">
      <div class="chapter-spine" style="background:${item.color || 'var(--px-hairline)'};"></div>
      <div class="chapter-body">
        <button type="button" class="chapter-head${expanded ? ' open' : ''}" data-chapter="${key}">
          <span class="chapter-n">פרק ${item.n}</span>
          <b class="chapter-title">${item.title}</b>
          <span class="chapter-badge" style="background:${status.bg};color:${status.fg};">${status.badge}</span>
          <span class="chapter-count">${countLabel}</span>
          <span class="chapter-caret">⌄</span>
        </button>
        ${expanded ? `<div class="chapter-subs">${subsHtml}</div>` : ''}
      </div>
    </div>`;
  }

  function render() {
    const revealedItems = [];
    let totalChapters = 0;
    const sectionsHtml = SYLLABUS.map(sec => {
      totalChapters += sec.items.length;
      const items = sec.items.filter(it => revealedSet.has(chapterKey(sec.key, it.n)));
      items.forEach(it => revealedItems.push(it));
      if (!items.length) return '';
      return `
      <div class="syllabus-section">
        <div class="section-head-row">
          <b>${sec.grade}</b><span>${sec.part}</span><span class="rule"></span><span class="hours-label">${sec.hours} שעות · ${sec.items.length} פרקים</span>
        </div>
        <div class="chapter-list">${items.map(it => chapterCardHtml(sec, it)).join('')}</div>
      </div>`;
    }).join('');

    let solvedLevels = 0, openLevels = 0;
    revealedItems.forEach(it => (it.subs || []).forEach(sb => {
      if (!sb.topicId) return;
      const dt = subDoneTotal(sb);
      solvedLevels += dt.done; openLevels += dt.total;
    }));

    app.innerHTML = shellHtml(session, 'home', `
      <div class="home-wrap">
        <div class="home-head">
          <div>
            <div class="eyebrow">תוכנית הלימודים · מבוא להנדסת אלקטרוניקה</div>
            <h1>הפרקים שלי</h1>
          </div>
          <div class="home-stats">
            <div class="mini-stat"><div class="mini-stat-label">פרקים חשופים</div><div class="mini-stat-value">${revealedItems.length}<span>/${totalChapters}</span></div></div>
            <div class="mini-stat"><div class="mini-stat-label">שלבים שנפתרו</div><div class="mini-stat-value">${solvedLevels}<span>/${openLevels}</span></div></div>
          </div>
        </div>
        ${sectionsHtml || `<div class="empty-chapters"><div class="empty-title">עוד לא נחשפו פרקים</div><div class="empty-sub">המורה חושף פרקים לפי ההתקדמות בכיתה.</div></div>`}
      </div>
      <footer class="foot">${CONFIG.APP_NAME} ⚡ סימולטור למידה אינטראקטיבי</footer>`,
      { stats: { streak: session.streakDays || 0, points: solvedLevels } });

    wireShell(onLogout, () => render(), { session, screen: 'נושאי הלימוד' });

    app.querySelectorAll('.chapter-head').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.chapter;
        expandedKey = expandedKey === key ? null : key;
        render();
      });
    });
    app.querySelectorAll('.subtopic-row.clickable').forEach(btn => {
      btn.addEventListener('click', () => {
        playClick();
        const topic = TOPICS[btn.dataset.topic];
        if (!topic) return;
        const d = btn.dataset;
        const subtopic = {
          levelStart: parseInt(d.start, 10), levelEnd: parseInt(d.end, 10),
          chapterN: d.chapterN, chapterTitle: d.chapterTitle, n: d.subN, title: d.subTitle, color: d.color,
        };
        mountTopic(app, session, topic, () => mountHome(app, session, onLogout), onLogout, { subtopic });
      });
    });
  }
}
