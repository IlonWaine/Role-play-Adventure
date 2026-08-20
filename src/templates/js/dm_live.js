// =============================================================================
// DM LIVE DASHBOARD - керування живою сесією.
// URL: /dm_live?session_id=...
// =============================================================================

let sessionId = null;
let sessionData = null;
let chatMessages = [];
let lastMessageId = 0;
let isFirstMessageLoad = true;
let draggedItem = null;
let selectedItemForGiving = null; // тап-альтернатива drag&drop для мобільних
let ws = null;

async function init() {
  sessionId = new URLSearchParams(window.location.search).get('session_id');
  if (!sessionId) {
    alert('Не вказано ID сесії.');
    window.location.href = '/session_setup';
    return;
  }

  await loadSession();
  if (!sessionData) return;

  setupChatRecipientOptions();
  setupKeyboardResize();
  await loadMessages();

  connectWebSocket();
  // Запасні REST-опитування на випадок розриву WS - рідше, ніж раніше,
  // бо основне оновлення тепер прилітає миттєво через сокет.
  setInterval(loadMessages, 15000);
  setInterval(refreshParticipants, 20000);
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
    } else if (data.type === 'inventory') {
      await refreshParticipants();
    } else if (data.type === 'state') {
      // Живий HP ворогів змінився (напр. з іншої вкладки DM) - оновлюємо сценарій.
      await loadSession();
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 3000);
  };
  ws.onerror = () => ws.close();

  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send('ping');
    } else {
      clearInterval(pingInterval);
    }
  }, 25000);
}

async function loadSession() {
  try {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) {
      alert('Сесію не знайдено (можливо, вона вже завершена).');
      window.location.href = '/session_setup';
      return;
    }
    sessionData = await res.json();
    document.getElementById('storyTitleDisplay').innerText = sessionData.story_title;
    document.getElementById('roomCodeDisplay').innerText = sessionData.room_code;
    renderParticipants();
    renderActs();
  } catch (err) {
    console.error(err);
  }
}

async function refreshParticipants() {
  try {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) return;
    const fresh = await res.json();
    sessionData.participants = fresh.participants;
    renderParticipants();
  } catch (err) {
    console.error(err);
  }
}

