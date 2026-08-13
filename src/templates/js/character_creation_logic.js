/**
 * ============================================================================
 * D&D CHARACTER BUILDER & EDITOR LOGIC (DM SMARTPHONE OPTIMIZED)
 * ============================================================================
 */

// Порожній за замовчуванням об'єкт персонажа
const emptyCharacterTemplate = {
  name: "",
  role: "",
  session: "",
  maxHP: 10,
  currentHP: 10,
  ac: 10,
  maxSlots: 10,
  stats: [
    { name: "💪 Сила", val: 10 },
    { name: "🏃 Спритність", val: 10 },
    { name: "🛡️ Тілобудова", val: 10 },
    { name: "🧠 Інтелект", val: 10 },
    { name: "🔎 Мудрість", val: 10 },
    { name: "🎭 Харизма", val: 10 }
  ],
  abilities: [],
  inventory: [],
  coins: { gp: 0, sp: 0, cp: 0 },
  backstory: "",
  portraitData: ""
};

let dmData = JSON.parse(localStorage.getItem('dnd_dm_character_draft')) || emptyCharacterTemplate;

document.addEventListener('DOMContentLoaded', () => {
  initFormValues();
  setupDragAndDrop();
  setupAutoExpandTextareas();
});

function initFormValues() {
  document.getElementById('dm-char-name').value = dmData.name || '';
  document.getElementById('dm-char-role').value = dmData.role || '';
  document.getElementById('dm-session').value = dmData.session || '';
  document.getElementById('dm-current-hp').value = dmData.currentHP;
  document.getElementById('dm-max-hp').value = dmData.maxHP;
  document.getElementById('dm-ac').value = dmData.ac;
  document.getElementById('dm-max-slots').value = dmData.maxSlots;

  document.getElementById('dm-gp').value = dmData.coins.gp;
  document.getElementById('dm-sp').value = dmData.coins.sp;
  document.getElementById('dm-cp').value = dmData.coins.cp;

  document.getElementById('dm-backstory').value = dmData.backstory || '';

  renderStatsList();
  renderAbilitiesList();
  renderInventoryList();
  updateHealthBar();

  if (dmData.portraitData) {
    if (dmData.portraitData.startsWith('http')) {
      document.getElementById('dm-portrait-url').value = dmData.portraitData;
    }
    showPortraitPreview(dmData.portraitData);
  }
}

/* ============================================================================
   ЛОГІКА ЗДОРОВ'Я (HP)
   ============================================================================ */

function updateHealthBar() {
  const currentHPInput = document.getElementById('dm-current-hp');
  const maxHPInput = document.getElementById('dm-max-hp');

  let cur = parseInt(currentHPInput.value) || 0;
  let max = parseInt(maxHPInput.value) || 0;

  if (cur < 0) cur = 0;
  if (max < 0) max = 0;

  const percentage = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  
  document.getElementById('hp-bar-fill').style.width = percentage + '%';
  document.getElementById('hp-percent-text').innerText = `${cur} / ${max} (${Math.round(percentage)}%)`;
}

function adjustHP(amount) {
  const currentHPInput = document.getElementById('dm-current-hp');
  const maxHPInput = document.getElementById('dm-max-hp');

  let cur = parseInt(currentHPInput.value) || 0;
  let max = parseInt(maxHPInput.value) || 0;

  cur += amount;
  if (cur < 0) cur = 0;
  if (cur > max) cur = max;

  currentHPInput.value = cur;
  updateHealthBar();
}

function resetHPToMax() {
  const maxHPInput = document.getElementById('dm-max-hp');
  document.getElementById('dm-current-hp').value = maxHPInput.value;
  updateHealthBar();
}

/* ============================================================================
   ХАРАКТЕРИСТИКИ
   ============================================================================ */

function renderStatsList() {
  const container = document.getElementById('dm-stats-container');
  container.innerHTML = dmData.stats.map((s, idx) => `
    <div class="stat-fixed-item">
      <span class="stat-name">${s.name}</span>
      <input type="number" value="${s.val}" class="stat-val-input" onchange="updateStatValue(${idx}, this.value)">
    </div>
  `).join('');
}

function updateStatValue(index, val) {
  dmData.stats[index].val = parseInt(val) || 0;
}

/* ============================================================================
   УМІННЯ
   ============================================================================ */

const ACTION_TYPES = {
  full: { icon: '🔴', label: 'Повна дія' },
  half: { icon: '🌓', label: 'Пів дії' },
  passive: { icon: '⭕', label: 'Пасивна' }
};

