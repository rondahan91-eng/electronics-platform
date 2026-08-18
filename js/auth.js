// מסך התחברות - שם משתמש + סיסמה, מנתב בהתאם לתפקיד (admin/student).
// עיצוב Prism v2.1: קרקע ירוקה כהה עם סכמה מונפשת ברקע + כרטיס זכוכית.
import { CONFIG } from './config.js';
import { authenticateUser, isDevMode } from './api.js';

/** רקע SVG מונפש - רשת נודדת, מקטעי מוליך, מסלולי זרם זוהרים, צמתים
 * פועמים - הכל איטי ומכוון (לא "רועש"). מסוכך במסכה רדיאלית כדי לדעוך
 * לקצוות. מותאם 1:1 מתוך handoff העיצוב (Electronics Prototype.dc.html). */
function loginSchematicSvg() {
  return `
  <svg viewBox="0 0 600 820" preserveAspectRatio="xMidYMid slice" class="login-schematic" aria-hidden="true">
    <defs>
      <pattern id="lgGrid" width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M30 0H0v30" fill="none" stroke="#14503a" stroke-width="1"></path>
      </pattern>
      <radialGradient id="lgFade" cx="50%" cy="42%" r="78%">
        <stop offset="0" stop-color="#fff" stop-opacity=".95"></stop>
        <stop offset="1" stop-color="#fff" stop-opacity=".12"></stop>
      </radialGradient>
      <mask id="lgMask"><rect x="0" y="0" width="600" height="820" fill="url(#lgFade)"></rect></mask>
      <filter id="lgGlow" x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="5" result="b"></feGaussianBlur>
        <feMerge><feMergeNode in="b"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
      </filter>
    </defs>

    <g class="lg-grid-drift"><rect x="-30" y="-30" width="660" height="880" fill="url(#lgGrid)"></rect></g>

    <g mask="url(#lgMask)" class="lg-mesh-drift">
      <g fill="none" stroke="#2b6b4f" stroke-width="1.6" stroke-linecap="square">
        <path d="M-20 120h150v90h120v-60h180v120h190"></path>
        <path d="M-20 300h90v130h140v-70h150v110h240"></path>
        <path d="M60 820v-120h130v-90h110v-70h180v-90h140"></path>
        <path d="M-20 620h180v80h120v-140h150v60h190"></path>
        <path d="M300 0v90h120v70"></path>
        <path d="M480 0v140h-60"></path>
      </g>
      <g fill="none" stroke="#3ddc97" stroke-width="1.6" stroke-linecap="butt" opacity=".85" stroke-dasharray="14 70" class="lg-trace-flow">
        <path d="M130 210h120v-60h100"></path>
        <path d="M209 430h140v-70h60"></path>
        <path d="M190 700h110v-70h90"></path>
      </g>
      <g fill="#06231a" stroke="#3f8a68" stroke-width="1.6">
        <circle cx="130" cy="120" r="4"></circle><circle cx="250" cy="210" r="4"></circle>
        <circle cx="430" cy="150" r="4"></circle><circle cx="70" cy="300" r="4"></circle>
        <circle cx="349" cy="360" r="4"></circle><circle cx="300" cy="700" r="4"></circle>
        <circle cx="420" cy="490" r="4"></circle><circle cx="160" cy="620" r="4"></circle>
      </g>
      <g fill="#3ddc97" filter="url(#lgGlow)">
        <circle cx="250" cy="150" r="3.4" class="lg-pulse" style="animation-duration:3.4s"></circle>
        <circle cx="409" cy="360" r="3.4" class="lg-pulse" style="animation-duration:4.6s"></circle>
        <circle cx="390" cy="630" r="3.4" class="lg-pulse" style="animation-duration:5.2s"></circle>
        <circle cx="130" cy="210" r="3.4" class="lg-pulse" style="animation-duration:4s"></circle>
      </g>
      <g fill="none" stroke="#235c45" stroke-width="1.4">
        <rect x="452" y="238" width="86" height="52" rx="4"></rect>
        <path d="M452 252h-14M452 268h-14M538 252h14M538 268h14"></path>
        <rect x="96" y="470" width="66" height="40" rx="4"></rect>
        <path d="M96 482h-14M96 498h-14M162 482h14M162 498h14"></path>
      </g>
    </g>
  </svg>`;
}

export function renderLogin(app, onLoggedIn) {
  app.innerHTML = `
  <div class="login-screen">
    <div class="login-bg" aria-hidden="true">
      <div class="login-halo"></div>
      ${loginSchematicSvg()}
    </div>
    <div class="login-content">
      <div class="login-wordmark">
        <h1>${CONFIG.APP_NAME}</h1>
        <p>תרגול תורת החשמל, שלב אחרי שלב.</p>
      </div>
      <form class="login-card" id="login-form">
        <h2>כניסה למערכת</h2>
        <p class="login-card-sub">שם המשתמש והסיסמה שקיבלת מהמורה.</p>
        <div class="login-error" id="login-error"></div>
        <div class="field" style="text-align:right;">
          <label for="username">שם משתמש</label>
          <input type="text" id="username" autocomplete="username" placeholder="למשל demo" required>
        </div>
        <div class="field" style="text-align:right;">
          <label for="password">סיסמה</label>
          <input type="password" id="password" autocomplete="current-password" placeholder="••••••••" required>
        </div>
        <button type="submit" id="login-btn" style="width:100%;">כניסה</button>
        ${isDevMode() ? `<div class="login-hint">מצב פיתוח מקומי (ללא שרת מחובר)<br>מורה: admin / admin123 · תלמיד/ה: demo / demo1234</div>` : ''}
      </form>
    </div>
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
      btn.textContent = 'כניסה';
    }
  });
}
