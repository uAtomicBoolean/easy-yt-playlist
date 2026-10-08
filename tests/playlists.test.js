import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { applyChanges, getPlaylists } from "../src/background/playlists.js";
import { fixtureYoutube, installFakeBrowser } from "./helpers/fake-browser.js";

const TAB = 42;
const VIDEO = "dQw4w9WgXcQ";
const PL1 = "PLfixture1xxxxxxxxxxxxxxxxxxxxxx";
const PL2 = "PLfixture2xxxxxxxxxxxxxxxxxxxxxx";
const PL3 = "PLfixture3xxxxxxxxxxxxxxxxxxxxxx";

/** Playlist ID -> containsVideo */
function containsById(playlists) {
	return Object.fromEntries(playlists.map((p) => [p.id, p.containsVideo]));
}

function lockup(contentId) {
	return {
		lockupViewModel: {
			contentId,
			contentImage: {
				collectionThumbnailViewModel: {
					primaryThumbnail: { thumbnailViewModel: { image: { sources: [{ url: `https://img/${contentId}` }] } } },
				},
			},
		},
	};
}

function nextPage(token) {
	return { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } };
}

describe("getPlaylists", () => {
	let fake;
	beforeEach(() => {
		fake = installFakeBrowser(fixtureYoutube());
	});

	it("merges the playlists with their thumbnails, ignoring other channels' playlists", async () => {
		const playlists = await getPlaylists(TAB, VIDEO);

		assert.deepEqual(
			playlists.map((p) => [p.id, p.thumbnail]),
			[
				["WL", "https://i.ytimg.com/vi/fixture0/hqdefault.jpg"],
				[PL1, "https://i.ytimg.com/vi/fixture1/hqdefault.jpg"],
				[PL2, "https://i.ytimg.com/vi/fixture2/hqdefault.jpg"],
				[PL3, "https://i.ytimg.com/vi/fixture3/hqdefault.jpg"],
			],
		);
		assert.deepEqual(containsById(playlists), { WL: false, [PL1]: false, [PL2]: true, [PL3]: false });
	});

	it("runs the requests in the given tab, in the page's MAIN world", async () => {
		await getPlaylists(TAB, VIDEO);

		assert.deepEqual(
			fake.calls.map(({ tabId, world, func, endpoint }) => ({ tabId, world, func, endpoint })),
			[
				{ tabId: TAB, world: "MAIN", func: "innertubeFetch", endpoint: "playlist/get_add_to_playlist" },
				{ tabId: TAB, world: "MAIN", func: "innertubeFetch", endpoint: "browse" },
			],
		);
		assert.deepEqual(fake.calls[0].body, { videoIds: [VIDEO], excludeWatchLater: false });
		assert.deepEqual(fake.calls[1].body, { browseId: "FEplaylist_aggregation" });
	});

	it("still lists the playlists when the thumbnails cannot be fetched", async (t) => {
		t.mock.method(console, "warn", () => {});
		installFakeBrowser(fixtureYoutube({ browse: () => ({ ok: false, code: "HTTP_ERROR", message: "HTTP 500" }) }));

		const playlists = await getPlaylists(TAB, VIDEO);

		assert.equal(playlists.length, 4);
		assert.ok(playlists.every((p) => p.thumbnail === null));
	});

	it("fetches the next library page while some thumbnails are missing", async () => {
		fake = installFakeBrowser(
			fixtureYoutube({
				browse: (body) =>
					body.continuation === "PAGE2"
						? { ok: true, json: { items: [lockup(PL2), lockup(PL3)] } }
						: { ok: true, json: { items: [lockup("WL"), lockup(PL1), nextPage("PAGE2")] } },
			}),
		);

		const playlists = await getPlaylists(TAB, VIDEO);

		assert.deepEqual(
			fake.calls.filter((c) => c.endpoint === "browse").map((c) => c.body),
			[{ browseId: "FEplaylist_aggregation" }, { continuation: "PAGE2" }],
		);
		assert.ok(playlists.every((p) => p.thumbnail === `https://img/${p.id}`));
	});

	it("stops after 10 library pages", async () => {
		let page = 0;
		fake = installFakeBrowser(
			fixtureYoutube({ browse: () => ({ ok: true, json: { items: [nextPage(`PAGE${++page}`)] } }) }),
		);

		await getPlaylists(TAB, VIDEO);

		assert.equal(fake.calls.filter((c) => c.endpoint === "browse").length, 10);
	});

	it("fails with NOT_LOGGED_IN when the user is signed out", async () => {
		installFakeBrowser(async () => ({ ok: false, code: "NOT_LOGGED_IN" }));

		await assert.rejects(getPlaylists(TAB, VIDEO), { code: "NOT_LOGGED_IN" });
	});

	it("fails with INJECTION_FAILED when the script cannot run in the tab", async () => {
		installFakeBrowser(async () => {
			throw new Error("Missing host permission for the tab");
		});

		await assert.rejects(getPlaylists(TAB, VIDEO), {
			code: "INJECTION_FAILED",
			message: "Missing host permission for the tab",
		});
	});
});

