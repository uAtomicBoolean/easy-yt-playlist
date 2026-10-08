# Manual testing checklist

`npm test` covers the parsing and the background logic against sample YouTube responses (real structure, invented values).
It cannot cover the code injected into the YouTube page nor the popup UI: run this checklist
before each release, with `npm start`, on a test playlist.

## Setup

- [ ] Signed in to YouTube in the `web-ext` Firefox profile.
- [ ] A private test playlist exists (e.g. `test-extension`).

## Listing

- [ ] On a non-video page (YouTube home, another site), the popup says to open a video.
- [ ] On a video (`/watch`), a Short (`/shorts/`) and a live (`/live/`), the popup shows the video title.
- [ ] All playlists are listed, Watch later included, with their thumbnail and visibility.
- [ ] Playlists that already contain the video are checked.
- [ ] Signed out: the popup asks to sign in.

## Search

- [ ] Typing filters the list, ignoring case and accents.
- [ ] A query matching nothing shows "No playlist matches your search."

## Saving

- [ ] Done is disabled until a checkbox changes, and shows the number of changes.
- [ ] Check the test playlist, Done: ✓ appears, "Saved." is shown, the video is in the playlist on YouTube.
- [ ] Reopen the popup right away: the test playlist is checked.
- [ ] Uncheck it, Done: ✓ appears, the video is removed on YouTube (and only once was added: no duplicate).

## If something fails

YouTube may have changed its internal API. Record a fresh response in the browser console
of a youtube.com tab, compare it with `tests/fixtures/`, and update the parsers and fixtures
(anonymize titles and playlist IDs first). See `docs/innertube.md`.
