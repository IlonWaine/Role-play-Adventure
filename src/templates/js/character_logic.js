const defaultData = {
  name: "Козак Крутивус",
  maxHP: 23,
  currentHP: 16,
  ac: 13,
  session: "#dnd-game-1",
  maxSlots: 8,
  stats: [
    { name: "🔎 Допитливість", val: "0" },
    { name: "🪄 Магія", val: "-3" },
    { name: "💪 Сила", val: "+2" },
    { name: "🏃 Спритність", val: "0" },
    { name: "🎲 Ініціатива", val: "0" },
    { name: "🎭 Харизма", val: "+1" }
  ],
  abilities: [
    { title: "Козацький крик", desc: "На один хід знижує мораль ворогів (-1 до захисту ворогів на 1 хід), витрачає 0.5 дії." },
    { title: "Стійкість до чарів", desc: "Магічні атаки завдають йому на 25% менше шкоди." },
    { title: "Козацький стиль", desc: "Розчісує вуса (+1 до захисту 1 раз на бій), витрачає 0.5 дії." },
    { title: "Шанс ухилитися від удару", desc: "Більше 10." }
  ],
  inventory: [
    "Шабля з руків'ям у формі сонця (1К10)",
    "Гребінець для вусів",
    "Чорний Хліб з салом (1К4) (4 шт)",
    "Артефакт куля",
    "Сокирка на мотузку"
  ],
  coins: { gp: 41, sp: 12, cp: 5 },
  backstory: "Славний козак із дикого степу, що шукає стародавні артефакти та розгадки магічних аномалій. Відомий своїм непохитним характером, довгими вусами та вмінням знаходити вихід із найскладніших ситуацій за допомогою гострого розуму та вивіреного удару шаблей.",
  portraitUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=800&q=80"
};

// Чат-історія за замовчуванням
const defaultMessages = [
  { sender: "DM", type: "dm", text: "Ласкаво просимо до сесії! Ви знаходитесь перед входом у стару вежу.", time: "19:00" },
  { sender: "Маг Олексій", type: "general", text: "Я оглядаю магічну ауру дверей.", time: "19:02" },
  { sender: "DM", type: "secret", text: "🤫 (Особисто вам): Ви відчуваєте запах свіжого сапла з-під дверей.", time: "19:05" }
];

let charData = JSON.parse(localStorage.getItem('dnd_character_data')) || defaultData;
let chatMessages = JSON.parse(localStorage.getItem('dnd_chat_messages')) || defaultMessages;
let currentHP = charData.currentHP;

function renderCharacter() {
  document.getElementById('char-name').value = charData.name || "Козак Крутивус";
  document.getElementById('char-title').value = `Сесія: ${charData.session}`;
  document.getElementById('max-hp').innerText = charData.maxHP;
  document.getElementById('current-hp').innerText = currentHP;
  document.getElementById('ac-val').innerText = charData.ac;

  // Редагування ім'я персонажа
  document.getElementById('char-name').addEventListener('input', (e) => {
    charData.name = e.target.value;
    saveCurrentState();
  });

  // Характеристики
  const statsContainer = document.getElementById('stats-container');
  statsContainer.innerHTML = charData.stats.map(s => `
    <div class="stat-item">
      <span class="stat-name">${s.name}</span>
      <span class="stat-val">${s.val}</span>
    </div>
  `).join('');

  // Уміння
  const abilityList = document.getElementById('ability-list');
  abilityList.innerHTML = charData.abilities.map(a => `
    <li class="ability-item">
      <div class="ability-title">${a.title}</div>
      ${a.desc}
    </li>
  `).join('');

  // Інвентар
  renderInventory();

  // Передісторія та Портрет
  document.getElementById('backstory-text').innerText = charData.backstory;
  document.getElementById('portrait-img').src = charData.portraitUrl;

  updateHealthBar();
  updateCoinsUI();
  renderChat();
}

function renderInventory() {
  const invList = document.getElementById('inventory-list');
  invList.innerHTML = charData.inventory.map((item, idx) => `
    <li class="inventory-item">
      <span>${item}</span>
      <div class="item-actions">
        <button class="btn-action" title="Передати гравцю" onclick="tradeIndividualItem('${item}')">🔄</button>
        <button class="btn-action" title="Викинути" onclick="removeItem(${idx})">🗑️</button>
      </div>
    </li>
  `).join('');

  document.getElementById('slot-count').innerText = `Слоти: ${charData.inventory.length} / ${charData.maxSlots}`;
}

// 1. HEALTH BAR LOGIC
function updateHealthBar() {
  const percentage = Math.max(0, Math.min(100, (currentHP / charData.maxHP) * 100));
  const barFill = document.getElementById('hp-bar-fill');
  
  barFill.style.width = percentage + '%';
  document.getElementById('current-hp').innerText = currentHP;

  if (percentage <= 25) {
    barFill.style.background = 'var(--hp-bar-fill-low)';
  } else {
    barFill.style.background = 'linear-gradient(90deg, #9b1c1c, var(--hp-bar-fill))';
  }
}