describe("applyChanges", () => {
	let fake;
	beforeEach(() => {
		fake = installFakeBrowser(fixtureYoutube());
	});

	it("adds then removes the video, one playlist at a time", async () => {
		const results = await applyChanges(TAB, VIDEO, { add: [PL1, PL3], remove: [PL2] });

		assert.deepEqual(results, [
			{ playlistId: PL1, action: "add", ok: true },
			{ playlistId: PL3, action: "add", ok: true },
			{ playlistId: PL2, action: "remove", ok: true },
		]);
		assert.deepEqual(
			fake.calls.map((c) => c.body),
			[
				{ playlistId: PL1, actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: VIDEO }] },
				{ playlistId: PL3, actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: VIDEO }] },
				{ playlistId: PL2, actions: [{ action: "ACTION_REMOVE_VIDEO_BY_VIDEO_ID", removedVideoId: VIDEO }] },
			],
		);
		assert.ok(fake.calls.every((c) => c.endpoint === "browse/edit_playlist"));
	});

	it("reports each failure and keeps going", async () => {
		installFakeBrowser(
			fixtureYoutube({
				"browse/edit_playlist": (body) =>
					body.playlistId === PL1
						? { ok: false, code: "HTTP_ERROR", message: "Sorry, something went wrong." }
						: body.playlistId === PL2
							? { ok: true, json: { status: "STATUS_FAILED" } }
							: { ok: true, json: { status: "STATUS_SUCCEEDED" } },
			}),
		);

		const results = await applyChanges(TAB, VIDEO, { add: [PL1, PL2, PL3] });

		assert.deepEqual(results, [
			{
				playlistId: PL1,
				action: "add",
				ok: false,
				error: { code: "HTTP_ERROR", message: "Sorry, something went wrong." },
			},
			{ playlistId: PL2, action: "add", ok: false, error: { code: "EDIT_FAILED", message: "STATUS_FAILED" } },
			{ playlistId: PL3, action: "add", ok: true },
		]);
	});

	it("does nothing when there is no change", async () => {
		assert.deepEqual(await applyChanges(TAB, VIDEO, {}), []);
		assert.equal(fake.calls.length, 0);
	});
});

describe("recent edits override YouTube's lagging 'contains' flag", () => {
	beforeEach(() => {
		installFakeBrowser(fixtureYoutube());
	});

	it("reflects successful edits on the next listing", async () => {
		await applyChanges(TAB, VIDEO, { add: [PL1], remove: [PL2] });

		// The fixture still says PL1: NONE and PL2: ALL, as YouTube does right after an edit.
		const playlists = await getPlaylists(TAB, VIDEO);
		assert.deepEqual(containsById(playlists), { WL: false, [PL1]: true, [PL2]: false, [PL3]: false });
	});

	it("ignores failed edits", async () => {
		installFakeBrowser(
			fixtureYoutube({ "browse/edit_playlist": () => ({ ok: false, code: "HTTP_ERROR", message: "HTTP 400" }) }),
		);
		await applyChanges(TAB, VIDEO, { add: [PL1] });

		const playlists = await getPlaylists(TAB, VIDEO);
		assert.equal(containsById(playlists)[PL1], false);
	});

	it("only applies to the edited video", async () => {
		await applyChanges(TAB, VIDEO, { add: [PL1] });

		const playlists = await getPlaylists(TAB, "otherVideo1");
		assert.equal(containsById(playlists)[PL1], false);
	});

	it("expires after 10 minutes", async (t) => {
		const start = Date.now();
		const now = t.mock.method(Date, "now", () => start);
		await applyChanges(TAB, VIDEO, { add: [PL1] });

		now.mock.mockImplementation(() => start + 9 * 60 * 1000);
		assert.equal(containsById(await getPlaylists(TAB, VIDEO))[PL1], true);

		now.mock.mockImplementation(() => start + 11 * 60 * 1000);
		assert.equal(containsById(await getPlaylists(TAB, VIDEO))[PL1], false);
	});
});
