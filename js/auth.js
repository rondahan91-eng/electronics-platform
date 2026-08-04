// מסך התחברות - שם משתמש + סיסמה, מנתב בהתאם לתפקיד (admin/student).
import { CONFIG } from './config.js';
import { authenticateUser, isDevMode } from './api.js';

export function renderLogin(app, onLoggedIn) {
  app.innerHTML = `
  <div class="login-wrap">
    <form class="login-card glass" id="login-form">
      <div class="login-logo">⚡</div>
      <h1 class="neon-title">${CONFIG.APP_NAME}</h1>
      <p class="sub">סימולטור למידה אינטראקטיבי</p>
      <div class="login-error" id="login-error"></div>
      <div class="field" style="text-align:right;">
        <label for="username">שם משתמש</label>
        <input type="text" id="username" autocomplete="username" required>
      </div>
      <div class="field" style="text-align:right;">
        <label for="password">סיסמה</label>
        <input type="password" id="password" autocomplete="current-password" required>
      </div>
      <button type="submit" id="login-btn" style="width:100%;">כניסה 🔒</button>
      ${isDevMode() ? `<div class="login-hint">מצב פיתוח מקומי (ללא שרת מחובר)<br>מורה: admin / admin123 · תלמיד/ה: demo / demo1234</div>` : ''}
    </form>
  </div>`;

  const form = document.getElementById('login-form');
  const err = document.getElementById('login-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.remove('show');
    const btn = document.getElementById('login-btn');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    if (!username || !password) return;
    btn.disabled = true;
    btn.textContent = 'מתחבר...';
    try {
      const user = await authenticateUser(username, password);
      onLoggedIn(user);
    } catch (e2) {
      err.textContent = e2.message || 'שגיאת התחברות';
      err.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'כניסה 🔒';
    }
  });
}
