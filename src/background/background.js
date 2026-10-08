// Background event page: the YouTube "service" layer.
// Long-running work lives here because the popup closes as soon as it loses focus.
//
// Every response is an envelope: { ok: true, ...data } or { ok: false, error: { code, message } },
// because errors thrown here lose their `code` when crossing runtime.sendMessage.

import { applyChanges, getPlaylists } from "./playlists.js";

const handlers = {
	ping: async () => ({ from: "background" }),

	getPlaylists: async ({ tabId, videoId }) => ({
		playlists: await getPlaylists(tabId, videoId),
	}),

	applyChanges: async ({ tabId, videoId, add, remove }) => ({
		results: await applyChanges(tabId, videoId, { add, remove }),
	}),
};

browser.runtime.onMessage.addListener((message) => {
	const handler = handlers[message?.type];
	if (!handler) return undefined;

	return handler(message).then(
		(data) => ({ ok: true, ...data }),
		(error) => {
			console.error(`"${message.type}" failed`, error);
			return { ok: false, error: { code: error.code ?? "UNKNOWN", message: error.message } };
		},
	);
});
