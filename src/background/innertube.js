// Calls YouTube's internal API (InnerTube) from inside a youtube.com tab.
// See docs/innertube.md for the request format.

export class InnertubeError extends Error {
	constructor(code, message) {
		super(message ?? code);
		this.code = code;
	}
}

/**
 * Runs in the YouTube page (MAIN world) to reuse its session cookies and `ytcfg`.
 * It is serialized by scripting.executeScript, so it must stay self-contained
 * and return plain data instead of throwing.
 */
async function innertubeFetch(endpoint, body) {
	const cfg = window.ytcfg;
	if (!cfg?.get) return { ok: false, code: "NO_YTCFG" };
	if (!cfg.get("LOGGED_IN")) return { ok: false, code: "NOT_LOGGED_IN" };

	const sapisid = document.cookie.match(/(?:^|; )(?:SAPISID|__Secure-3PAPISID)=([^;]+)/)?.[1];
	if (!sapisid) return { ok: false, code: "NOT_LOGGED_IN" };

	const timestamp = Math.floor(Date.now() / 1000);
	const digest = await crypto.subtle.digest(
		"SHA-1",
		new TextEncoder().encode(`${timestamp} ${sapisid} ${location.origin}`),
	);
	const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");

	try {
		const response = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false`, {
			method: "POST",
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
				Authorization: `SAPISIDHASH ${timestamp}_${hash}`,
				"X-Origin": location.origin,
				"X-Goog-AuthUser": String(cfg.get("SESSION_INDEX") ?? "0"),
				"X-Youtube-Client-Name": String(cfg.get("INNERTUBE_CONTEXT_CLIENT_NAME")),
				"X-Youtube-Client-Version": String(cfg.get("INNERTUBE_CLIENT_VERSION")),
			},
			body: JSON.stringify({ context: cfg.get("INNERTUBE_CONTEXT"), ...body }),
		});
		const json = await response.json().catch(() => null);
		if (!response.ok) {
			return { ok: false, code: "HTTP_ERROR", message: json?.error?.message ?? `HTTP ${response.status}` };
		}
		return { ok: true, json };
	} catch (error) {
		return { ok: false, code: "NETWORK_ERROR", message: error.message };
	}
}

/**
 * @param {number} tabId a youtube.com tab
 * @param {string} endpoint e.g. "browse" or "playlist/get_add_to_playlist"
 * @param {object} body request body, without `context`
 * @returns {Promise<any>} the JSON response
 * @throws {InnertubeError}
 */
export async function callInnertube(tabId, endpoint, body) {
	let injection;
	try {
		[injection] = await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			func: innertubeFetch,
			args: [endpoint, body],
		});
	} catch (error) {
		throw new InnertubeError("INJECTION_FAILED", error.message);
	}

	const result = injection?.result;
	if (!result) throw new InnertubeError("INJECTION_FAILED", injection?.error?.message);
	if (!result.ok) throw new InnertubeError(result.code, result.message);
	return result.json;
}
