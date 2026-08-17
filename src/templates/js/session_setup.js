document.addEventListener("DOMContentLoaded", () => {
    const dmId = localStorage.getItem("dm_id");
    if (!dmId) {
        alert("Будь ласка, увійдіть в акаунт!");
        window.location.href = "/";
        return;
    }

    document.getElementById("backBtn").addEventListener("click", () => {
        window.location.href = "/";
    });

    loadSessions();
    loadStories();

    async function loadSessions() {
        const container = document.getElementById("activeSessionsList");
        const res = await fetch(`/api/dm/${dmId}/sessions?include_ended=true`);
        if (!res.ok) return;
        const sessions = await res.json();

        if (sessions.length === 0) {
            container.innerHTML = "<p>Немає жодної сесії.</p>";
            return;
        }

        container.innerHTML = "";
        sessions.forEach(s => {
            const card = document.createElement("div");
            card.className = "character-card" + (s.is_active ? " character-card-link" : "");
            card.innerHTML = `
                <span>
                    <strong>📖 ${s.story_title}</strong>
                    <span class="room-code-badge">${s.room_code}</span>
                    ${!s.is_active ? '<span class="ended-badge">завершено</span>' : ''}
                </span>
                <button type="button" class="btn-delete-session" title="Видалити сесію назавжди">🗑️</button>
            `;

            if (s.is_active) {
                card.addEventListener("click", (e) => {
                    if (e.target.closest('.btn-delete-session')) return;
                    window.location.href = `/dm_live?session_id=${s.id}`;
                });
            }

            card.querySelector('.btn-delete-session').addEventListener('click', async (e) => {
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

            container.appendChild(card);
        });
    }

    async function loadStories() {
        const container = document.getElementById("storiesList");
        const res = await fetch(`/api/dm/${dmId}/stories`);
        if (!res.ok) return;
        const stories = await res.json();

        if (stories.length === 0) {
            container.innerHTML = "<p>У вас ще немає створених історій. Спочатку створіть історію.</p>";
            return;
        }

        container.innerHTML = "";
        stories.forEach(story => {
            const card = document.createElement("div");
            card.className = "character-card character-card-link";
            card.innerHTML = `<strong>▶ ${story.title}</strong>`;
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
            container.appendChild(card);
        });
    }
});