// --- УЧАСНИКИ ---
function renderParticipants() {
  const container = document.getElementById('participantsContainer');
  container.innerHTML = '';

  if (!sessionData.participants || sessionData.participants.length === 0) {
    container.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted);">У цій історії ще немає прив\'язаних персонажів.</p>';
    return;
  }

  sessionData.participants.forEach(p => {
    const pct = p.max_hp > 0 ? Math.max(0, Math.min(100, Math.round((p.current_hp / p.max_hp) * 100))) : 0;
    const card = document.createElement('div');
    card.className = 'participant-card';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong style="color:var(--accent-gold);">${p.name}</strong>
        <span style="font-size:0.7rem; color:var(--text-muted);">${p.role || ''}</span>
      </div>
      <div class="hp-mini-bar-outer"><div class="hp-mini-bar-inner" style="width:${pct}%;"></div></div>
      <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
        <span>❤️ ${p.current_hp}/${p.max_hp}</span>
        <span>🛡️ ${p.ac}</span>
      </div>
      ${p.goal ? `<div style="font-size:0.7rem; color:var(--text-muted); margin-top:6px;"><i class="fa-solid fa-bullseye"></i> ${p.goal}</div>` : ''}
      <div class="item-drop-zone" data-char-id="${p.id}">
        <i class="fa-solid fa-hand-holding-heart"></i> Перетягніть сюди або торкніться після вибору предмета
      </div>
    `;
    container.appendChild(card);
    setupItemDropZone(card.querySelector('.item-drop-zone'));
  });
}

// --- СЦЕНАРІЙ (read-only + жива HP ворогів + drag предметів) ---
function renderActs() {
  const container = document.getElementById('actsContainer');
  container.innerHTML = '';

  if (!sessionData.acts || sessionData.acts.length === 0) {
    container.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted);">У цій історії ще немає жодного Акту.</p>';
    return;
  }

  sessionData.acts.forEach(act => {
    const actCard = document.createElement('div');
    actCard.className = 'act-card';

    const header = document.createElement('div');
    header.className = 'act-header';
    header.innerText = act.title;
    actCard.appendChild(header);

    if (!act.blocks) act.blocks = [];

    const actBlocksWrap = document.createElement('div');
    actBlocksWrap.style.display = 'flex';
    actBlocksWrap.style.flexDirection = 'column';
    actBlocksWrap.style.gap = '10px';
    renderBlocksReadonly(act.blocks, actBlocksWrap);
    actCard.appendChild(actBlocksWrap);

    // Якщо в цьому Акті ще немає жодного блоку "Предмети" - даємо кнопку
    // створити його прямо тут, щоб не залежати від того, чи DM додав його
    // заздалегідь у редакторі історії.
    if (!act.blocks.some(b => b.type === 'items')) {
      const addItemsBlockBtn = document.createElement('button');
      addItemsBlockBtn.type = 'button';
      addItemsBlockBtn.className = 'btn btn-dark';
      addItemsBlockBtn.style.cssText = 'font-size:0.7rem; align-self:flex-start;';
      addItemsBlockBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Створити блок предметів';
      addItemsBlockBtn.addEventListener('click', () => {
        act.blocks.push({ id: 'adhoc_' + Date.now(), type: 'items', list: [] });
        renderActs();
      });
      actCard.appendChild(addItemsBlockBtn);
    }

    (act.scenes || []).forEach(scene => {
      const sceneCard = document.createElement('div');
      sceneCard.className = 'scene-card';
      sceneCard.style.marginTop = '10px';

      const sceneHeader = document.createElement('div');
      sceneHeader.className = 'scene-header';
      sceneHeader.innerText = scene.title;
      sceneCard.appendChild(sceneHeader);

      if (!scene.blocks) scene.blocks = [];

      const sceneBlocksWrap = document.createElement('div');
      sceneBlocksWrap.style.display = 'flex';
      sceneBlocksWrap.style.flexDirection = 'column';
      sceneBlocksWrap.style.gap = '8px';
      renderBlocksReadonly(scene.blocks, sceneBlocksWrap);
      sceneCard.appendChild(sceneBlocksWrap);

      if (!scene.blocks.some(b => b.type === 'items')) {
        const addItemsBlockBtn = document.createElement('button');
        addItemsBlockBtn.type = 'button';
        addItemsBlockBtn.className = 'btn btn-dark';
        addItemsBlockBtn.style.cssText = 'font-size:0.7rem; align-self:flex-start; margin-top:6px;';
        addItemsBlockBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Створити блок предметів';
        addItemsBlockBtn.addEventListener('click', () => {
          scene.blocks.push({ id: 'adhoc_' + Date.now(), type: 'items', list: [] });
          renderActs();
        });
        sceneCard.appendChild(addItemsBlockBtn);
      }

      actCard.appendChild(sceneCard);
    });

    container.appendChild(actCard);
  });
}

function renderBlocksReadonly(blocks, container) {
  blocks.forEach(block => {
    const el = document.createElement('div');
    el.className = 'scene-block';

    if (block.type === 'description') {
      el.innerHTML = `
        <div class="scene-block-header">📝 Опис</div>
        <p style="font-size:0.85rem; white-space: pre-line;">${block.content || ''}</p>
      `;
    } else if (block.type === 'visual') {
      el.innerHTML = `
        <div class="scene-block-header">🖼️ Візуальний опис</div>
        ${block.imageUrl ? `<img src="${block.imageUrl}" alt="Візуал" onclick="openImageLightbox(this.src)" style="cursor:zoom-in;"><br>
          <button class="btn btn-outline share-img-btn" style="font-size:0.7rem; margin-top:6px;"><i class="fa-solid fa-share"></i> Поділитись у чаті</button>` : ''}
        ${block.caption ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px; white-space: pre-line;">${block.caption}</div>` : ''}
      `;
      const shareBtn = el.querySelector('.share-img-btn');
      if (shareBtn) shareBtn.addEventListener('click', () => shareImageToChat(block.imageUrl));
    } else if (block.type === 'enemies') {
      // Один шаблонний рядок ("Гоблін ×3") розгортається тут у незалежні
      // екземпляри - кожен зі своїм живим HP. Ключ стану: "enemyIdx_instanceIdx"
      // (composite string) замість простого enemyIdx - жодних змін бекенду
      // не потрібно, enemy_hp і так довільний {block_id: {ключ: hp}}.
      const rows = [];
      (block.list || []).forEach((enemy, enemyIdx) => {
        const qty = Math.max(1, enemy.qty || 1);
        for (let instanceIdx = 0; instanceIdx < qty; instanceIdx++) {
          const compositeKey = `${enemyIdx}_${instanceIdx}`;
          const liveHp = getEnemyHp(block.id, compositeKey, enemy.hp);
          const label = qty > 1 ? `${enemy.name} #${instanceIdx + 1}` : enemy.name;
          rows.push(`
            <div class="enemy-row-live-wrapper">
              <div class="enemy-row-live">
                <span>${label}</span>
                <span>🛡️ ${enemy.ac}</span>
                <span>⚔️ ${enemy.attack}</span>
                <span>❤️ <input type="number" value="${liveHp}" class="enemy-hp-input" data-block-id="${block.id}" data-enemy-idx="${compositeKey}"> / ${enemy.hp}</span>
              </div>
              ${enemy.special ? `<div class="enemy-special-live">🌟 ${enemy.special}</div>` : ''}
            </div>
          `);
        }
      });
      const rowsHtml = rows.join('');

      el.innerHTML = `
        <div class="scene-block-header">⚔️ Група ворогів</div>
        ${block.imageUrl ? `<img src="${block.imageUrl}" alt="Вороги" onclick="openImageLightbox(this.src)" style="cursor:zoom-in;"><br>
          <button class="btn btn-outline share-img-btn" style="font-size:0.7rem; margin-top:6px;"><i class="fa-solid fa-share"></i> Поділитись у чаті</button>` : ''}
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">${rowsHtml}</div>
      `;
      const shareBtn = el.querySelector('.share-img-btn');
      if (shareBtn) shareBtn.addEventListener('click', () => shareImageToChat(block.imageUrl));

      el.querySelectorAll('.enemy-hp-input').forEach(input => {
        input.addEventListener('change', () => {
          updateEnemyHp(input.dataset.blockId, input.dataset.enemyIdx, input.value);
        });
      });
    } else if (block.type === 'items') {
      // Захист від старих історій, де предмет міг бути просто рядком -
      // приводимо до того самого {name, qty, desc}, що й інвентар персонажа.
      const items = (block.list || []).map(item => typeof item === 'string' ? { name: item, qty: 1, desc: '' } : item);
      block.list = items; // нормалізуємо на місці - подальші .push() будуть у правильному форматі

      const chips = items.map(item => `<div class="item-chip" draggable="true">🎁 ${item.name}${item.qty > 1 ? ` x${item.qty}` : ''}</div>`).join('');
      el.innerHTML = `
        <div class="scene-block-header">🎁 Предмети / Лут</div>
        <div class="item-chips-row">${chips}</div>
        <button type="button" class="btn btn-outline add-item-btn" style="font-size:0.7rem; margin-top:6px;">
          <i class="fa-solid fa-plus"></i> Додати предмет
        </button>
      `;
      el.querySelectorAll('.item-chip').forEach((chip, i) => {
        const item = items[i];
        chip.addEventListener('dragstart', () => {
          draggedItem = item;
          chip.classList.add('dragging');
        });
        chip.addEventListener('dragend', () => chip.classList.remove('dragging'));

        // Тап-альтернатива drag&drop для мобільних (native HTML5 drag&drop
        // ненадійний на сенсорних екранах). Тап по предмету виділяє його,
        // повторний тап по тому ж предмету знімає виділення.
        chip.addEventListener('click', () => {
          if (selectedItemForGiving === item) {
            clearItemSelection();
          } else {
            clearItemSelection();
            selectedItemForGiving = item;
            chip.classList.add('selected');
          }
        });
      });

      // Створення предмета "на ходу" (для непередбачуваних ситуацій).
      // Свідомо НЕ зберігається окремо в БД сесії/історії - додається лише
      // в локальний стан цієї вкладки браузера. Реально збережеться щойно
      // DM перетягне його на картку персонажа (giveItemToCharacter пише
      // прямо в БД персонажа).
      el.querySelector('.add-item-btn').addEventListener('click', () => {
        openAddItemModal((newItem) => {
          block.list.push(newItem);
          renderActs();
        });
      });
    }

    container.appendChild(el);
  });
}

