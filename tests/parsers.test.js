import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parsePlaylistOptions, parseThumbnailPage } from "../src/background/playlists.js";
import { loadFixture } from "./helpers/fake-browser.js";

describe("parsePlaylistOptions", () => {
	it("parses a get_add_to_playlist response", () => {
		assert.deepEqual(parsePlaylistOptions(loadFixture("get-add-to-playlist.json")), [
			{ id: "WL", title: "Watch later", visibility: "private", containsVideo: false, thumbnail: null },
			{
				id: "PLfixture1xxxxxxxxxxxxxxxxxxxxxx",
				title: "Playlist 1",
				visibility: "public",
				containsVideo: false,
				thumbnail: null,
			},
			{
				id: "PLfixture2xxxxxxxxxxxxxxxxxxxxxx",
				title: "Playlist 2",
				visibility: "private",
				containsVideo: true,
				thumbnail: null,
			},
			{
				id: "PLfixture3xxxxxxxxxxxxxxxxxxxxxx",
				title: "Playlist 3",
				visibility: "unlisted",
				containsVideo: false,
				thumbnail: null,
			},
		]);
	});

	it("maps the public visibility and titles given as runs", () => {
		const json = {
			contents: [
				{
					addToPlaylistRenderer: {
						playlists: [
							{
								playlistAddToOptionRenderer: {
									playlistId: "PLpublic",
									title: { runs: [{ text: "Part 1" }, { text: " & 2" }] },
									privacy: "PUBLIC",
									containsSelectedVideos: "NONE",
								},
							},
						],
					},
				},
			],
		};
		const [playlist] = parsePlaylistOptions(json);
		assert.equal(playlist.title, "Part 1 & 2");
		assert.equal(playlist.visibility, "public");
	});

	it("skips unknown items and returns [] for an unexpected shape", () => {
		const json = { contents: [{ addToPlaylistRenderer: { playlists: [{ somethingElse: {} }] } }] };
		assert.deepEqual(parsePlaylistOptions(json), []);
		assert.deepEqual(parsePlaylistOptions({}), []);
		assert.deepEqual(parsePlaylistOptions(null), []);
	});
});

describe("parseThumbnailPage", () => {
	it("parses a library page, including other channels' playlists", () => {
		const { thumbnails, continuation } = parseThumbnailPage(loadFixture("playlist-aggregation.json"));
		assert.equal(continuation, null);
		assert.deepEqual(Object.fromEntries(thumbnails), {
			WL: "https://i.ytimg.com/vi/fixture0/hqdefault.jpg",
			PLfixture1xxxxxxxxxxxxxxxxxxxxxx: "https://i.ytimg.com/vi/fixture1/hqdefault.jpg",
			PLfixture2xxxxxxxxxxxxxxxxxxxxxx: "https://i.ytimg.com/vi/fixture2/hqdefault.jpg",
			PLfixture3xxxxxxxxxxxxxxxxxxxxxx: "https://i.ytimg.com/vi/fixture3/hqdefault.jpg",
			PLforeignxxxxxxxxxxxxxxxxxxxxxxxxx: "https://i.ytimg.com/vi/fixture4/hqdefault.jpg",
		});
	});

	// Synthetic: pagination was never observed on this page (see docs/innertube.md).
	it("reads the next page token from a continuationItemRenderer", () => {
		const json = {
			contents: [
				{ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "PAGE2" } } } },
			],
		};
		assert.equal(parseThumbnailPage(json).continuation, "PAGE2");
	});

	it("ignores continuation commands nested in a playlist's tap action", () => {
		const json = {
			items: [
				{
					lockupViewModel: {
						contentId: "PL1",
						rendererContext: {
							commandContext: {
								onTap: { innertubeCommand: { continuationCommand: { token: "NOT_A_PAGE_TOKEN" } } },
							},
						},
					},
				},
			],
		};
		assert.equal(parseThumbnailPage(json).continuation, null);
	});

	it("skips playlists without a thumbnail", () => {
		const json = { items: [{ lockupViewModel: { contentId: "PL1", contentImage: {} } }] };
		assert.equal(parseThumbnailPage(json).thumbnails.size, 0);
	});
});
