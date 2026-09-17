document.addEventListener("DOMContentLoaded", () => {
    // ------------------------------------------------------------------
    // Спільна перевірка входу (раніше дублювалась у кожному з 3 файлів)
    // ------------------------------------------------------------------
    const dmId = localStorage.getItem("dm_id");
    if (!dmId) {
        alert("Будь ласка, увійдіть в акаунт!");
        window.location.href = "/";
        return;
    }

    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("dm_id");
        localStorage.removeItem("dnd_dm_session");
        window.location.href = "/";
    });

    // Очищення старих даних (чат + завершені сесії понад 30 днів) + VACUUM
    // (перенесено сюди з колишньої панелі #dmDashboard на Menu.html)
    const cleanupBtn = document.getElementById("cleanupBtn");
    cleanupBtn.addEventListener("click", async () => {
        const confirmed = confirm(
            "Видалити чат і завершені ігрові сесії, старіші за 30 днів, та звільнити місце в БД (VACUUM)?\n\n" +
            "Персонажів, гравців та історії це НЕ торкнеться - тільки старе листування закінчених ігор."
        );
        if (!confirmed) return;

        cleanupBtn.disabled = true;
        const originalIcon = cleanupBtn.innerHTML;
        cleanupBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            const cleanupRes = await fetch("/api/maintenance/cleanup-sessions?days=30", { method: "POST" });
            const cleanupResult = await cleanupRes.json().catch(() => ({}));

            if (!cleanupRes.ok) {
                alert(cleanupResult.detail || "Помилка очищення.");
                return;
            }

            const vacuumRes = await fetch("/api/maintenance/vacuum", { method: "POST" });
            const vacuumOk = vacuumRes.ok;

            alert(
                `Видалено сесій: ${cleanupResult.deleted_sessions ?? 0}\n` +
                `Видалено повідомлень чату: ${cleanupResult.deleted_messages ?? 0}\n` +
                (vacuumOk ? "Місце на диску звільнено (VACUUM виконано)." : "VACUUM не вдався (не критично, дані вже видалені).")
            );
        } catch (err) {
            console.error(err);
            alert("Помилка з'єднання з сервером.");
        } finally {
            cleanupBtn.disabled = false;
            cleanupBtn.innerHTML = originalIcon;
        }
    });

    // ==================================================================
    // ВКЛАДКИ / СВАЙП
    // Трек прокручується нативно (overflow-x + scroll-snap), тому свайп
    // на телефоні працює "з коробки" - тут лише синхронізуємо активну
    // кнопку вкладки з тим, яка панель зараз у полі зору, і навпаки:
    // клік по вкладці прокручує трек до потрібної панелі.
    // ==================================================================
    const tabsTrack = document.getElementById("tabsTrack");
    const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
    const panels = Array.from(document.querySelectorAll(".tab-panel"));

    function setActiveTab(index) {
        tabButtons.forEach((btn, i) => btn.classList.toggle("active", i === index));
    }

    tabButtons.forEach((btn, i) => {
        btn.addEventListener("click", () => {
            panels[i].scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
            setActiveTab(i);
        });
    });

    let scrollDebounce;
    tabsTrack.addEventListener("scroll", () => {
        clearTimeout(scrollDebounce);
        scrollDebounce = setTimeout(() => {
            const index = Math.round(tabsTrack.scrollLeft / tabsTrack.clientWidth);
            setActiveTab(index);
        }, 80);
    });

    // Дозволяє відкрити конкретну вкладку одразу через ?tab=stories
    // (напр. якщо колись знадобиться лінк "Створити історію" з іншої сторінки)
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    const tabIndexByName = { players: 0, stories: 1, sessions: 2 };
    if (requestedTab && tabIndexByName.hasOwnProperty(requestedTab)) {
        const idx = tabIndexByName[requestedTab];
        panels[idx].scrollIntoView({ behavior: "instant", inline: "start", block: "nearest" });
        setActiveTab(idx);
    }

    // Дані всіх трьох панелей завантажуємо одразу - списки невеликі,
    // і так вкладки перемикаються миттєво без "миготіння" завантаження.
    loadPlayers();
    loadStories();
    loadSessions();

    // ==================================================================
    // ВКЛАДКА 1: ГРАВЦІ
    // ==================================================================
    const playersListEl = document.getElementById("playersList");
    const addPlayerForm = document.getElementById("addPlayerForm");

    addPlayerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("playerNameInput").value.trim();
        if (!name) return;

        const response = await fetch("/api/players", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name, dm_id: parseInt(dmId) })
        });

        if (response.ok) {
            document.getElementById("playerNameInput").value = "";
            loadPlayers();
        } else {
            alert("Помилка при створенні гравця");
        }
    });

    async function createCharacterAndOpen(playerId) {
        const response = await fetch("/api/characters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ player_id: parseInt(playerId), name: "Новий герой" })
        });

        if (!response.ok) {
            alert("Помилка при створенні персонажа");
            return;
        }

        const newChar = await response.json();
        window.location.href = `/character_creation?char_id=${newChar.id}&player_id=${playerId}`;
    }

    function openCharacterEditor(charId, playerId) {
        window.location.href = `/character_creation?char_id=${charId}&player_id=${playerId}`;
    }

    async function loadPlayers() {
        const res = await fetch(`/api/dm/${dmId}/players`);
        if (!res.ok) return;
        const players = await res.json();
        renderPlayersList(players);
    }

    function renderPlayersList(players) {
        playersListEl.innerHTML = "";

        if (players.length === 0) {
            playersListEl.innerHTML = '<p class="empty-state">У вас поки немає доданих гравців. Додайте першого вище.</p>';
            return;
        }

        players.forEach(player => {
            const card = document.createElement("div");
            card.className = "player-card";

            const head = document.createElement("div");
            head.className = "player-head";
            const charCountText = player.characters.length === 0
                ? "Немає персонажів"
                : `${player.characters.length} ${pluralUk(player.characters.length, 'персонаж', 'персонажі', 'персонажів')}`;
            head.innerHTML = `
                <div class="player-avatar"><i class="fa-solid fa-user"></i></div>
                <div class="player-head-text">
                    <div class="player-name">${player.name}</div>
                    <div class="player-meta"><code>ID: ${player.player_code}</code><span>${charCountText}</span></div>
                </div>
                <i class="fa-solid fa-chevron-down chevron"></i>
            `;
            head.addEventListener("click", () => card.classList.toggle("open"));

            const playerActions = document.createElement("div");
            playerActions.className = "player-actions";

            const newCharBtn = document.createElement("button");
            newCharBtn.type = "button";
            newCharBtn.className = "btn-mini";
            newCharBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Новий герой';
            newCharBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                createCharacterAndOpen(player.id);
            });
            playerActions.appendChild(newCharBtn);

            const deletePlayerBtn = document.createElement("button");
            deletePlayerBtn.type = "button";
            deletePlayerBtn.className = "btn-mini danger";
            deletePlayerBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Видалити гравця';
            deletePlayerBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const confirmed = confirm(
                    `Видалити гравця "${player.name}" разом з УСІМА його персонажами (${player.characters.length})? Це незворотньо.`
                );
                if (!confirmed) return;

                const res = await fetch(`/api/players/${player.id}`, { method: 'DELETE' });
                if (res.ok) {
                    loadPlayers();
                } else {
                    alert('Помилка видалення гравця.');
                }
            });
            playerActions.appendChild(deletePlayerBtn);

            const charsList = document.createElement("div");
            charsList.className = "char-list";

            if (player.characters.length === 0) {
                charsList.innerHTML = '<div class="empty-hint">Персонажів ще немає — натисніть "Новий герой" вище</div>';
            } else {
                player.characters.forEach(char => {
                    const charCard = document.createElement("div");
                    charCard.className = "char-card";
                    charCard.innerHTML = `
                        <div class="char-main">
                            <i class="fa-solid fa-chess-knight char-icon"></i>
                            <div>
                                <div class="char-name">${char.name}</div>
                                ${char.role ? `<div class="char-role">${char.role}</div>` : ''}
                            </div>
                        </div>
                        <button type="button" class="btn-del-icon" title="Видалити персонажа"><i class="fa-solid fa-trash"></i></button>
                    `;
                    charCard.addEventListener("click", (e) => {
                        if (e.target.closest('.btn-del-icon')) return;
                        openCharacterEditor(char.id, player.id);
                    });
                    charCard.querySelector('.btn-del-icon').addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const confirmed = confirm(`Видалити персонажа "${char.name}" назавжди?`);
                        if (!confirmed) return;

                        const res = await fetch(`/api/characters/${char.id}`, { method: 'DELETE' });
                        if (res.ok) {
                            loadPlayers();
                        } else {
                            alert('Помилка видалення персонажа.');
                        }
                    });
                    charsList.appendChild(charCard);
                });
            }

            card.appendChild(head);
            card.appendChild(playerActions);
            card.appendChild(charsList);
            playersListEl.appendChild(card);
        });
    }

    function pluralUk(n, one, few, many) {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
        return many;
    }

    // ==================================================================
    // ВКЛАДКА 2: ІСТОРІЇ
    // ==================================================================
    const storiesListEl = document.getElementById("storiesList");
    const addStoryForm = document.getElementById("addStoryForm");

    addStoryForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const titleInput = document.getElementById("storyTitleInput");
        const title = titleInput.value.trim();
        if (!title) return;

        const response = await fetch("/api/stories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dm_id: parseInt(dmId), title: title })
        });

        if (response.ok) {
            const newStory = await response.json();
            window.location.href = `/dm_create?story_id=${newStory.id}`;
        } else {
            alert("Помилка при створенні історії");
        }
    });

    function openStoryEditor(storyId) {
        window.location.href = `/dm_create?story_id=${storyId}`;
    }

    async function loadStories() {
        const res = await fetch(`/api/dm/${dmId}/stories`);
        if (!res.ok) return;
        const stories = await res.json();
        renderStoriesList(stories);
        renderSessionStoryPicker(stories); // та сама відповідь, друге використання - на вкладці "Сесії"
    }

    function renderStoriesList(stories) {
        storiesListEl.innerHTML = "";

        if (stories.length === 0) {
            storiesListEl.innerHTML = '<p class="empty-state">У вас поки немає створених історій. Створіть першу вище.</p>';
            return;
        }

        stories.forEach(story => {
            const card = document.createElement("div");
            card.className = "story-card";
            card.innerHTML = `
                <i class="fa-solid fa-book-open story-icon"></i>
                <span class="story-title">${story.title}</span>
            `;
            card.addEventListener("click", () => openStoryEditor(story.id));
            storiesListEl.appendChild(card);
        });
    }

    // ==================================================================
    // ВКЛАДКА 3: СЕСІЇ
    // ==================================================================
    const activeSessionsListEl = document.getElementById("activeSessionsList");
    const sessionStoryPickerEl = document.getElementById("sessionStoryPicker");

    async function loadSessions() {
        const res = await fetch(`/api/dm/${dmId}/sessions?include_ended=true`);
        if (!res.ok) return;
        const sessions = await res.json();

        if (sessions.length === 0) {
            activeSessionsListEl.innerHTML = '<p class="empty-state">Немає жодної сесії. Оберіть історію нижче, щоб почати нову.</p>';
            return;
        }

        activeSessionsListEl.innerHTML = "";
        sessions.forEach(s => {
            const card = document.createElement("div");
            card.className = "session-card" + (s.is_active ? " is-live" : " is-ended");
            card.innerHTML = `
                <div class="session-main">
                    <i class="fa-solid fa-book-open story-icon"></i>
                    <span class="session-title">${s.story_title}</span>
                    <span class="badge-room-code">${s.room_code}</span>
                    ${!s.is_active ? '<span class="badge-ended">завершено</span>' : ''}
                </div>
                <button type="button" class="btn-del-icon" title="Видалити сесію назавжди"><i class="fa-solid fa-trash"></i></button>
            `;

            if (s.is_active) {
                card.addEventListener("click", (e) => {
                    if (e.target.closest('.btn-del-icon')) return;
                    window.location.href = `/dm_live?session_id=${s.id}`;
                });
            }

            card.querySelector('.btn-del-icon').addEventListener('click', async (e) => {
                e.stopPropagation();
                const confirmed = confirm(
                    `Видалити сесію "${s.story_title}" (${s.room_code}) назавжди?\n` +
                    `Це видалить увесь чат цієї сесії. Персонажів і саму історію це НЕ торкнеться.`
                );
                if (!confirmed) return;

                const delRes = await fetch(`/api/sessions/${s.id}`, { method: 'DELETE' });
                if (delRes.ok) {
                    loadSessions();
                } else {
                    alert('Помилка видалення сесії.');
                }
            });

            activeSessionsListEl.appendChild(card);
        });
    }

    function renderSessionStoryPicker(stories) {
        sessionStoryPickerEl.innerHTML = "";

        if (stories.length === 0) {
            sessionStoryPickerEl.innerHTML = '<p class="empty-state">У вас ще немає створених історій. Спочатку створіть історію на вкладці "Історії".</p>';
            return;
        }

        stories.forEach(story => {
            const card = document.createElement("div");
            card.className = "story-card";
            card.innerHTML = `
                <i class="fa-solid fa-play story-icon"></i>
                <span class="story-title">${story.title}</span>
            `;
            card.addEventListener("click", async () => {
                const res = await fetch("/api/sessions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dm_id: parseInt(dmId), story_id: story.id })
                });
                if (res.ok) {
                    const session = await res.json();
                    window.location.href = `/dm_live?session_id=${session.id}`;
                } else {
                    alert("Помилка при запуску сесії");
                }
            });
            sessionStoryPickerEl.appendChild(card);
        });
    }
});