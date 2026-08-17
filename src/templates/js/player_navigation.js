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
            playersListEl.innerHTML = "<p>У вас поки немає доданих гравців.</p>";
            return;
        }

        players.forEach(player => {
            const item = document.createElement("div");
            item.className = "player-item";

            const header = document.createElement("div");
            header.className = "player-header";
            header.innerHTML = `<span>Гравець: ${player.name} <span class="player-code-badge">ID: ${player.player_code}</span></span> <span>Персонажів: ${player.characters.length} ▼</span>`;

            // Кнопки дій для гравця (новий персонаж / видалити гравця).
            // Свідомо ЗА МЕЖАМИ charsList — інакше ховаються разом
            // зі згорнутим акордеоном і їх просто не видно.
            const playerActions = document.createElement("div");
            playerActions.className = "player-actions";

            const newCharBtn = document.createElement("button");
            newCharBtn.type = "button";
            newCharBtn.className = "btn-add-char";
            newCharBtn.textContent = "+ Новий герой";
            newCharBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                createCharacterAndOpen(player.id);
            });
            playerActions.appendChild(newCharBtn);

            const deletePlayerBtn = document.createElement("button");
            deletePlayerBtn.type = "button";
            deletePlayerBtn.className = "btn-add-char btn-delete-inline";
            deletePlayerBtn.textContent = "🗑️ Видалити гравця";
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
            charsList.className = "characters-list";

            if (player.characters.length === 0) {
                charsList.innerHTML = "<em>Немає створених персонажів</em>";
            } else {
                player.characters.forEach(char => {
                    const charCard = document.createElement("div");
                    charCard.className = "character-card character-card-link";
                    charCard.innerHTML = `
                        <span>${char.name}${char.role ? " — " + char.role : ""}</span>
                        <button type="button" class="btn-delete-inline" title="Видалити персонажа">🗑️</button>
                    `;
                    charCard.addEventListener("click", (e) => {
                        if (e.target.closest('.btn-delete-inline')) return;
                        openCharacterEditor(char.id, player.id);
                    });
                    charCard.querySelector('.btn-delete-inline').addEventListener('click', async (e) => {
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

            // Логіка згортання/розгортання списку
            header.addEventListener("click", () => {
                charsList.classList.toggle("open");
            });

            item.appendChild(header);
            item.appendChild(playerActions);
            item.appendChild(charsList);
            playersListEl.appendChild(item);
        });
    }
});