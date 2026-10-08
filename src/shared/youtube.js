const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
	"youtube.com",
	"www.youtube.com",
	"m.youtube.com",
	"music.youtube.com",
]);

// Path prefixes whose next segment is the video ID (e.g. /shorts/<id>).
const ID_PATH_PREFIXES = ["shorts", "live", "embed"];

/**
 * Extracts the YouTube video ID from a URL, or returns null if the URL
 * does not point to a single video.
 *
 * Supported: /watch?v=<id>, /shorts/<id>, /live/<id>, /embed/<id>, youtu.be/<id>
 * on youtube.com, www., m. and music. subdomains.
 *
 * @param {string | undefined} rawUrl
 * @returns {string | null}
 */
export function parseVideoId(rawUrl) {
	if (!rawUrl) return null;

	let url;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") return null;

	const [first, second] = url.pathname.split("/").filter(Boolean);
	let candidate = null;

	if (url.hostname === "youtu.be") {
		candidate = first;
	} else if (YOUTUBE_HOSTS.has(url.hostname)) {
		if (first === "watch") {
			candidate = url.searchParams.get("v");
		} else if (ID_PATH_PREFIXES.includes(first)) {
			candidate = second;
		}
	}

	return candidate && VIDEO_ID_RE.test(candidate) ? candidate : null;
}

/**
 * Strips YouTube's tab title decorations: "(3) My video - YouTube" -> "My video".
 *
 * @param {string | undefined} tabTitle
 * @returns {string}
 */
export function cleanVideoTitle(tabTitle) {
	return (tabTitle ?? "")
		.replace(/^\(\d+\)\s*/, "")
		.replace(/\s+-\s+YouTube( Music)?$/, "")
		.trim();
}
