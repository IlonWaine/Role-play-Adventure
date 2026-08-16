document.addEventListener("DOMContentLoaded", () => {
    const dmId = localStorage.getItem("dm_id");

    if (!dmId) {
        alert("Будь ласка, увійдіть в акаунт!");
        window.location.href = "/";
        return;
    }

    const storiesListEl = document.getElementById("storiesList");
    const addStoryForm = document.getElementById("addStoryForm");
    const logoutBtn = document.getElementById("logoutBtn");

    loadStories();

    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("dm_id");
        localStorage.removeItem("dnd_dm_session");
        window.location.href = "/";
    });

    // Створення нової історії -> одразу перехід у редактор
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
    }

    function renderStoriesList(stories) {
        storiesListEl.innerHTML = "";

        if (stories.length === 0) {
            storiesListEl.innerHTML = "<p>У вас поки немає створених історій.</p>";
            return;
        }

        stories.forEach(story => {
            const card = document.createElement("div");
            card.className = "character-card character-card-link";
            card.innerHTML = `<strong>📖 ${story.title}</strong>`;
            card.addEventListener("click", () => openStoryEditor(story.id));
            storiesListEl.appendChild(card);
        });
    }
});