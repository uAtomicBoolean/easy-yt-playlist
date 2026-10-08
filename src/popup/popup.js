import { cleanVideoTitle, parseVideoId } from "../shared/youtube.js";

const videoTitleEl = document.getElementById("video-title");
const searchEl = document.getElementById("search");
const listEl = document.getElementById("playlists");
const messageEl = document.getElementById("message");
const footerEl = document.getElementById("footer");
const doneEl = document.getElementById("done");
const playlistTemplate = document.getElementById("playlist-template");

const ERROR_MESSAGES = {
	NOT_LOGGED_IN: "Sign in to YouTube to see your playlists.",
};

const VISIBILITIES = {
	public: {
		label: "Public",
		icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm7.9 9h-3.9a15.6 15.6 0 0 0-1.4-6.3A8 8 0 0 1 19.9 11ZM12 4.1c.9 1.2 1.9 3.6 2 6.9h-4c.1-3.3 1.1-5.7 2-6.9ZM9.4 4.7A15.6 15.6 0 0 0 8 11H4.1a8 8 0 0 1 5.3-6.3ZM4.1 13H8a15.6 15.6 0 0 0 1.4 6.3A8 8 0 0 1 4.1 13Zm7.9 6.9c-.9-1.2-1.9-3.6-2-6.9h4c-.1 3.3-1.1 5.7-2 6.9Zm2.6-.6a15.6 15.6 0 0 0 1.4-6.3h3.9a8 8 0 0 1-5.3 6.3Z",
	},
	unlisted: {
		label: "Unlisted",
		icon: "M17 7h-4v2h4a3 3 0 0 1 0 6h-4v2h4a5 5 0 0 0 0-10Zm-6 8H7a3 3 0 0 1 0-6h4V7H7a5 5 0 0 0 0 10h4v-2Zm-3-4h8v2H8v-2Z",
	},
	private: {
		label: "Private",
		icon: "M17 8V7A5 5 0 0 0 7 7v1H5v14h14V8h-2ZM9 7a3 3 0 0 1 6 0v1H9V7Zm8 13H7V10h10v10Zm-5-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
	},
};

/** @type {{ tabId: number | null, videoId: string | null, initial: Map<string, boolean>, rows: Array<{ el: HTMLElement, searchText: string }> }} */
const state = {
	tabId: null,
	videoId: null,
	// Playlist ID -> whether it contained the video when the popup opened.
	initial: new Map(),
	rows: [],
};

async function getActiveTab() {
	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
	return tab;
}

/** Sends a message to the background and unwraps its { ok, error } envelope. */
async function callBackground(type, payload) {
	const response = await browser.runtime.sendMessage({ type, ...payload });
	if (!response?.ok) {
		const error = new Error(response?.error?.message ?? "Unexpected background response");
		error.code = response?.error?.code;
		throw error;
	}
	return response;
}

/** Lowercase, accent-insensitive form used for searching. */
function normalize(text) {
	return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function showMessage(text) {
	messageEl.textContent = text;
	messageEl.hidden = !text;
}

function renderPlaylist(playlist) {
	const row = playlistTemplate.content.firstElementChild.cloneNode(true);
	const checkbox = row.querySelector("input");
	checkbox.value = playlist.id;
	checkbox.checked = playlist.containsVideo;

	const img = row.querySelector("img");
	if (playlist.thumbnail) {
		img.src = playlist.thumbnail;
	} else {
		img.remove();
	}

	row.querySelector(".title").textContent = playlist.title;
	row.querySelector(".title").title = playlist.title;

	const visibility = VISIBILITIES[playlist.visibility];
	const visibilityEl = row.querySelector(".visibility");
	if (visibility) {
		visibilityEl.querySelector("path").setAttribute("d", visibility.icon);
		visibilityEl.querySelector(".visibility-label").textContent = visibility.label;
	} else {
		visibilityEl.remove();
	}

	return row;
}

function renderPlaylists(playlists) {
	state.initial = new Map(playlists.map((p) => [p.id, p.containsVideo]));
	state.rows = playlists.map((playlist) => ({
		el: renderPlaylist(playlist),
		searchText: normalize(playlist.title),
	}));
	listEl.replaceChildren(...state.rows.map((row) => row.el));
}

/** @returns {{ add: string[], remove: string[] }} the playlists whose checkbox differs from the initial state */
function getChanges() {
	const add = [];
	const remove = [];
	for (const checkbox of listEl.querySelectorAll("input[type=checkbox]")) {
		const wasChecked = state.initial.get(checkbox.value);
		if (checkbox.checked && !wasChecked) add.push(checkbox.value);
		if (!checkbox.checked && wasChecked) remove.push(checkbox.value);
	}
	return { add, remove };
}

function updateDoneButton() {
	const { add, remove } = getChanges();
	const count = add.length + remove.length;
	doneEl.disabled = count === 0;
	doneEl.textContent = count ? `Done (${count})` : "Done";
}

function applySearch() {
	const query = normalize(searchEl.value.trim());
	let visible = 0;
	for (const row of state.rows) {
		const match = row.searchText.includes(query);
		row.el.hidden = !match;
		if (match) visible++;
	}
	listEl.hidden = visible === 0;
	showMessage(visible === 0 ? "No playlist matches your search." : "");
}

async function init() {
	const tab = await getActiveTab();
	const videoId = parseVideoId(tab?.url);

	if (!videoId) {
		showMessage("Open a YouTube video to add it to your playlists.");
		return;
	}

	state.tabId = tab.id;
	state.videoId = videoId;
	videoTitleEl.textContent = cleanVideoTitle(tab.title) || videoId;
	videoTitleEl.title = videoId;
	videoTitleEl.hidden = false;

	let playlists;
	try {
		({ playlists } = await callBackground("getPlaylists", { tabId: tab.id, videoId }));
	} catch (error) {
		showMessage(ERROR_MESSAGES[error.code] ?? `Could not load playlists: ${error.message}`);
		return;
	}

	if (!playlists.length) {
		showMessage("You don't have any playlists yet.");
		return;
	}

	renderPlaylists(playlists);
	listEl.hidden = false;
	searchEl.hidden = false;
	footerEl.hidden = false;
	showMessage("");
	searchEl.focus();
}

listEl.addEventListener("change", updateDoneButton);
searchEl.addEventListener("input", applySearch);

doneEl.addEventListener("click", () => {
	// Step 6: send getChanges() to the background ("applyChanges") and report the results.
	console.log("Changes to apply", getChanges());
});

init().catch((error) => showMessage(`Error: ${error.message}`));