function changeHP(amount) {
  currentHP += amount;
  if (currentHP < 0) currentHP = 0;
  if (currentHP > charData.maxHP) currentHP = charData.maxHP;
  charData.currentHP = currentHP;
  saveCurrentState();
  updateHealthBar();
}

// 2. ГАМАНЕЦЬ
function changeCoin(type, amount) {
  charData.coins[type] += amount;
  if (charData.coins[type] < 0) charData.coins[type] = 0;
  saveCurrentState();
  updateCoinsUI();
}

function updateCoinsUI() {
  document.getElementById('gp-val').innerText = charData.coins.gp;
  document.getElementById('sp-val').innerText = charData.coins.sp;
  document.getElementById('cp-val').innerText = charData.coins.cp;
}

function convertCurrency(action) {
  const c = charData.coins;
  switch (action) {
    case 'gpToSp':
      if (c.gp >= 1) { c.gp -= 1; c.sp += 10; } 
      else { alert("Недостатньо золотих монет!"); }
      break;
    case 'spToGp':
      if (c.sp >= 10) { c.sp -= 10; c.gp += 1; } 
      else { alert("Потрібно як мінімум 10 срібних монет!"); }
      break;
    case 'spToCp':
      if (c.sp >= 1) { c.sp -= 1; c.cp += 10; } 
      else { alert("Недостатньо срібних монет!"); }
      break;
    case 'cpToSp':
      if (c.cp >= 10) { c.cp -= 10; c.sp += 1; } 
      else { alert("Потрібно як мінімум 10 мідних монет!"); }
      break;
  }
  saveCurrentState();
  updateCoinsUI();
}

// 3. ІНВЕНТАР
function tradeIndividualItem(itemName) {
  const targetPlayer = prompt(`Кому передати предмет "${itemName}"?\nВведіть ім'я гравця:`);
  if (targetPlayer) {
    alert(`Запит на передачу "${itemName}" відправлено гравцю ${targetPlayer}.`);
    // Автоматично генеруємо таємне повідомлення про передачу
    addChatMessage({
      sender: charData.name,
      type: "secret",
      text: `🔄 Запропоновано обмін предметом [${itemName}] з ${targetPlayer}.`,
      time: getCurrentTime()
    });
  }
}

function removeItem(index) {
  if (confirm("Викинути цей предмет з інвентарю?")) {
    charData.inventory.splice(index, 1);
    saveCurrentState();
    renderInventory();
  }
}

function toggleBlock(headerElement) {
  headerElement.classList.toggle('collapsed');
}

function saveCurrentState() {
  localStorage.setItem('dnd_character_data', JSON.stringify(charData));
}

// 4. ЧАТ ТА ТАЄМНИЦІ
function toggleChat() {
  const layout = document.getElementById('app-layout');
  layout.classList.toggle('chat-open');
  document.getElementById('unread-badge').style.display = 'none';
}

function renderChat() {
  const container = document.getElementById('chat-messages');
  container.innerHTML = chatMessages.map(msg => {
    let bubbleClass = "msg-general";
    if (msg.type === "own") bubbleClass = "msg-own";
    else if (msg.type === "dm") bubbleClass = "msg-dm";
    else if (msg.type === "secret") bubbleClass = "msg-secret";

    return `
      <div class="msg-bubble ${bubbleClass}">
        <div class="msg-author">${msg.sender}</div>
        <div class="msg-text">${msg.text}</div>
        <span class="msg-time">${msg.time}</span>
      </div>
    `;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

function sendMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const recipient = document.getElementById('chat-recipient');
  const text = input.value.trim();

  if (!text) return;

  let msgType = "own";
  let targetText = text;

  if (recipient.value !== "all") {
    msgType = "secret";
    const recipientName = recipient.options[recipient.selectedIndex].text;
    targetText = `🔒 (Для ${recipientName}): ${text}`;
  }

  addChatMessage({
    sender: charData.name,
    type: msgType,
    text: targetText,
    time: getCurrentTime()
  });

  input.value = "";
}

function addChatMessage(msgObj) {
  chatMessages.push(msgObj);
  localStorage.setItem('dnd_chat_messages', JSON.stringify(chatMessages));
  renderChat();
  
  // Якщо чат закритий — показуємо крапку непрочитаного
  if (!document.getElementById('app-layout').classList.contains('chat-open')) {
    document.getElementById('unread-badge').style.display = 'inline';
  }
}

function getCurrentTime() {
  const now = new Date();
  return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
}

// 5. МОБІЛЬНІ СВАЙПИ (SWIPE TO OPEN CHAT)
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

  // Свайп вліво (відкрити чат)
  if (swipeDistance > 70 && !layout.classList.contains('chat-open')) {
    layout.classList.add('chat-open');
    document.getElementById('unread-badge').style.display = 'none';
  }
  // Свайп вправо (закрити чат)
  else if (swipeDistance < -70 && layout.classList.contains('chat-open')) {
    layout.classList.remove('chat-open');
  }
}

// Ініціалізація
renderCharacter();