import { callInnertube, InnertubeError } from "./innertube.js";

/** Safety cap on library pages fetched to find thumbnails (40 playlists per page). */
const MAX_THUMBNAIL_PAGES = 10;

/**
 * YouTube's "contains this video" flag lags behind edits for a few minutes,
 * so our own edits override it for this long.
 */
const RECENT_EDIT_TTL_MS = 10 * 60 * 1000;

/**
 * @typedef {object} Playlist
 * @property {string} id
 * @property {string} title
 * @property {"public" | "unlisted" | "private" | null} visibility
 * @property {boolean} containsVideo
 * @property {string | null} thumbnail
 */

/** Depth-first walk; `visit` returns true to skip a node's children. */
function walk(node, visit) {
	if (!node || typeof node !== "object") return;
	if (visit(node)) return;
	for (const child of Object.values(node)) walk(child, visit);
}

/**
 * Parses a `playlist/get_add_to_playlist` response.
 * @returns {Playlist[]}
 */
export function parsePlaylistOptions(json) {
	const items = json?.contents?.[0]?.addToPlaylistRenderer?.playlists ?? [];
	return items
		.map((item) => item.playlistAddToOptionRenderer)
		.filter((option) => option?.playlistId)
		.map((option) => ({
			id: option.playlistId,
			title: option.title?.simpleText ?? option.title?.runs?.map((run) => run.text).join("") ?? "",
			visibility: option.privacy?.toLowerCase() ?? null,
			containsVideo: option.containsSelectedVideos === "ALL",
			thumbnail: null,
		}));
}

/**
 * Parses one page of the library "Playlists" page (`FEplaylist_aggregation`).
 * @returns {{ thumbnails: Map<string, string>, continuation: string | null }}
 */
export function parseThumbnailPage(json) {
	const thumbnails = new Map();
	let continuation = null;

	walk(json, (node) => {
		if (node.lockupViewModel) {
			const lockup = node.lockupViewModel;
			const url =
				lockup.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image
					?.sources?.[0]?.url;
			if (lockup.contentId && url) thumbnails.set(lockup.contentId, url);
			return true;
		}
		if (node.continuationItemRenderer) {
			continuation =
				node.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token ?? continuation;
			return true;
		}
		return false;
	});

	return { thumbnails, continuation };
}

/** @returns {Promise<Map<string, string>>} playlist ID -> thumbnail URL */
async function fetchThumbnails(tabId, playlistIds) {
	const wanted = new Set(playlistIds);
	const found = new Map();
	let body = { browseId: "FEplaylist_aggregation" };

	for (let page = 0; page < MAX_THUMBNAIL_PAGES; page++) {
		const { thumbnails, continuation } = parseThumbnailPage(await callInnertube(tabId, "browse", body));
		for (const [id, url] of thumbnails) {
			if (wanted.has(id)) found.set(id, url);
		}
		if (found.size >= wanted.size || !continuation) break;
		body = { continuation };
	}

	return found;
}

/** @returns {Promise<Record<string, Record<string, { contains: boolean, at: number }>>>} */
async function loadAllRecentEdits() {
	const { recentEdits = {} } = await browser.storage.session.get("recentEdits");
	const now = Date.now();
	const fresh = {};
	for (const [videoId, edits] of Object.entries(recentEdits)) {
		const kept = Object.entries(edits).filter(([, edit]) => now - edit.at < RECENT_EDIT_TTL_MS);
		if (kept.length) fresh[videoId] = Object.fromEntries(kept);
	}
	return fresh;
}

async function recordRecentEdits(videoId, results) {
	if (!results.length) return;
	const recentEdits = await loadAllRecentEdits();
	const edits = (recentEdits[videoId] ??= {});
	const at = Date.now();
	for (const { playlistId, action } of results) {
		edits[playlistId] = { contains: action === "add", at };
	}
	await browser.storage.session.set({ recentEdits });
}

/**
 * Lists the user's playlists, with whether each one contains `videoId`.
 * @returns {Promise<Playlist[]>}
 */
export async function getPlaylists(tabId, videoId) {
	const json = await callInnertube(tabId, "playlist/get_add_to_playlist", {
		videoIds: [videoId],
		excludeWatchLater: false,
	});
	const playlists = parsePlaylistOptions(json);

	const [thumbnails, recentEdits] = await Promise.all([
		// Thumbnails are cosmetic: a failure must not prevent listing the playlists.
		fetchThumbnails(tabId, playlists.map((p) => p.id)).catch((error) => {
			console.warn("Could not fetch playlist thumbnails", error);
			return new Map();
		}),
		loadAllRecentEdits(),
	]);
	const edits = recentEdits[videoId] ?? {};

	for (const playlist of playlists) {
		playlist.thumbnail = thumbnails.get(playlist.id) ?? null;
		if (edits[playlist.id]) playlist.containsVideo = edits[playlist.id].contains;
	}
	return playlists;
}

/**
 * Adds `videoId` to the `add` playlists and removes it from the `remove` ones.
 * Callers must only pass playlists whose state actually changes: YouTube accepts
 * duplicates, so adding to a playlist that already has the video adds it twice.
 *
 * @returns {Promise<Array<{ playlistId: string, action: "add" | "remove", ok: boolean, error?: { code: string, message: string } }>>}
 */
export async function applyChanges(tabId, videoId, { add = [], remove = [] }) {
	const operations = [
		...add.map((playlistId) => ({ playlistId, action: "add" })),
		...remove.map((playlistId) => ({ playlistId, action: "remove" })),
	];
	const results = [];

	// Sequential on purpose: avoids hammering the API with a burst of edits.
	for (const operation of operations) {
		const editAction =
			operation.action === "add"
				? { action: "ACTION_ADD_VIDEO", addedVideoId: videoId }
				: { action: "ACTION_REMOVE_VIDEO_BY_VIDEO_ID", removedVideoId: videoId };
		try {
			const json = await callInnertube(tabId, "browse/edit_playlist", {
				playlistId: operation.playlistId,
				actions: [editAction],
			});
			if (json?.status !== "STATUS_SUCCEEDED") {
				throw new InnertubeError("EDIT_FAILED", json?.status ?? "Unknown status");
			}
			results.push({ ...operation, ok: true });
		} catch (error) {
			results.push({ ...operation, ok: false, error: { code: error.code ?? "UNKNOWN", message: error.message } });
		}
	}

	await recordRecentEdits(
		videoId,
		results.filter((result) => result.ok),
	);
	return results;
}
