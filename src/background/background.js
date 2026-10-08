// Background event page: will hold the YouTube "service" layer (step 4).
// Long-running work lives here because the popup closes as soon as it loses focus.

browser.runtime.onMessage.addListener((message) => {
  switch (message?.type) {
    case "ping":
      return Promise.resolve({ ok: true, from: "background" });
    default:
      return undefined;
  }
});
