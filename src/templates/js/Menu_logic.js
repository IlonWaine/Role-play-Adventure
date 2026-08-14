/**
 * D&D NEXUS HUB - CORE LOGIC
 */

document.addEventListener('DOMContentLoaded', () => {
  // State
  let currentRole = null;
  let currentDMUser = null; // Зберігає авторизованого DM (якщо є)

  // Mock-база даних персонажів для гравців
  const registeredCharacters = [
    { id: 'char_1', name: 'Арагорн', class: 'Воїн 5 ур.', playerId: 'max_2024', hp: '28/30', stats: 'STR 16, DEX 14', items: ['Довгий меч', 'Зілля HP'] },
    { id: 'char_2', name: 'Леголас', class: 'Слідопит 5 ур.', playerId: 'olena_dnd', hp: '18/18', stats: 'STR 10, DEX 18', items: ['Довгий лук', 'Стріли (30)'] },
    { id: 'char_3', name: 'Ґімлі', class: 'Варвар 5 ур.', playerId: 'max_2024', hp: '35/35', stats: 'STR 18, DEX 12', items: ['Бойова сокира'] },
    { id: 'char_4', name: 'Ґендальф', class: 'Маг 3 ур.', playerId: 'alex_wizard', hp: '12/20', stats: 'INT 18, WIS 14', items: ['Посох', 'Книга заклинань'] }
  ];

  // DOM Elements
  const roleStep = document.getElementById('roleStep');
  const dmStep = document.getElementById('dmStep');
  const playerStep = document.getElementById('playerStep');
  const backBtn = document.getElementById('backBtn');

  const dmAuthPanel = document.getElementById('dmAuthPanel');
  const dmDashboard = document.getElementById('dmDashboard');
  const dmLoginForm = document.getElementById('dmLoginForm');
  const dmRegisterForm = document.getElementById('dmRegisterForm');
  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  const dmWelcomeText = document.getElementById('dmWelcomeText');
  const dmLogoutBtn = document.getElementById('dmLogoutBtn');

  const btnPlayerModeView = document.getElementById('btnPlayerModeView');
  const btnPlayerModeJoin = document.getElementById('btnPlayerModeJoin');
  const viewByIdSubpanel = document.getElementById('viewByIdSubpanel');
  const joinSessionSubpanel = document.getElementById('joinSessionSubpanel');
  const btnSearchChar = document.getElementById('btnSearchChar');
  const btnConnectLive = document.getElementById('btnConnectLive');

  // Initialization
  init();

  function init() {
    setupRoleSelection();
    setupNavigation();
    setupDMAuth();
    setupPlayerPanel();
    checkExistingDMSession();
  }

  // Helper: відображення / очищення помилок форматування полів
  function clearErrors(form) {
    if (!form) return;
    form.querySelectorAll('input').forEach(input => {
      input.style.borderColor = '';
    });
    const errorBox = form.querySelector('.form-error-msg');
    if (errorBox) {
      errorBox.textContent = '';
      errorBox.style.display = 'none';
    }
  }

  function showFormError(form, message, fieldIds = []) {
    if (!form) return;
    
    // Підсвічуємо конкретні поля червоним
    fieldIds.forEach(id => {
      const field = document.getElementById(id);
      if (field) {
        field.style.borderColor = '#ef4444';
      }
    });

    // Шукаємо або створюємо контейнер для тексту помилки
    let errorBox = form.querySelector('.form-error-msg');
    if (!errorBox) {
      errorBox = document.createElement('div');
      errorBox.className = 'form-error-msg';
      errorBox.style.cssText = 'color: #ef4444; font-size: 0.8rem; margin-top: 0.5rem; text-align: center;';
      form.appendChild(errorBox);
    }
    
    errorBox.textContent = message;
    errorBox.style.color = '#ef4444';
    errorBox.style.display = 'block';
  }

  function showFormSuccess(form, message) {
    if (!form) return;
    let errorBox = form.querySelector('.form-error-msg');
    if (!errorBox) {
      errorBox = document.createElement('div');
      errorBox.className = 'form-error-msg';
      errorBox.style.cssText = 'font-size: 0.8rem; margin-top: 0.5rem; text-align: center;';
      form.appendChild(errorBox);
    }
    errorBox.textContent = message;
    errorBox.style.color = '#10b981'; // Зелений колір
    errorBox.style.display = 'block';
  }

  // Navigation Logic
  function showStep(stepElement) {
    if (!stepElement) return;
    [roleStep, dmStep, playerStep].forEach(el => el && el.classList.add('hidden'));
    stepElement.classList.remove('hidden');

    if (stepElement === roleStep) {
      if (backBtn) backBtn.classList.add('hidden');
    } else {
      if (backBtn) backBtn.classList.remove('hidden');
    }
  }

  function setupNavigation() {
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        showStep(roleStep);
      });
    }
  }

  function setupRoleSelection() {
    document.querySelectorAll('.card-option[data-role]').forEach(card => {
      card.addEventListener('click', () => {
        const role = card.getAttribute('data-role');
        currentRole = role;

        if (role === 'dm') {
          showStep(dmStep);
        } else {
          showStep(playerStep);
          openPlayerSubpanel('view');
        }
      });
    });
  }

  // Dungeon Master Auth & Dashboard
  function setupDMAuth() {
    // Скидання помилок при введенні у поля
    [dmLoginForm, dmRegisterForm].forEach(form => {
      if (!form) return;
      form.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
          input.style.borderColor = '';
          const errorBox = form.querySelector('.form-error-msg');
          if (errorBox) errorBox.style.display = 'none';
        });
      });
    });

    // 1. Перемикання табів входу / реєстрації
    if (tabLoginBtn) {
      tabLoginBtn.addEventListener('click', () => {
        tabLoginBtn.classList.add('active');
        if (tabRegisterBtn) tabRegisterBtn.classList.remove('active');
        if (dmLoginForm) {
          dmLoginForm.classList.remove('hidden');
          clearErrors(dmLoginForm);
        }
        if (dmRegisterForm) {
          dmRegisterForm.classList.add('hidden');
          clearErrors(dmRegisterForm);
        }
      });
    }

    if (tabRegisterBtn) {
      tabRegisterBtn.addEventListener('click', () => {
        tabRegisterBtn.classList.add('active');
        if (tabLoginBtn) tabLoginBtn.classList.remove('active');
        if (dmRegisterForm) {
          dmRegisterForm.classList.remove('hidden');
          clearErrors(dmRegisterForm);
        }
        if (dmLoginForm) {
          dmLoginForm.classList.add('hidden');
          clearErrors(dmLoginForm);
        }
      });
    }

    // 2. Обробка РЕЄСТРАЦІЇ DM
