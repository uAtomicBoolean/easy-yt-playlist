# easy-yt-playlist
A small firefox extension to easily add a video to multiple youtube playlists. 

## Development

Requires Node.js and Firefox 142+.

```bash
npm install
npm start      # launches Firefox with the extension loaded (auto-reload)
npm test       # runs the unit tests
npm run lint   # validates the extension
npm run build  # packages the extension into dist/
```

The popup and the code injected into YouTube are not covered by `npm test`:
see [docs/manual-testing.md](docs/manual-testing.md).
