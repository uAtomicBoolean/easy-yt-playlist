import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cleanVideoTitle, parseVideoId } from "../src/shared/youtube.js";

const ID = "dQw4w9WgXcQ";

describe("parseVideoId", () => {
	const valid = [
		`https://www.youtube.com/watch?v=${ID}`,
		`https://www.youtube.com/watch?v=${ID}&list=PLx&t=42s`,
		`https://youtube.com/watch?v=${ID}`,
		`http://www.youtube.com/watch?v=${ID}`,
		`https://m.youtube.com/watch?v=${ID}`,
		`https://music.youtube.com/watch?v=${ID}`,
		`https://www.youtube.com/shorts/${ID}`,
		`https://www.youtube.com/live/${ID}?si=abc`,
		`https://www.youtube.com/embed/${ID}`,
		`https://youtu.be/${ID}?t=3`,
	];
	for (const url of valid) {
		it(`extracts the ID from ${url}`, () => {
			assert.equal(parseVideoId(url), ID);
		});
	}

	const invalid = [
		["the home page", "https://www.youtube.com/"],
		["a playlist page", "https://www.youtube.com/playlist?list=PLx"],
		["a channel page", "https://www.youtube.com/@someone"],
		["a too short ID", "https://www.youtube.com/watch?v=short"],
		["an ID with invalid characters", "https://www.youtube.com/watch?v=dQw4w9WgXc!"],
		["another site", `https://example.com/watch?v=${ID}`],
		["a look-alike host", `https://youtube.com.example.com/watch?v=${ID}`],
		["a non-http URL", "about:blank"],
		["a malformed URL", "not a url"],
		["an empty URL", ""],
		["undefined", undefined],
	];
	for (const [label, url] of invalid) {
		it(`returns null for ${label}`, () => {
			assert.equal(parseVideoId(url), null);
		});
	}
});

describe("cleanVideoTitle", () => {
	it("removes the notification count and the YouTube suffix", () => {
		assert.equal(cleanVideoTitle("(3) My video - YouTube"), "My video");
	});

	it("removes the YouTube Music suffix", () => {
		assert.equal(cleanVideoTitle("Song - YouTube Music"), "Song");
	});

	it("keeps dashes that are part of the title", () => {
		assert.equal(cleanVideoTitle("Artist - Song - YouTube"), "Artist - Song");
	});

	it("leaves a plain title untouched", () => {
		assert.equal(cleanVideoTitle("Plain"), "Plain");
	});

	it("returns an empty string for a missing title", () => {
		assert.equal(cleanVideoTitle(undefined), "");
	});
});