const btnRegister = document.getElementById('btnDmRegister');
const handleRegister = async (e) => {
  e.preventDefault();
  clearErrors(dmRegisterForm);

  // Знаходимо саме ті ID, які написані у вашому Menu.html!
  const nickInput = document.getElementById('dmRegName') || document.getElementById('regNickname');
  const emailInput = document.getElementById('dmRegEmail') || document.getElementById('regEmail');
  const passInput = document.getElementById('dmRegPassword') || document.getElementById('regPassword');

  const nickname = nickInput?.value ? nickInput.value.trim() : '';
  const email = emailInput?.value ? emailInput.value.trim() : '';
  const password = passInput?.value ? passInput.value : '';

  const emptyFields = [];
  if (!nickname && nickInput) emptyFields.push(nickInput.id);
  if (!email && emailInput) emptyFields.push(emailInput.id);
  if (!password && passInput) emptyFields.push(passInput.id);

  if (emptyFields.length > 0) {
    showFormError(dmRegisterForm, 'Будь ласка, заповніть усі необхідні поля!', emptyFields);
    return;
  }

  try {
    const response = await fetch('/api/dm/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        nickname: nickname, 
        email: email, 
        password: password 
      })
    });

    const result = await response.json();

    if (response.ok) {
      showFormSuccess(dmRegisterForm, `Реєстрація успішна! Переходимо до входу...`);
      setTimeout(() => {
        if (tabLoginBtn) tabLoginBtn.click();
      }, 1500);
    } else {
      // Якщо сервер віддав 422, розбираємо, що саме йому не сподобалось
      if (Array.isArray(result.detail)) {
        const errorMsgs = result.detail.map(err => `${err.loc[err.loc.length - 1]}: ${err.msg}`).join(', ');
        showFormError(dmRegisterForm, `Помилка валидації: ${errorMsgs}`);
      } else {
        showFormError(dmRegisterForm, result.detail || 'Не вдалося зареєструватися');
      }
    }
  } catch (err) {
    console.error(err);
    showFormError(dmRegisterForm, "Помилка з'єднання з сервером!");
  }
};

