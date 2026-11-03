#!/usr/bin/env node
// AI News: local newspaper UI + scheduler. Binds to 127.0.0.1 only.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/llm.mjs";
import { runPipeline, loadStore, localDate } from "./lib/pipeline.mjs";
import { runExtras, loadExtras } from "./lib/extras.mjs";
import { startUpdate, updateStatus } from "./lib/updater.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
loadEnv(HERE);
const PORT = Number(process.env.PORT || 4890);
const STALE_MS = Number(process.env.AI_NEWS_STALE_HOURS || 6) * 3600000;
const CHECK_MS = 30 * 60000;
const OPEN_STALE_MS = Number(process.env.AI_NEWS_OPEN_STALE_MINUTES || 30) * 60000;
const LIBRARY_DAYS = 7;

let running = false;
let progress = [];

async function refresh() {
	if (running) return false;
	running = true;
	progress = [];
	try {
		await runPipeline({ dir: HERE, log: (m) => progress.push(m) });
		const extraErrors = await runExtras({ dir: HERE, log: (m) => progress.push(m) });
		for (const e of extraErrors) progress.push("LỖI: " + e);
	} catch (e) {
		progress.push("LỖI: " + e.message);
	} finally {
		running = false;
	}
	return true;
}

function isStale() {
	const at = loadStore(HERE).lastRun?.at;
	return !at || Date.now() - Date.parse(at) > STALE_MS;
}

function ageMs() {
	const at = loadStore(HERE).lastRun?.at;
	return at ? Date.now() - Date.parse(at) : Infinity;
}

function editions(store) {
	const by = {};
	for (const a of Object.values(store.articles)) (by[a.date] ||= []).push(a);
	return by;
}

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: http: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const json = (status, body) => ({ status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: JSON.stringify(body) });

function route(req) {
	const url = new URL(req.url, "http://x");
	const host = req.headers.host || "";
	if (host !== "127.0.0.1:" + PORT && host !== "localhost:" + PORT) return json(403, { error: "bad host" });
	if (req.method === "GET" && url.pathname === "/") {
		if (!running && ageMs() > OPEN_STALE_MS) refresh();
		return { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": CSP, "x-content-type-options": "nosniff" }, body: fs.readFileSync(path.join(HERE, "index.html")) };
	}
	if (req.method === "GET" && url.pathname === "/api/editions") {
		const by = editions(loadStore(HERE));
		return json(200, Object.keys(by).sort().reverse().map((d) => ({ date: d, count: by[d].length })));
	}
	if (req.method === "GET" && url.pathname === "/api/edition") {
		const store = loadStore(HERE);
		const date = url.searchParams.get("date") || localDate();
		const articles = (editions(store)[date] || []).sort((a, b) => b.relevance - a.relevance || Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
		return json(200, { date, articles });
	}
	if (req.method === "GET" && url.pathname === "/api/library") {
		const store = loadStore(HERE);
		const extras = loadExtras(HERE);
		const cutoff = Date.now() - LIBRARY_DAYS * 86400000;
		const articles = Object.values(store.articles)
			.filter((a) => Date.parse(a.publishedAt || a.fetchedAt) >= cutoff)
			.sort((a, b) => b.relevance - a.relevance || Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
		return json(200, { articles, versions: extras.versions || [], trending: extras.trending || [], extrasAt: extras.fetchedAt || null, lastRun: store.lastRun || null, running });
	}
	if (req.method === "GET" && url.pathname === "/api/status") {
		const lastRun = loadStore(HERE).lastRun || null;
		return json(200, { running, progress: progress.slice(-8), lastRun });
	}
	if (req.method === "POST" && url.pathname === "/api/refresh") {
		const origin = req.headers.origin;
		if (origin && origin !== "http://" + host) return json(403, { error: "bad origin" });
		const started = !running;
		refresh();
		return json(202, { started });
	}
	if (req.method === "GET" && url.pathname === "/api/update/status") {
		return json(200, { job: updateStatus() });
	}
	if (req.method === "POST" && url.pathname === "/api/update") {
		// Runs a command on this machine: require a same-origin browser request, never a bare curl or another site.
		if (req.headers.origin !== "http://" + host || req.headers["x-ai-news"] !== "update") return json(403, { error: "bad origin" });
		const r = startUpdate({ dir: HERE, id: url.searchParams.get("tool") || "" });
		return json(r.ok ? 202 : 409, r);
	}
	return json(404, { error: "not found" });
}

http.createServer((req, res) => {
	const out = route(req);
	res.writeHead(out.status, out.headers);
	res.end(out.body);
}).listen(PORT, "127.0.0.1", () => {
	console.log("AI News: http://127.0.0.1:" + PORT);
	const tick = () => {
		if (!running && isStale()) refresh();
	};
	tick();
	setInterval(tick, CHECK_MS);
});
