import { cleanVideoTitle, parseVideoId } from "../shared/youtube.js";

const videoEl = document.getElementById("video");
const videoTitleEl = document.getElementById("video-title");
const noVideoEl = document.getElementById("no-video");

async function getActiveTab() {
	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
	return tab;
}

async function init() {
	const tab = await getActiveTab();
	const videoId = parseVideoId(tab?.url);

	if (!videoId) {
		noVideoEl.hidden = false;
		return;
	}

	videoTitleEl.textContent = cleanVideoTitle(tab.title) || videoId;
	videoTitleEl.title = videoId;
	videoEl.hidden = false;
}

init().catch((error) => {
	noVideoEl.textContent = `Error: ${error.message}`;
	noVideoEl.hidden = false;
});