if (btnRegister) btnRegister.addEventListener('click', handleRegister);
if (dmRegisterForm) dmRegisterForm.addEventListener('submit', handleRegister);

    // 3. Обробка ВХОДУ DM
const btnLogin = document.getElementById('btnDmLogin');
const handleLogin = async (e) => {
  e.preventDefault();
  clearErrors(dmLoginForm);

  // Отримуємо значенні саме за тими ID, які вказані в Menu.html
  const emailInput = document.getElementById('dmLoginEmail') || document.getElementById('loginEmail');
  const passInput = document.getElementById('dmLoginPassword') || document.getElementById('loginPassword');

  const email = emailInput?.value ? emailInput.value.trim() : '';
  const password = passInput?.value ? passInput.value : '';

  const emptyFields = [];
  if (!email && emailInput) emptyFields.push(emailInput.id);
  if (!password && passInput) emptyFields.push(passInput.id);

  if (emptyFields.length > 0) {
    showFormError(dmLoginForm, 'Будь ласка, заповніть Email та Пароль!', emptyFields);
    return;
  }

  try {
    const response = await fetch('/api/dm/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email: email, 
        password: password 
      })
    });

    const result = await response.json();

    if (response.ok) {
      const userData = result.dm || { email, nickname: email.split('@')[0] };
      localStorage.setItem("dm_id", result.dm.id);
      loginDM(userData);
    } else {
      // Якщо сервер віддав 422 (помилка формату) або 401 (невірний пароль)
      const problemFields = [];
      if (emailInput) problemFields.push(emailInput.id);
      if (passInput) problemFields.push(passInput.id);

      if (Array.isArray(result.detail)) {
        const errorMsgs = result.detail.map(err => `${err.loc[err.loc.length - 1]}: ${err.msg}`).join(', ');
        showFormError(dmLoginForm, `Помилка вхідних даних: ${errorMsgs}`, problemFields);
      } else {
        showFormError(dmLoginForm, result.detail || 'Невірний Email або пароль', problemFields);
      }
    }
  } catch (err) {
    console.error(err);
    showFormError(dmLoginForm, "Помилка з'єднання з сервером!");
  }
};

