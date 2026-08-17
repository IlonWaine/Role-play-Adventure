// =============================================================================
// D&D CHARACTER SHEET (LIVE SESSION) - підключено до реального бекенду.
// URL: /character_ui?session_id=...&char_id=...
// =============================================================================

const ACTION_TYPES = {
  full: { icon: '🔴', label: 'Повна дія' },
  half: { icon: '🌓', label: 'Пів дії' },
  passive: { icon: '⭕', label: 'Пасивна' }
};

let sessionId = null;
let charId = null;
let charData = null;
let sessionData = null;
let chatMessages = [];
let currentHP = 0;
let lastMessageId = 0;
let isFirstMessageLoad = true;
let pollTimer = null;
let ws = null;

async function init() {
  const params = new URLSearchParams(window.location.search);
  sessionId = params.get('session_id');
  charId = params.get('char_id');

  if (!sessionId || !charId) {
    alert('Не вказано сесію або персонажа (відсутні session_id/char_id у посиланні).');
    return;
  }

  try {
    const [charRes, sessionRes] = await Promise.all([
      fetch(`/api/characters/${charId}`),
      fetch(`/api/sessions/${sessionId}`)
    ]);

    if (!charRes.ok) {
      alert('Персонажа не знайдено на сервері.');
      return;
    }
    if (!sessionRes.ok) {
      alert('Сесію не знайдено (можливо, вона вже завершена).');
      return;
    }

    charData = await charRes.json();
    sessionData = await sessionRes.json();
  } catch (err) {
    console.error(err);
    alert("Помилка з'єднання з сервером.");
    return;
  }

  currentHP = charData.current_hp;

  renderCharacter();
  setupRecipientOptions();
  setupKeyboardResize();
  await loadMessages();

  connectWebSocket();
  // REST-опитування лишається як запасний варіант на випадок, якщо WS не
  // тримається (проксі хостингу, тимчасовий розрив) - тому рідше, ніж раніше.
  pollTimer = setInterval(loadMessages, 15000);
}

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws/sessions/${sessionId}`);

  ws.onmessage = async (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      return;
    }

    if (data.type === 'chat') {
      await loadMessages();
      // Передача предмета від DM теж їде як чат-сповіщення -
      // на цей же сигнал підтягуємо свіжий інвентар/монети.
      await refreshCharacterData();
    } else if (data.type === 'inventory') {
      await refreshCharacterData();
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 3000);
  };
  ws.onerror = () => ws.close();

  // keepalive-пінг, щоб проксі хостингу не рвав "тихе" з'єднання
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send('ping');
    } else {
      clearInterval(pingInterval);
    }
  }, 25000);
}

async function refreshCharacterData() {
  try {
    const res = await fetch(`/api/characters/${charId}`);
    if (!res.ok) return;
    const fresh = await res.json();
    // Не чіпаємо ім'я/HP, які гравець міг саме зараз редагувати -
    // підтягуємо лише те, що змінюється ЗЗОВНІ (дарунки, обмін).
    charData.inventory = fresh.inventory;
    charData.gp = fresh.gp;
    charData.sp = fresh.sp;
    charData.cp = fresh.cp;
    renderInventory();
    updateCoinsUI();
  } catch (err) {
    console.error(err);
  }
}

function renderCharacter() {
  document.getElementById('char-name').value = charData.name || '';
  document.getElementById('char-name').addEventListener('input', (e) => {
    charData.name = e.target.value;
    saveCharacter();
  });

  document.getElementById('char-title').value = `Кімната: ${sessionData.room_code} · ${sessionData.story_title}`;

  document.getElementById('max-hp').innerText = charData.max_hp;
  document.getElementById('current-hp').innerText = currentHP;
  document.getElementById('ac-val').innerText = charData.ac;

  document.getElementById('goal-text').innerText = findMyGoal() || 'Ціль ще не визначена DM.';

  const statsContainer = document.getElementById('stats-container');
  statsContainer.innerHTML = (charData.stats || []).map(s => `
    <div class="stat-item">
      <span class="stat-name">${s.name}</span>
      <span class="stat-val">${s.val}</span>
    </div>
  `).join('');

  renderAbilities();
  renderInventory();

  document.getElementById('backstory-text').innerText = charData.backstory || '';
  document.getElementById('portrait-img').src = charData.portrait_data || '';

  updateHealthBar();
  updateCoinsUI();
}

function findMyGoal() {
  const me = (sessionData.participants || []).find(p => p.id === parseInt(charId));
  return me ? me.goal : '';
}

function renderAbilities() {
  const abilityList = document.getElementById('ability-list');
  abilityList.innerHTML = (charData.abilities || []).map(a => {
    const action = ACTION_TYPES[a.actionType || 'full'];
    return `
      <li class="ability-item">
        <div class="ability-title-row">
          <span class="ability-title">${a.title || 'Без назви'}</span>
          <span class="ability-badge" title="${action.label}">${action.icon} ${action.label}</span>
        </div>
        ${a.principle ? `<div class="ability-principle">${a.principle}</div>` : ''}
        <div class="ability-desc">${a.desc || ''}</div>
      </li>
    `;
  }).join('');
}

function renderInventory() {
  const invList = document.getElementById('inventory-list');
  invList.innerHTML = (charData.inventory || []).map((item, idx) => `
    <li class="inventory-item">
      <div class="inventory-item-main">
        <span class="inventory-item-name">${item.name}${item.qty && item.qty > 1 ? ` x${item.qty}` : ''}</span>
        <div class="item-actions">
          <button class="btn-action" title="Передати гравцю" onclick="tradeIndividualItem(${idx})">🔄</button>
          <button class="btn-action" title="Викинути" onclick="removeItem(${idx})">🗑️</button>
        </div>
      </div>
      ${item.desc ? `<div class="inventory-item-desc">${item.desc}</div>` : ''}
    </li>
  `).join('');

  document.getElementById('slot-count').innerText = `Слоти: ${(charData.inventory || []).length} / ${charData.max_slots}`;
}

// --- HP ---
function updateHealthBar() {
  const percentage = charData.max_hp > 0 ? Math.max(0, Math.min(100, (currentHP / charData.max_hp) * 100)) : 0;
  const barFill = document.getElementById('hp-bar-fill');

  barFill.style.width = percentage + '%';
  document.getElementById('current-hp').innerText = currentHP;

  barFill.style.background = percentage <= 25
    ? 'var(--hp-bar-fill-low)'
    : 'linear-gradient(90deg, #9b1c1c, var(--hp-bar-fill))';
}

function changeHP(amount) {
  currentHP += amount;
  if (currentHP < 0) currentHP = 0;
  if (currentHP > charData.max_hp) currentHP = charData.max_hp;
  charData.current_hp = currentHP;
  saveCharacter();
  updateHealthBar();
}

// --- ГАМАНЕЦЬ ---
function changeCoin(type, amount) {
  charData[type] = (charData[type] || 0) + amount;
  if (charData[type] < 0) charData[type] = 0;
  saveCharacter();
  updateCoinsUI();
}

function updateCoinsUI() {
  document.getElementById('gp-val').innerText = charData.gp;
  document.getElementById('sp-val').innerText = charData.sp;
  document.getElementById('cp-val').innerText = charData.cp;
}

function convertCurrency(action) {
  switch (action) {
    case 'gpToSp':
      if (charData.gp >= 1) { charData.gp -= 1; charData.sp += 10; }
      else { alert("Недостатньо золотих монет!"); }
      break;
    case 'spToGp':
      if (charData.sp >= 10) { charData.sp -= 10; charData.gp += 1; }
      else { alert("Потрібно як мінімум 10 срібних монет!"); }
      break;
    case 'spToCp':
      if (charData.sp >= 1) { charData.sp -= 1; charData.cp += 10; }
      else { alert("Недостатньо срібних монет!"); }
      break;
    case 'cpToSp':
      if (charData.cp >= 10) { charData.cp -= 10; charData.sp += 1; }
      else { alert("Потрібно як мінімум 10 мідних монет!"); }
      break;
  }
  saveCharacter();
  updateCoinsUI();
}

// --- ЗБЕРЕЖЕННЯ (автозбереження після кожної дії, замість кнопки) ---
async function saveCharacter() {
  try {
    await fetch(`/api/characters/${charId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: charData.name,
        current_hp: charData.current_hp,
        max_hp: charData.max_hp,
        ac: charData.ac,
        gp: charData.gp,
        sp: charData.sp,
        cp: charData.cp,
        inventory: charData.inventory,
        backstory: charData.backstory
      })
    });
  } catch (err) {
    console.error('Не вдалося зберегти зміни персонажа:', err);
  }
}

