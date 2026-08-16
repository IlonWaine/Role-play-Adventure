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

    loadActiveSessions();
    loadStories();

    async function loadActiveSessions() {
        const container = document.getElementById("activeSessionsList");
        const res = await fetch(`/api/dm/${dmId}/sessions`);
        if (!res.ok) return;
        const sessions = await res.json();

        if (sessions.length === 0) {
            container.innerHTML = "<p>Немає активних сесій.</p>";
            return;
        }

        container.innerHTML = "";
        sessions.forEach(s => {
            const card = document.createElement("div");
            card.className = "character-card character-card-link";
            card.innerHTML = `<strong>📖 ${s.story_title}</strong> <span class="room-code-badge">${s.room_code}</span>`;
            card.addEventListener("click", () => {
                window.location.href = `/dm_live?session_id=${s.id}`;
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