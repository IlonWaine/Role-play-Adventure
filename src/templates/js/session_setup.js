document.addEventListener("DOMContentLoaded", () => {
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

    loadSessions();
    loadStories();

    async function loadSessions() {
        const container = document.getElementById("activeSessionsList");
        const res = await fetch(`/api/dm/${dmId}/sessions?include_ended=true`);
        if (!res.ok) return;
        const sessions = await res.json();

        if (sessions.length === 0) {
            container.innerHTML = '<p class="empty-state">Немає жодної сесії. Оберіть історію нижче, щоб почати нову.</p>';
            return;
        }

        container.innerHTML = "";
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

            container.appendChild(card);
        });
    }

    async function loadStories() {
        const container = document.getElementById("storiesList");
        const res = await fetch(`/api/dm/${dmId}/stories`);
        if (!res.ok) return;
        const stories = await res.json();

        if (stories.length === 0) {
            container.innerHTML = '<p class="empty-state">У вас ще немає створених історій. Спочатку створіть історію на вкладці "Історії".</p>';
            return;
        }

        container.innerHTML = "";
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
            container.appendChild(card);
        });
    }
});