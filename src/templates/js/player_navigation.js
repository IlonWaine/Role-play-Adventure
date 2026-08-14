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
            header.innerHTML = `<span>Гравець: ${player.name}</span> <span>Персонажів: ${player.characters.length} ▼</span>`;

            // Кнопка створення нового персонажа для цього гравця.
            // Свідомо ЗА МЕЖАМИ charsList — інакше вона ховається разом
            // зі згорнутим акордеоном і її просто не видно.
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

            const charsList = document.createElement("div");
            charsList.className = "characters-list";

            if (player.characters.length === 0) {
                charsList.innerHTML = "<em>Немає створених персонажів</em>";
            } else {
                player.characters.forEach(char => {
                    const charCard = document.createElement("div");
                    charCard.className = "character-card character-card-link";
                    charCard.innerHTML = `<strong>${char.name}</strong>${char.role ? " — " + char.role : ""}`;
                    charCard.addEventListener("click", () => openCharacterEditor(char.id, player.id));
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