if (btnLogin) btnLogin.addEventListener('click', handleLogin);
if (dmLoginForm) dmLoginForm.addEventListener('submit', handleLogin);

    // 4. Logout
    if (dmLogoutBtn) {
      dmLogoutBtn.addEventListener('click', () => {
        currentDMUser = null;
        // Обидва ключі мають чиститись разом, інакше player_navigation.js
        // (який дивиться лише на dm_id) залишиться "залогіненим" зі старим DM.
        localStorage.removeItem('dnd_dm_session');
        localStorage.removeItem('dm_id');
        if (dmDashboard) dmDashboard.classList.add('hidden');
        if (dmAuthPanel) dmAuthPanel.classList.remove('hidden');
      });
    }
  }

  function loginDM(userData) {
    currentDMUser = userData;
    // Зберігаємо сесію у localStorage
    localStorage.setItem('dnd_dm_session', JSON.stringify(userData));

    if (dmWelcomeText) {
      dmWelcomeText.textContent = `Вітаємо, Майстре ${userData.nickname || userData.name}!`;
    }
    if (dmAuthPanel) dmAuthPanel.classList.add('hidden');
    if (dmDashboard) dmDashboard.classList.remove('hidden');
  }

  function checkExistingDMSession() {
    const savedSession = localStorage.getItem('dnd_dm_session');
    if (savedSession) {
      try {
        const userData = JSON.parse(savedSession);
        loginDM(userData);
      } catch (e) {
        localStorage.removeItem('dnd_dm_session');
      }
    }
  }

  // Player Panel Logic
  function setupPlayerPanel() {
    if (btnPlayerModeView) btnPlayerModeView.addEventListener('click', () => openPlayerSubpanel('view'));
    if (btnPlayerModeJoin) btnPlayerModeJoin.addEventListener('click', () => openPlayerSubpanel('join'));

    if (btnSearchChar) btnSearchChar.addEventListener('click', fetchCharactersByPlayerId);
    if (btnConnectLive) btnConnectLive.addEventListener('click', connectToLiveSession);
  }

  function openPlayerSubpanel(mode) {
    if (mode === 'view') {
      if (viewByIdSubpanel) viewByIdSubpanel.classList.remove('hidden');
      if (joinSessionSubpanel) joinSessionSubpanel.classList.add('hidden');
    } else {
      if (joinSessionSubpanel) joinSessionSubpanel.classList.remove('hidden');
      if (viewByIdSubpanel) viewByIdSubpanel.classList.add('hidden');
    }
  }

  function fetchCharactersByPlayerId() {
    const idInput = document.getElementById('playerIdOnlyInput');
    const val = idInput?.value.trim().toLowerCase();
    const listContainer = document.getElementById('viewOnlyCharList');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (!val) {
      if (idInput) idInput.style.borderColor = '#ef4444';
      return;
    } else if (idInput) {
      idInput.style.borderColor = '';
    }

    const myChars = registeredCharacters.filter(c => c.playerId.toLowerCase() === val);

    if (myChars.length === 0) {
      listContainer.innerHTML = `<div class="text-center text-subtle" style="font-size:0.75rem; padding: 1rem;">
        Персонажів з Player ID "${val}" не знайдено.
      </div>`;
      return;
    }

    myChars.forEach(c => {
      const item = document.createElement('div');
      item.className = 'char-item';
      item.innerHTML = `
        <div class="char-info">
          <h5><i class="fa-solid fa-user-shield"></i> ${c.name}</h5>
          <p>${c.class} • ${c.stats}</p>
          <p style="color: var(--accent-gold);">🎒 Лут: ${c.items.join(', ')}</p>
        </div>
        <button class="btn btn-blue" style="font-size:0.65rem; padding:0.3rem 0.6rem;" data-id="${c.id}">
          🔍 Відкрити
        </button>
      `;

      item.querySelector('button').addEventListener('click', () => openCharacterSheet(c));
      listContainer.appendChild(item);
    });
  }

  function connectToLiveSession() {
    const codeInput = document.getElementById('liveSessionCodeInput');
    const playerInput = document.getElementById('livePlayerIdInput');

    const code = codeInput?.value.trim();
    const pId = playerInput?.value.trim();

    let hasError = false;
    if (!code && codeInput) {
      codeInput.style.borderColor = '#ef4444';
      hasError = true;
    }
    if (!pId && playerInput) {
      playerInput.style.borderColor = '#ef4444';
      hasError = true;
    }

    if (hasError) return;

    // Редирект або дія підключення
    // window.location.href = `player_live.html?room=${code}&player=${pId}`;
  }

  function openCharacterSheet(char) {
    // В майбутньому тут можна відкривати модальне вікно замість системного повідомлення
    console.log('Картка персонажа:', char);
  }
});

// Global navigation router for DM Actions
window.navigateTo = function(route) {
  if (route === 'create_character') {
    window.location.href = '/player_navigation';
  } else if (route === 'story_builder') {
    window.location.href = '/dm_story_builder.html';
  } else if (route === 'live_session' || route === 'dmDashboardStep') {
    window.location.href = 'dm_dashboard.html';
  }
};