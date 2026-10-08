import { readFileSync } from "node:fs";

/** Loads a JSON fixture from tests/fixtures (a fresh copy on every call). */
export function loadFixture(name) {
	return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

/**
 * Installs a fake `globalThis.browser` covering the APIs the background uses.
 *
 * `youtube(endpoint, body)` stands in for the page-injected `innertubeFetch`: it returns
 * `{ ok: true, json }` / `{ ok: false, code, message }`, or throws to simulate an injection failure.
 * Every InnerTube call is recorded in `calls`.
 */
export function installFakeBrowser(youtube) {
	const calls = [];
	const session = {};
	const messageListeners = [];

	globalThis.browser = {
		scripting: {
			async executeScript({ target, world, func, args }) {
				const [endpoint, body] = args;
				calls.push({ tabId: target.tabId, world, func: func.name, endpoint, body });
				return [{ result: await youtube(endpoint, body) }];
			},
		},
		storage: {
			session: {
				async get(key) {
					return key in session ? { [key]: structuredClone(session[key]) } : {};
				},
				async set(items) {
					Object.assign(session, structuredClone(items));
				},
			},
		},
		runtime: {
			onMessage: {
				addListener: (listener) => messageListeners.push(listener),
			},
		},
	};

	return { calls, session, messageListeners };
}

/** A fake YouTube backed by the fixtures; `overrides[endpoint]` replaces a route. */
export function fixtureYoutube(overrides = {}) {
	return async (endpoint, body) => {
		if (overrides[endpoint]) return overrides[endpoint](body);
		switch (endpoint) {
			case "playlist/get_add_to_playlist":
				return { ok: true, json: loadFixture("get-add-to-playlist.json") };
			case "browse":
				return { ok: true, json: loadFixture("playlist-aggregation.json") };
			case "browse/edit_playlist":
				return { ok: true, json: { status: "STATUS_SUCCEEDED" } };
			default:
				throw new Error(`Unexpected endpoint ${endpoint}`);
		}
	};
}
