// Minimal Anthropic-messages client against the local cc-router (same endpoint OMP uses).
import fs from "node:fs";
import path from "node:path";

export function loadEnv(dir) {
	const file = path.join(dir, ".env");
	if (!fs.existsSync(file)) return;
	for (const line of fs.readFileSync(file, "utf8").split("\n")) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
		if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
	}
}

export async function complete({ model, system, user, maxTokens = 800 }) {
	const base = process.env.AI_NEWS_BASE_URL || "http://127.0.0.1:20128";
	const key = process.env.AI_NEWS_API_KEY || process.env.CC_ROUTER_API_KEY;
	if (!key) throw new Error("Thiếu API key: đặt CC_ROUTER_API_KEY trong ai-news/.env");
	const res = await fetch(base + "/v1/messages", {
		method: "POST",
		headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
		body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
		signal: AbortSignal.timeout(120000),
	});
	const raw = await res.text();
	let data = null;
	try {
		data = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
	} catch {
		/* handled below */
	}
	if (!res.ok || !data) throw new Error("LLM HTTP " + res.status + (data && data.error ? ": " + data.error.message : ": phản hồi không đọc được"));
	return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}

export function parseJson(text) {
	const a = text.indexOf("{");
	const b = text.lastIndexOf("}");
	if (a < 0 || b <= a) throw new Error("LLM did not return JSON");
	return JSON.parse(text.slice(a, b + 1));
}
