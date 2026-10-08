# YouTube InnerTube API — notes

Findings from the October 2026, web client `2.20261007.01.00`.
This API is undocumented and may change without notice.

## Calling the API

All calls are `POST https://www.youtube.com/youtubei/v1/<endpoint>?prettyPrint=false`,
made **from a youtube.com page** (`scripting.executeScript` with `world: "MAIN"`) so that:

- session cookies are sent (`credentials: "include"`);
- `window.ytcfg` is available.

Values read from `ytcfg.get(...)`:

| Key                             | Used for                                 |
| ------------------------------- | ---------------------------------------- |
| `LOGGED_IN`                     | detect a signed-out user                 |
| `INNERTUBE_CONTEXT`             | `context` field of every request body    |
| `INNERTUBE_CONTEXT_CLIENT_NAME` | `X-Youtube-Client-Name` header           |
| `INNERTUBE_CLIENT_VERSION`      | `X-Youtube-Client-Version` header        |
| `SESSION_INDEX`                 | `X-Goog-AuthUser` header (default `"0"`) |

Headers:

```
Content-Type: application/json
Authorization: SAPISIDHASH <ts>_<sha1hex("<ts> <SAPISID> https://www.youtube.com")>
X-Origin: https://www.youtube.com
X-Goog-AuthUser: <SESSION_INDEX>
X-Youtube-Client-Name: <INNERTUBE_CONTEXT_CLIENT_NAME>
X-Youtube-Client-Version: <INNERTUBE_CLIENT_VERSION>
```

`<ts>` is the Unix time in seconds. `SAPISID` is read from `document.cookie`
(fallback: `__Secure-3PAPISID`). The API key is not needed.

## List playlists — `playlist/get_add_to_playlist`

Body: `{ context, videoIds: [videoId], excludeWatchLater: false }`

Path: `contents[0].addToPlaylistRenderer.playlists[].playlistAddToOptionRenderer`

| Field                    | Value                                          |
| ------------------------ | ---------------------------------------------- |
| `playlistId`             | e.g. `WL` (Watch later), `PL…` (length varies) |
| `title.simpleText`       | title                                          |
| `privacy`                | `PUBLIC` / `UNLISTED` / `PRIVATE`              |
| `containsSelectedVideos` | `ALL` / `NONE`                                 |

- Returns every playlist the user owns (no pagination observed with 26 playlists), Watch later first.
- **No thumbnails.**
- ⚠️ `containsSelectedVideos` **lags** after an edit made through the API: it stayed `NONE`
  for 5+ seconds after a successful add. It is correct for older content.

## Thumbnails — `browse` with `browseId: "FEplaylist_aggregation"`

The library "Playlists" page. Walk the response for `lockupViewModel` objects:

- `contentId` → playlist ID
- `contentImage.collectionThumbnailViewModel.primaryThumbnail.thumbnailViewModel.image.sources[0].url` → thumbnail

Notes:

- Also contains playlists saved from other channels: join on `playlistId` and ignore the rest.
- 41 items came back in a single page, with no `continuationItemRenderer`. With more playlists,
  the next page token is expected in `continuationItemRenderer.continuationEndpoint.continuationCommand.token`
  (standard InnerTube pagination, **not verified** on this page). Other `continuationCommand`s
  exist inside `lockupViewModel.rendererContext` (tap actions): they are not pagination.
- Thumbnail hosts seen: `i.ytimg.com/vi/…`, `i.ytimg.com/pl_c/…`, `i9.ytimg.com/s_p/…`.

## Add / remove — `browse/edit_playlist`

```json
{ "context": {}, "playlistId": "<id>", "actions": [{ "action": "ACTION_ADD_VIDEO", "addedVideoId": "<videoId>" }] }
{ "context": {}, "playlistId": "<id>", "actions": [{ "action": "ACTION_REMOVE_VIDEO_BY_VIDEO_ID", "removedVideoId": "<videoId>" }] }
```

- Success: HTTP 200 and `status: "STATUS_SUCCEEDED"`. An add also returns
  `playlistEditResults[0].playlistEditVideoAddedResultData.setVideoId`.
- Unknown playlist: HTTP 400, `error.status: "INVALID_ARGUMENT"`.
- ⚠️ **Duplicates are accepted**: adding a video already in the playlist adds it a second time.
  The extension must only add to playlists where the video is not present, and remember
  its own recent adds since `containsSelectedVideos` lags.
- `ACTION_REMOVE_VIDEO_BY_VIDEO_ID` removed every occurrence of the video.
