# easy-yt-playlist
A small firefox extension to easily add a video to multiple youtube playlists. 

> [!NOTE] Disclaimer
> This extension has mainly been vibecoded quickly and is made for personal use.  
> You are free to use it, but I won't add more features as I want to keep it simple.
> However, I'll try to keep it up to date with the latest youtube changes. 

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

## Installation

Download the `.xpi` file of the [latest release](https://github.com/uAtomicBoolean/easy-yt-playlist/releases/latest)
and open it with Firefox. The extension then updates itself when a new release is published.