// --- ІНВЕНТАР: ОБМІН/ДАРУВАННЯ ТА ВИКИДАННЯ ---
async function tradeIndividualItem(itemIndex) {
  const item = charData.inventory[itemIndex];
  if (!item) return;

  const others = (sessionData.participants || []).filter(p => p.id !== parseInt(charId));
  if (others.length === 0) {
    alert('У цій сесії немає інших персонажів для обміну.');
    return;
  }

  const pickList = others.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
  const choice = prompt(`Кому передати "${item.name}"?\n${pickList}`);
  if (choice === null) return;
  const idx = parseInt(choice) - 1;
  if (isNaN(idx) || idx < 0 || idx >= others.length) return;

  const target = others[idx];

  try {
    const res = await fetch(`/api/sessions/${sessionId}/trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_character_id: parseInt(charId),
        to_character_id: target.id,
        item_index: itemIndex
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || 'Помилка передачі предмета.');
      return;
    }

    const result = await res.json();
    charData.inventory = result.from_character.inventory;
    renderInventory();

    await addChatMessage({
      sender_type: 'player',
      sender_id: parseInt(charId),
      sender_name: charData.name,
      recipient_type: 'all',
      recipient_id: null,
      message_type: 'text',
      text: `🔄 ${charData.name} передав(-ла) предмет "${item.name}" гравцю ${target.name}.`
    });
  } catch (err) {
    console.error(err);
    alert("Помилка з'єднання з сервером.");
  }
}

function removeItem(index) {
  if (confirm('Викинути цей предмет з інвентарю?')) {
    charData.inventory.splice(index, 1);
    saveCharacter();
    renderInventory();
  }
}

function toggleBlock(headerElement) {
  headerElement.classList.toggle('collapsed');
}

// --- ЧАТ ---
function setupRecipientOptions() {
  const select = document.getElementById('chat-recipient');
  const others = (sessionData.participants || []).filter(p => p.id !== parseInt(charId));
  others.forEach(p => {
    const opt = document.createElement('option');
    opt.value = `character:${p.id}`;
    opt.textContent = `🧝 ${p.name}`;
    select.appendChild(opt);
  });
}

function toggleChat() {
  const layout = document.getElementById('app-layout');
  layout.classList.toggle('chat-open');
  document.getElementById('unread-badge').style.display = 'none';
}

// На мобільних 100vh/100dvh не завжди звужується разом з появою клавіатури
// (особливо у старіших WebView) - тому підганяємо висоту чат-панелі під
// window.visualViewport, який коректно відображає реально видиму область.
function setupKeyboardResize() {
  if (!window.visualViewport) return;

  const sidebar = document.getElementById('chat-sidebar');
  const vv = window.visualViewport;

  function updateHeight() {
    sidebar.style.height = vv.height + 'px';
  }

  vv.addEventListener('resize', updateHeight);
  vv.addEventListener('scroll', updateHeight);
  updateHeight();

  // Додатковий страхувальний захід: коли поле вводу отримує фокус,
  // прокручуємо його у видиму область (деякі Android-браузери піднімають
  // клавіатуру з невеликою затримкою відносно події resize).
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('focus', () => {
      setTimeout(() => {
        chatInput.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }, 150);
    });
  }
}

let isLoadingMessages = false;

async function loadMessages() {
  // Захист від подвійного відображення: WS-сигнал "chat" і прямий виклик
  // після власного POST можуть спрацювати майже одночасно й обидва
  // прочитати ще не оновлений lastMessageId - без цього прапорця повідомлення
  // додається в chatMessages двічі.
  if (isLoadingMessages) return;
  isLoadingMessages = true;

  try {
    const res = await fetch(`/api/sessions/${sessionId}/messages?viewer_type=character&viewer_id=${charId}&after_id=${lastMessageId}`);
    if (!res.ok) return;
    const newMessages = await res.json();

    if (newMessages.length > 0) {
      chatMessages = chatMessages.concat(newMessages);
      lastMessageId = newMessages[newMessages.length - 1].id;
      renderChat();

      if (!isFirstMessageLoad && !document.getElementById('app-layout').classList.contains('chat-open')) {
        document.getElementById('unread-badge').style.display = 'inline';
      }
    }
    isFirstMessageLoad = false;
  } catch (err) {
    console.error(err);
  } finally {
    isLoadingMessages = false;
  }
}

function renderChat() {
  const container = document.getElementById('chat-messages');
  container.innerHTML = chatMessages.map(msg => {
    let bubbleClass = 'msg-general';
    if (msg.sender_type === 'player' && msg.sender_id === parseInt(charId)) bubbleClass = 'msg-own';
    else if (msg.sender_type === 'dm' && msg.recipient_type === 'all') bubbleClass = 'msg-dm';
    else if (msg.recipient_type !== 'all') bubbleClass = 'msg-secret';

    const time = msg.created_at
      ? new Date(msg.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
      : '';

    const imageHtml = (msg.message_type === 'image' && msg.image_url)
      ? `<img src="${msg.image_url}" style="max-width:100%; border-radius:6px; margin-top:4px; cursor:zoom-in;" alt="Зображення сцени" onclick="openImageLightbox(this.src)">`
      : '';

    return `
      <div class="msg-bubble ${bubbleClass}">
        <div class="msg-author">${msg.sender_name}</div>
        ${msg.text ? `<div class="msg-text">${msg.text}</div>` : ''}
        ${imageHtml}
        <span class="msg-time">${time}</span>
      </div>
    `;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

async function sendMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const recipientSelect = document.getElementById('chat-recipient');
  const text = input.value.trim();
  if (!text) return;

  const val = recipientSelect.value;
  let recipient_type = 'all';
  let recipient_id = null;
  if (val === 'dm') {
    recipient_type = 'dm';
  } else if (val.startsWith('character:')) {
    recipient_type = 'character';
    recipient_id = parseInt(val.split(':')[1]);
  }

  await addChatMessage({
    sender_type: 'player',
    sender_id: parseInt(charId),
    sender_name: charData.name,
    recipient_type,
    recipient_id,
    message_type: 'text',
    text
  });

  input.value = '';
}

async function addChatMessage(msgPayload) {
  try {
    await fetch(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msgPayload)
    });
    await loadMessages();
  } catch (err) {
    console.error(err);
  }
}

// --- МОБІЛЬНІ СВАЙПИ (SWIPE TO OPEN CHAT) ---
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
}, false);

document.addEventListener('touchend', e => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
}, false);

function handleSwipe() {
  const layout = document.getElementById('app-layout');
  const swipeDistance = touchStartX - touchEndX;

  if (swipeDistance > 70 && !layout.classList.contains('chat-open')) {
    layout.classList.add('chat-open');
    document.getElementById('unread-badge').style.display = 'none';
  } else if (swipeDistance < -70 && layout.classList.contains('chat-open')) {
    layout.classList.remove('chat-open');
  }
}

// Перегляд зображення на весь екран (портрет, зображення в чаті)
function openImageLightbox(url) {
  if (!url) return;
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `<img src="${url}" class="lightbox-img" alt="Перегляд зображення">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

// Ініціалізація
init();