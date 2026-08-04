// ==========================================================================
// main.js - נקודת הכניסה: ניהול session וניתוב בין מסך התחברות / משחק / ניהול.
// ==========================================================================
import { CONFIG } from './config.js';
import { renderLogin } from './auth.js';
import { mountHome } from './home.js';
import { mountDashboard } from './dashboard.js';

const app = document.getElementById('app');

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(CONFIG.SESSION_KEY) || 'null'); }
  catch { return null; }
}
function saveSession(user) { sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(user)); }
function clearSession() { sessionStorage.removeItem(CONFIG.SESSION_KEY); }

function route() {
  const session = loadSession();
  if (!session) {
    renderLogin(app, (user) => { saveSession(user); route(); });
    return;
  }
  const onLogout = () => { clearSession(); route(); };
  if (session.role === 'admin') mountDashboard(app, session, onLogout);
  else mountHome(app, session, onLogout);
}

route();