function renderAbilitiesList() {
  const container = document.getElementById('dm-ability-list');
  container.innerHTML = dmData.abilities.map((a, idx) => `
    <div class="ability-edit-card">
      <div class="ability-top-row">
        <button type="button" class="btn-action-circle" title="${ACTION_TYPES[a.actionType || 'full'].label}" onclick="toggleAbilityAction(${idx})">
          ${ACTION_TYPES[a.actionType || 'full'].icon}
        </button>
        <input type="text" value="${a.title || ''}" placeholder="Назва уміння..." class="ability-title-input" oninput="dmData.abilities[${idx}].title = this.value">
        <button type="button" class="btn-remove" onclick="removeAbilityRow(${idx})">🗑️</button>
      </div>
      <textarea placeholder="Принцип дії..." class="ability-principle-input auto-expand" rows="1" oninput="dmData.abilities[${idx}].principle = this.value">${a.principle || ''}</textarea>
      <textarea placeholder="Опис уміння..." class="ability-desc-input auto-expand" rows="1" oninput="dmData.abilities[${idx}].desc = this.value">${a.desc || ''}</textarea>
    </div>
  `).join('');

  setupAutoExpandTextareas();
}

function toggleAbilityAction(index) {
  const current = dmData.abilities[index].actionType || 'full';
  if (current === 'full') dmData.abilities[index].actionType = 'half';
  else if (current === 'half') dmData.abilities[index].actionType = 'passive';
  else dmData.abilities[index].actionType = 'full';

  renderAbilitiesList();
}

function addAbilityRow() {
  dmData.abilities.push({ title: '', principle: '', desc: '', actionType: 'full' });
  renderAbilitiesList();
}

function removeAbilityRow(idx) {
  dmData.abilities.splice(idx, 1);
  renderAbilitiesList();
}

/* ============================================================================
   ІНВЕНТАР
   ============================================================================ */

function renderInventoryList() {
  const container = document.getElementById('dm-inventory-list');
  container.innerHTML = dmData.inventory.map((item, idx) => `
    <div class="inventory-edit-card">
      <div class="inv-row-main">
        <input type="text" value="${item.name || ''}" placeholder="Предмет..." class="inv-name-input" oninput="dmData.inventory[${idx}].name = this.value">
        <input type="number" value="${item.qty || 1}" min="1" class="inv-qty-input" oninput="dmData.inventory[${idx}].qty = parseInt(this.value) || 1">
        <button type="button" class="btn-remove" onclick="removeInventoryRow(${idx})">🗑️</button>
      </div>
      <textarea placeholder="Опис предмета..." class="inv-desc-input auto-expand" rows="1" oninput="dmData.inventory[${idx}].desc = this.value">${item.desc || ''}</textarea>
    </div>
  `).join('');

  setupAutoExpandTextareas();
}

function addInventoryRow() {
  dmData.inventory.push({ name: '', qty: 1, desc: '' });
  renderInventoryList();
}

function removeInventoryRow(idx) {
  dmData.inventory.splice(idx, 1);
  renderInventoryList();
}

/* ============================================================================
   ПОРТРЕТ ТА ДРАГ-ЕНД-ДРОП
   ============================================================================ */

function setupDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('portrait-file-input');

  dropZone.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt.files.length > 0) processImageFile(dt.files[0]);
  });
}

function handleFileSelect(e) {
  if (e.target.files.length > 0) processImageFile(e.target.files[0]);
}

function processImageFile(file) {
  if (!file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    dmData.portraitData = e.target.result;
    showPortraitPreview(e.target.result);
  };
  reader.readAsDataURL(file);
}

function handleUrlInput() {
  const url = document.getElementById('dm-portrait-url').value;
  dmData.portraitData = url;
  if (url) showPortraitPreview(url);
  else removePortrait();
}

function showPortraitPreview(src) {
  document.getElementById('dm-portrait-preview').src = src;
  document.getElementById('preview-wrapper').style.display = 'flex';
}

function removePortrait() {
  dmData.portraitData = '';
  document.getElementById('dm-portrait-url').value = '';
  document.getElementById('portrait-file-input').value = '';
  document.getElementById('preview-wrapper').style.display = 'none';
}

/* ============================================================================
   АВТОМАТИЧНЕ РОЗШИРЕННЯ TEXTAREA
   ============================================================================ */