function openAddItemModal(onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.style.cursor = 'default';
  overlay.innerHTML = `
    <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; padding:16px; width:100%; max-width:320px; display:flex; flex-direction:column; gap:8px;" onclick="event.stopPropagation()">
      <div style="font-weight:700; color:var(--accent-gold);">🎁 Новий предмет</div>
      <input type="text" id="newItemName" placeholder="Назва предмета" style="background:var(--bg-input); border:1px solid var(--border-color); border-radius:4px; color:var(--text-main); padding:6px 8px;">
      <input type="number" id="newItemQty" value="1" min="1" placeholder="Кількість" style="background:var(--bg-input); border:1px solid var(--border-color); border-radius:4px; color:var(--text-main); padding:6px 8px;">
      <input type="text" id="newItemDesc" placeholder="Опис (необов'язково)" style="background:var(--bg-input); border:1px solid var(--border-color); border-radius:4px; color:var(--text-main); padding:6px 8px;">
      <div style="display:flex; gap:8px; margin-top:4px;">
        <button type="button" id="cancelAddItem" class="btn btn-dark" style="flex:1;">Скасувати</button>
        <button type="button" id="confirmAddItem" class="btn btn-gold" style="flex:1;">Додати</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', () => overlay.remove());
  overlay.querySelector('#cancelAddItem').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#confirmAddItem').addEventListener('click', () => {
    const name = overlay.querySelector('#newItemName').value.trim();
    if (!name) {
      alert('Введіть назву предмета.');
      return;
    }
    const qty = parseInt(overlay.querySelector('#newItemQty').value) || 1;
    const desc = overlay.querySelector('#newItemDesc').value.trim();
    overlay.remove();
    onConfirm({ name, qty, desc });
  });

  overlay.querySelector('#newItemName').focus();
}

function getEnemyHp(blockId, instanceKey, defaultVal) {
  const override = sessionData.state && sessionData.state.enemy_hp
    && sessionData.state.enemy_hp[blockId]
    && sessionData.state.enemy_hp[blockId][String(instanceKey)];
  return override !== undefined ? override : defaultVal;
}

async function updateEnemyHp(blockId, instanceKey, value) {
  const hp = parseInt(value) || 0;
  sessionData.state = sessionData.state || {};
  sessionData.state.enemy_hp = sessionData.state.enemy_hp || {};
  sessionData.state.enemy_hp[blockId] = sessionData.state.enemy_hp[blockId] || {};
  sessionData.state.enemy_hp[blockId][String(instanceKey)] = hp;

  try {
    await fetch(`/api/sessions/${sessionId}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enemy_hp: { [blockId]: { [instanceKey]: hp } } })
    });
  } catch (err) {
    console.error(err);
  }
}

