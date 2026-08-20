/**
 * ============================================================================
 * D&D CHARACTER BUILDER & EDITOR LOGIC (DM SMARTPHONE OPTIMIZED)
 * ============================================================================
 * Сторінка відкривається як /character_creation?char_id=...&player_id=...
 * char_id - обов'язковий: player_navigation.js завжди спочатку створює
 * порожнього персонажа через POST /api/characters, і тільки потім відкриває
 * цю сторінку з готовим id.
 */

const emptyCharacterTemplate = {
  name: "",
  role: "",
  session: "",
  maxHP: 10,
  currentHP: 10,
  ac: 10,
  maxSlots: 10,
  stats: [
    { name: "💪 Сила", val: 0 },
    { name: "🏃 Спритність", val: 0 },
    { name: "🧐 Ініціатива", val: 0 },
    { name: "🔮 Магія", val: 0 },
    { name: "🔎 Спостережливість", val: 0 },
    { name: "🎭 Харизма", val: 0 }
  ],
  abilities: [],
  inventory: [],
  coins: { gp: 0, sp: 0, cp: 0 },
  backstory: "",
  portraitData: ""
};

let dmData = { ...emptyCharacterTemplate };

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    charId: params.get('char_id'),
    playerId: params.get('player_id')
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  const { charId } = getUrlParams();

  if (!charId) {
    alert("Не вказано персонажа для редагування (відсутній char_id у посиланні).");
    window.location.href = '/player_navigation';
    return;
  }

  await loadCharacterFromServer(charId);

  initFormValues();
  setupDragAndDrop();
  setupAutoExpandTextareas();
});

async function loadCharacterFromServer(charId) {
  try {
    const response = await fetch(`/api/characters/${charId}`);
    if (!response.ok) {
      alert("Персонажа не знайдено на сервері.");
      window.location.href = '/player_navigation';
      return;
    }
    const data = await response.json();

    dmData = {
      name: data.name || "",
      role: data.role || "",
      session: data.session || "",
      maxHP: data.max_hp ?? 10,
      currentHP: data.current_hp ?? 10,
      ac: data.ac ?? 10,
      maxSlots: data.max_slots ?? 10,
      stats: (data.stats && data.stats.length) ? data.stats : emptyCharacterTemplate.stats,
      abilities: data.abilities || [],
      inventory: data.inventory || [],
      coins: { gp: data.gp || 0, sp: data.sp || 0, cp: data.cp || 0 },
      backstory: data.backstory || "",
      portraitData: data.portrait_data || ""
    };
  } catch (err) {
    console.error(err);
    alert("Помилка з'єднання з сервером під час завантаження персонажа.");
  }
}

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

/* Синхронізація верхніх полів у dmData (щоб не було ReferenceError
   на oninput="saveDraft()" у character_creation.html). Значення все одно
   ще раз читаються напряму з DOM при збереженні - це просто для консистентності. */
function saveDraft() {
  dmData.name = document.getElementById('dm-char-name').value;
  dmData.role = document.getElementById('dm-char-role').value;
  dmData.session = document.getElementById('dm-session').value;
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

  // НЕ відкриваємо файловий діалог по кліку на всю зону - це забирає фокус
  // з div і ламає подальшу вставку через Ctrl+V. Клік на зону лише фокусує
  // її (для paste), а явний вибір файлу - окрема кнопка всередині.
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

function handleImagePaste(event, callback) {
  const items = event.clipboardData && event.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      event.preventDefault();
      const file = item.getAsFile();
      if (file) uploadPastedImage(file, callback);
      return;
    }
  }
}

async function uploadPastedImage(file, callback) {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || 'Не вдалося завантажити вставлене зображення.');
      return;
    }
    const result = await res.json();
    callback(result.url);
  } catch (err) {
    console.error(err);
    alert("Помилка з'єднання при завантаженні зображення.");
  }
}

function openImageLightbox(url) {
  if (!url) return;
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `<img src="${url}" class="lightbox-img" alt="Перегляд зображення">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

async function processImageFile(file) {
  if (!file.type.startsWith('image/')) return;

  // Тимчасовий локальний прев'ю, поки файл вантажиться на сервер -
  // без цього портрет "мовчить" кілька секунд під час завантаження.
  const tempReader = new FileReader();
  tempReader.onload = (e) => showPortraitPreview(e.target.result);
  tempReader.readAsDataURL(file);

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || 'Не вдалося завантажити зображення на сервер.');
      return;
    }
    const result = await res.json();
    dmData.portraitData = result.url;
    showPortraitPreview(result.url);
    document.getElementById('dm-portrait-url').value = result.url;
  } catch (err) {
    console.error(err);
    alert("Помилка з'єднання при завантаженні зображення.");
  }
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

async function saveCharacterData() {
  const { charId } = getUrlParams();
  if (!charId) {
    alert("Не вказано char_id - неможливо зберегти.");
    return;
  }

  saveDraft(); // підтягуємо name/role/session у dmData про всяк випадок

  const payload = {
    name: document.getElementById('dm-char-name').value.trim() || "Без імені",
    role: document.getElementById('dm-char-role').value.trim(),
    session: document.getElementById('dm-session').value.trim(),
    current_hp: parseInt(document.getElementById('dm-current-hp').value) || 0,
    max_hp: parseInt(document.getElementById('dm-max-hp').value) || 0,
    ac: parseInt(document.getElementById('dm-ac').value) || 0,
    max_slots: parseInt(document.getElementById('dm-max-slots').value) || 0,
    gp: parseInt(document.getElementById('dm-gp').value) || 0,
    sp: parseInt(document.getElementById('dm-sp').value) || 0,
    cp: parseInt(document.getElementById('dm-cp').value) || 0,
    stats: dmData.stats,
    abilities: dmData.abilities,
    inventory: dmData.inventory,
    backstory: document.getElementById('dm-backstory').value,
    portrait_data: dmData.portraitData || ""
  };

  try {
    const response = await fetch(`/api/characters/${charId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      alert("Персонажа успішно збережено!");
    } else {
      const result = await response.json().catch(() => ({}));
      alert("Помилка збереження: " + (result.detail || `HTTP ${response.status}`));
    }
  } catch (error) {
    console.error("Помилка під час збереження персонажа:", error);
    alert("Критична помилка при збереженні!");
  }
}