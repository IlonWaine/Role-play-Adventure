document.addEventListener("DOMContentLoaded", () => {
    // Перевіряємо, чи є ID Майстра в localStorage
    const dmId = localStorage.getItem("dm_id");

    if (!dmId) {
        alert("Будь ласка, увійдіть в акаунт!");
        window.location.href = "/"; // Перенаправлення на головну
        return;
    }

    const playersListEl = document.getElementById("playersList");
    const addPlayerForm = document.getElementById("addPlayerForm");
    const logoutBtn = document.getElementById("logoutBtn");

    // Завантаження всіх даних під час відкриття сторінки
    loadDashboardData();

    // Вихід (чистимо ОБИДВА ключі, як і на Menu.html)
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("dm_id");
        localStorage.removeItem("dnd_dm_session");
        window.location.href = "/";
    });

    // Створення гравця
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
            loadDashboardData();
        } else {
            alert("Помилка при створенні гравця");
        }
    });

    // Створення "порожнього" персонажа та перехід у редактор
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

    // Завантажити гравців та їх персонажів
    async function loadDashboardData() {
        const res = await fetch(`/api/dm/${dmId}/players`);
        if (!res.ok) return;

        const players = await res.json();
        renderPlayersList(players);
    }

    // Відображення акордеона зі списками
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

            // Кнопки дій для гравця (новий персонаж / видалити гравця) -
            // за межами charsList, як і раніше, щоб не ховатись разом зі
            // згорнутим акордеоном.
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
                    loadDashboardData();
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
                            loadDashboardData();
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

    // Українська плюралізація (1 персонаж / 2 персонажі / 5 персонажів)
    function pluralUk(n, one, few, many) {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
        return many;
    }
});