// --- ПЕРЕДАЧА ПРЕДМЕТІВ DRAG & DROP ---
function setupItemDropZone(el) {
  el.addEventListener('dragover', (e) => {
    if (draggedItem === null) return;
    e.preventDefault();
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (draggedItem === null) return;
    const targetCharId = parseInt(el.dataset.charId);
    giveItemToCharacter(targetCharId, draggedItem);
    draggedItem = null;
  });

  // Тап-альтернатива для мобільних: спочатку торкнутись предмета
  // (позначається жовтою рамкою), потім торкнутись цієї зони.
  el.addEventListener('click', () => {
    if (selectedItemForGiving === null) return;
    const targetCharId = parseInt(el.dataset.charId);
    giveItemToCharacter(targetCharId, selectedItemForGiving);
    clearItemSelection();
  });
}

function clearItemSelection() {
  selectedItemForGiving = null;
  document.querySelectorAll('.item-chip.selected').forEach(c => c.classList.remove('selected'));
}

let isGivingItem = false;

async function giveItemToCharacter(targetCharId, item) {
  // Захист від подвійного дарування - нестабільний native drag&drop на
  // сенсорних екранах іноді спрацьовує двічі поспіль, даючи предмет
  // двома окремими записами замість одного.
  if (isGivingItem) return;
  isGivingItem = true;

  try {
    const participant = sessionData.participants.find(p => p.id === targetCharId);
    if (!participant) return;

    // Копія предмета, а не сам об'єкт з блоку сценарію - дарування персонажу
    // не повинно змінювати шаблон "Предмети" в самій історії.
    const newInventory = [
      ...(participant.inventory || []),
      { name: item.name, qty: item.qty || 1, desc: item.desc || '' }
    ];

    const res = await fetch(`/api/characters/${targetCharId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventory: newInventory })
    });
    if (res.ok) {
      const updated = await res.json();
      participant.inventory = updated.inventory;
      renderParticipants();
      await sendDmChatMessage('all', null, `🎁 DM передав "${item.name}" гравцю ${participant.name}.`);
    } else {
      alert('Помилка передачі предмета.');
    }
  } catch (err) {
    console.error(err);
    alert("Помилка з'єднання з сервером.");
  } finally {
    isGivingItem = false;
  }
}

// --- ЧАТ ---
function setupChatRecipientOptions() {
  const select = document.getElementById('chatRecipient');
  (sessionData.participants || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = `character:${p.id}`;
    opt.textContent = `🧝 ${p.name} (шепіт)`;
    select.appendChild(opt);
  });
}

function toggleChat() {
  document.getElementById('chatSidebar').classList.toggle('open');
  document.getElementById('unreadBadge').style.display = 'none';
}

// На мобільних 100vh/100dvh не завжди звужується разом з появою клавіатури -
// підганяємо висоту чат-панелі під window.visualViewport.
function setupKeyboardResize() {
  if (!window.visualViewport) return;

  const sidebar = document.getElementById('chatSidebar');
  const vv = window.visualViewport;

  function updateHeight() {
    sidebar.style.height = vv.height + 'px';
  }

  vv.addEventListener('resize', updateHeight);
  vv.addEventListener('scroll', updateHeight);
  updateHeight();

  const chatInput = document.getElementById('chatInput');
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
  // Той самий захист від дубля, що й у character_logic.js: WS-сигнал
  // і прямий виклик після власного POST можуть перекритись у часі.
  if (isLoadingMessages) return;
  isLoadingMessages = true;

  try {
    const res = await fetch(`/api/sessions/${sessionId}/messages?viewer_type=dm&after_id=${lastMessageId}`);
    if (!res.ok) return;
    const newMessages = await res.json();

    if (newMessages.length > 0) {
      chatMessages = chatMessages.concat(newMessages);
      lastMessageId = newMessages[newMessages.length - 1].id;
      renderChatMessages(chatMessages);

      if (!isFirstMessageLoad && !document.getElementById('chatSidebar').classList.contains('open')) {
        document.getElementById('unreadBadge').style.display = 'inline';
      }
    }
    isFirstMessageLoad = false;
  } catch (err) {
    console.error(err);
  } finally {
    isLoadingMessages = false;
  }
}

function renderChatMessages(messages) {
  const container = document.getElementById('chatMessages');
  container.innerHTML = messages.map(msg => {
    let bubbleClass = '';
    if (msg.sender_type === 'dm') bubbleClass = 'msg-own';
    else if (msg.recipient_type !== 'all') bubbleClass = 'msg-secret';

    const time = msg.created_at
      ? new Date(msg.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
      : '';

    const imageHtml = (msg.message_type === 'image' && msg.image_url)
      ? `<img src="${msg.image_url}" style="max-width:100%; border-radius:6px; margin-top:4px; cursor:zoom-in;" onclick="openImageLightbox(this.src)">`
      : '';

    return `
      <div class="chat-msg-bubble ${bubbleClass}">
        <div class="chat-msg-author">${msg.sender_name}</div>
        ${msg.text ? `<div>${msg.text}</div>` : ''}
        ${imageHtml}
        <span class="chat-msg-time">${time}</span>
      </div>
    `;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

async function sendDmChatMessage(recipientType, recipientId, text, messageType = 'text', imageUrl = null) {
  try {
    await fetch(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_type: 'dm',
        sender_id: sessionData.dm_id,
        sender_name: 'Dungeon Master',
        recipient_type: recipientType,
        recipient_id: recipientId,
        message_type: messageType,
        text: text,
        image_url: imageUrl
      })
    });
    await loadMessages();
  } catch (err) {
    console.error(err);
  }
}

async function sendDmMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  const val = document.getElementById('chatRecipient').value;
  let recipient_type = 'all';
  let recipient_id = null;
  if (val.startsWith('character:')) {
    recipient_type = 'character';
    recipient_id = parseInt(val.split(':')[1]);
  }

  await sendDmChatMessage(recipient_type, recipient_id, text);
  input.value = '';
}

function shareImageToChat(url) {
  if (!url) return;
  sendDmChatMessage('all', null, '', 'image', url);
}

async function endSession() {
  if (!confirm('Завершити цю сесію? Гравці більше не зможуть підключатись через цей код кімнати. Зміни персонажів вже збережені в базі даних.')) return;
  try {
    await fetch(`/api/sessions/${sessionId}/end`, { method: 'POST' });
    alert('Сесію завершено.');
    window.location.href = '/session_setup';
  } catch (err) {
    console.error(err);
    alert('Помилка завершення сесії.');
  }
}

// Перегляд зображення на весь екран (сценарій, чат)
function openImageLightbox(url) {
  if (!url) return;
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `<img src="${url}" class="lightbox-img" alt="Перегляд зображення">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

init();