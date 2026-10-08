import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { fixtureYoutube, installFakeBrowser } from "./helpers/fake-browser.js";

/** The runtime.onMessage listener registered by background.js. */
let onMessage;

before(async () => {
	const fake = installFakeBrowser(fixtureYoutube());
	await import("../src/background/background.js");
	[onMessage] = fake.messageListeners;
});

describe("background message router", () => {
	it("answers ping", async () => {
		assert.deepEqual(await onMessage({ type: "ping" }), { ok: true, from: "background" });
	});

	it("wraps getPlaylists results in an envelope", async () => {
		const response = await onMessage({ type: "getPlaylists", tabId: 1, videoId: "dQw4w9WgXcQ" });
		assert.equal(response.ok, true);
		assert.equal(response.playlists.length, 4);
	});

	it("wraps applyChanges results in an envelope", async () => {
		const response = await onMessage({
			type: "applyChanges",
			tabId: 1,
			videoId: "dQw4w9WgXcQ",
			add: ["WL"],
			remove: [],
		});
		assert.deepEqual(response, { ok: true, results: [{ playlistId: "WL", action: "add", ok: true }] });
	});

	it("turns errors into { ok: false, error } keeping their code", async (t) => {
		t.mock.method(console, "error", () => {});
		installFakeBrowser(async () => ({ ok: false, code: "NOT_LOGGED_IN" }));

		const response = await onMessage({ type: "getPlaylists", tabId: 1, videoId: "dQw4w9WgXcQ" });
		assert.deepEqual(response, { ok: false, error: { code: "NOT_LOGGED_IN", message: "NOT_LOGGED_IN" } });
	});

	it("ignores unknown messages", () => {
		assert.equal(onMessage({ type: "unknown" }), undefined);
		assert.equal(onMessage(undefined), undefined);
	});
});
