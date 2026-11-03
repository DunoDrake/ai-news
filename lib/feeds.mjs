// Dependency-free RSS/Atom parsing, HTML → text, and main-content extraction.
const UA = "ai-news/0.1 (personal local reader)";
const MAX_BYTES = 4_000_000;

export async function fetchText(url, timeout = 20000) {
	const res = await fetch(url, {
		headers: {
			"user-agent": UA,
			accept: "application/atom+xml,application/rss+xml,application/xml,text/xml,text/html;q=0.8,*/*;q=0.5",
		},
		redirect: "follow",
		signal: AbortSignal.timeout(timeout),
	});
	if (!res.ok) throw new Error("HTTP " + res.status);
	const buf = await res.arrayBuffer();
	if (buf.byteLength > MAX_BYTES) throw new Error("response too large");
	return new TextDecoder("utf-8").decode(buf);
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(s) {
	return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
		if (e[0] === "#") {
			const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
		}
		const v = ENTITIES[e.toLowerCase()];
		return v === undefined ? m : v;
	});
}

export function stripHtml(html) {
	return decodeEntities(
		html
			.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
			.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
			.replace(/<\/(p|div|li|h[1-6]|pre|blockquote|tr)>|<br\s*\/?>/gi, "\n")
			.replace(/<[^>]+>/g, " "),
	)
		.replace(/[ \t\u00a0]+/g, " ")
		.replace(/ *\n */g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function tagText(block, names) {
	for (const name of names) {
		const n = name.replace(":", "\\:");
		const m = block.match(new RegExp("<" + n + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + n + ">", "i"));
		if (m) {
			const raw = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
			if (raw) return raw;
		}
	}
	return "";
}

function atomLink(block) {
	const links = [...block.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
	const alt = links.find((l) => /rel=["']alternate["']/i.test(l)) || links.find((l) => !/rel=/i.test(l)) || links[0];
	const href = alt && alt.match(/href=["']([^"']+)["']/i);
	return href ? decodeEntities(href[1]) : "";
}

function validImage(u, base) {
	if (!u) return "";
	try {
		const x = new URL(decodeEntities(u.trim()), base);
		if (x.protocol !== "https:" && x.protocol !== "http:") return "";
		if (/(^|\.)avatars\.githubusercontent\.com$|gravatar\.com$|(^|\.)opengraph\.githubassets\.com$|(^|\.)repository-images\.githubusercontent\.com$/i.test(x.hostname)) return "";
		return x.toString();
	} catch {
		return "";
	}
}

function imageFromBlock(block, body, base) {
	const tags = [...block.matchAll(/<(media:thumbnail|media:content|enclosure)\b[^>]*>/gi)].map((m) => m[0]);
	for (const t of tags) {
		if (/type=["']video|medium=["']video/i.test(t)) continue;
		if (/^<enclosure/i.test(t) && !/type=["']image/i.test(t)) continue;
		const m = t.match(/\burl=["']([^"']+)["']/i);
		const u = m && validImage(m[1], base);
		if (u) return u;
	}
	const img = decodeEntities(body).match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
	return img ? validImage(img[1], base) : "";
}

// og:image / twitter:image from a full HTML page.
export function ogImage(html, base) {
	for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
		const tag = m[0];
		if (!/(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["']/i.test(tag)) continue;
		const c = tag.match(/\bcontent=["']([^"']+)["']/i);
		const u = c && validImage(c[1], base);
		if (u) return u;
	}
	return "";
}

export function parseFeed(xml) {
	const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
	const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
	const items = [];
	for (const b of blocks) {
		const title = stripHtml(tagText(b, ["title"]));
		const link = isAtom ? atomLink(b) : stripHtml(tagText(b, ["link"])) || atomLink(b);
		const dateRaw = tagText(b, ["pubDate", "published", "updated", "dc:date"]);
		const t = Date.parse(dateRaw);
		const body = tagText(b, ["content:encoded", "content", "description", "summary"]);
		if (!title || !/^https?:\/\//i.test(link)) continue;
		items.push({
			title,
			url: link,
			publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : null,
			image: imageFromBlock(b, body, link),
			text: stripHtml(decodeEntities(body).includes("<") ? decodeEntities(body) : body),
		});
	}
	return items;
}

export function canonicalUrl(u) {
	try {
		const x = new URL(u);
		x.hash = "";
		for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(k)) x.searchParams.delete(k);
		let s = x.toString();
		if (s.endsWith("/") && x.pathname !== "/") s = s.slice(0, -1);
		return s;
	} catch {
		return u;
	}
}

// Heuristic main-content extraction for pages whose feed only carries a teaser.
export function extractArticle(html) {
	let h = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)[\s\S]*?<\/\1>/gi, " ");
	const art = h.match(/<article[\s\S]*?<\/article>/i) || h.match(/<main[\s\S]*?<\/main>/i);
	if (art) h = art[0];
	const parts = [];
	for (const m of h.matchAll(/<(p|li|h[1-4]|pre|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
		const t = stripHtml(m[2]);
		if (t.length > 40 || /^h/i.test(m[1])) parts.push(t);
	}
	return parts.join("\n");
}

export function normalizeForMatch(s) {
	return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
}