function setupAutoExpandTextareas() {
  const textareas = document.querySelectorAll('.auto-expand');
  textareas.forEach(textarea => {
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';

    textarea.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });
  });
}

/* ============================================================================
   ЗБЕРЕЖЕННЯ
   ============================================================================ */

/**
 * Збирає всі дані з форми/екрана персонажа та повертає повний JSON-об'єкт.
 * Далі відправляє ці дані на сервер або в БД.
 */
async function saveCharacterData() {
  try {
    // 1. Основні дані персонажа
    const characterId = document.getElementById('char-id')?.value || null; // ID персонажа в БД
    const ownerPlayerId = document.getElementById('player-id')?.value || localStorage.getItem('playerId'); // ID гравця-власника
    const name = document.getElementById('char-name')?.value?.trim() || "Без імені";
    const title = document.getElementById('char-title')?.value?.trim() || "";
    const avatarUrl = document.getElementById('char-avatar-url')?.value || document.getElementById('char-avatar-img')?.src || "";
    const backstory = document.getElementById('char-backstory')?.value?.trim() || "";

    // 2. Здоров'я та Захист
    const hpCurrent = parseInt(document.getElementById('current-hp')?.innerText || "0", 10);
    const hpMax = parseInt(document.getElementById('max-hp')?.value || "0", 10);
    const ac = parseInt(document.getElementById('ac-val')?.value || "10", 10);

    // 3. Монети
    const coins = {
      gp: parseInt(document.getElementById('gp-val')?.innerText || "0", 10),
      sp: parseInt(document.getElementById('sp-val')?.innerText || "0", 10),
      cp: parseInt(document.getElementById('cp-val')?.innerText || "0", 10)
    };

    // 4. Характеристики (Stats)
    const stats = {
      str: parseInt(document.getElementById('stat-str')?.value || "10", 10),
      dex: parseInt(document.getElementById('stat-dex')?.value || "10", 10),
      con: parseInt(document.getElementById('stat-con')?.value || "10", 10),
      int: parseInt(document.getElementById('stat-int')?.value || "10", 10),
      wis: parseInt(document.getElementById('stat-wis')?.value || "10", 10),
      cha: parseInt(document.getElementById('stat-cha')?.value || "10", 10)
    };

    // 5. Уміння / Навички (Abilities/Skills)
    const abilities = [];
    document.querySelectorAll('.ability-card-item').forEach(card => {
      abilities.push({
        id: card.dataset.abilityId || null,
        name: card.querySelector('.ability-name-input')?.value?.trim() || "",
        description: card.querySelector('.ability-desc-input')?.value?.trim() || "",
        mechanism: card.querySelector('.ability-mechanism-input')?.value?.trim() || "", // Принцип дії (напр., "Кидок d20 + Модифікатор Сили")
        actionType: card.querySelector('.ability-action-type')?.value || "active", // "active", "passive", "reaction", "bonus"
        costOrUsage: card.querySelector('.ability-usage-input')?.value?.trim() || "" // к-сть використань/ресурс
      });
    });

    // 6. Предмети (Inventory)
    const inventory = [];
    document.querySelectorAll('.inventory-card-item').forEach(card => {
      inventory.push({
        id: card.dataset.itemId || null,
        name: card.querySelector('.item-name-input')?.value?.trim() || "",
        description: card.querySelector('.item-desc-input')?.value?.trim() || "",
        quantity: parseInt(card.querySelector('.item-qty-input')?.value || "1", 10),
        imageUrl: card.querySelector('.item-img-input')?.value || card.querySelector('img')?.src || ""
      });
    });

    // Підсумковий об'єкт персонажа
    const characterPayload = {
      id: characterId,
      ownerPlayerId: ownerPlayerId,
      name: name,
      title: title,
      avatarUrl: avatarUrl,
      backstory: backstory,
      hp: { current: hpCurrent, max: hpMax },
      ac: ac,
      coins: coins,
      stats: stats,
      abilities: abilities,
      inventory: inventory,
      updatedAt: new Date().toISOString()
    };

    console.log("Збереження персонажа:", characterPayload);

    // Відправка на сервер / API
    const response = await fetch('/api/characters/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(characterPayload)
    });

    const result = await response.json();
    if (response.ok) {
      alert("Персонажа успішно збережено!");
    } else {
      alert("Помилка збереження: " + (result.message || "Невідома помилка"));
    }

  } catch (error) {
    console.error("Помилка під час збору даних персонажа:", error);
    alert("Критична помилка при збереженні!");
  }
}
