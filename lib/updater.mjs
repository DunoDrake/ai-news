// Runs one tool's own update command (e.g. `codex update`) after the user confirmed in the UI.
// Commands come from a fixed list in extras.mjs; nothing from the request reaches the shell or argv.
import os from "node:os";
import { spawn } from "node:child_process";
import { updateInfo, toolEnv, recheckTool, saveVersion, loadExtras, managedBy } from "./extras.mjs";

const TIMEOUT_MS = 10 * 60000;
const MAX_LINES = 400;
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;

let job = null;

export function updateStatus() {
	return job ? { tool: job.tool, name: job.name, command: job.command, state: job.state, before: job.before, after: job.after, code: job.code, error: job.error, lines: job.lines.slice(-80) } : null;
}

function push(j, chunk) {
	for (const raw of chunk.toString("utf8").replace(ANSI, "").split(/\r?\n|\r/)) {
		const line = raw.trimEnd();
		if (!line) continue;
		j.lines.push(line.slice(0, 300));
		if (j.lines.length > MAX_LINES) j.lines.shift();
	}
}

export function startUpdate({ dir, id }) {
	if (job && job.state === "running") return { ok: false, error: "Đang có một lần cập nhật khác chạy." };
	const info = updateInfo(id);
	if (!info) return { ok: false, error: "Công cụ không hợp lệ." };
	const cur = (loadExtras(dir).versions || []).find((v) => v.id === id);
	if (!cur || !cur.outdated) return { ok: false, error: info.name + " không có bản mới để cập nhật." };
	const mgr = managedBy(id);
	if (mgr) return { ok: false, error: info.name + " do " + mgr + " quản lý nên lệnh " + info.bin + " update không chạy được. Hãy cập nhật từ " + mgr + "." };

	const j = { tool: id, name: info.name, command: info.bin + " " + info.args.join(" "), state: "running", before: cur.installed, after: null, code: null, error: null, lines: [] };
	job = j;
	let timedOut = false;
	let child;
	try {
		child = spawn(info.bin, info.args, { env: toolEnv(), cwd: os.homedir(), stdio: ["ignore", "pipe", "pipe"] });
	} catch (e) {
		j.state = "failed";
		j.error = "Không chạy được lệnh: " + e.message;
		return { ok: true };
	}
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill("SIGTERM");
	}, TIMEOUT_MS);
	child.stdout.on("data", (c) => push(j, c));
	child.stderr.on("data", (c) => push(j, c));
	child.on("error", (e) => {
		clearTimeout(timer);
		j.state = "failed";
		j.error = e.code === "ENOENT" ? "Không tìm thấy lệnh " + info.bin + " trên máy." : "Không chạy được lệnh: " + e.message;
	});
	child.on("close", async (code) => {
		clearTimeout(timer);
		if (j.state === "failed") return;
		j.code = code;
		try {
			const fresh = await recheckTool(id);
			if (fresh) {
				j.after = fresh.installed;
				saveVersion(dir, fresh);
			}
		} catch {
			/* keep the exit status below */
		}
		if (timedOut) {
			j.state = "failed";
			j.error = "Quá 10 phút nên đã dừng lệnh.";
		} else if (code !== 0) {
			j.state = "failed";
			j.error = "Lệnh kết thúc với mã lỗi " + code + ".";
		} else if (j.after && j.after === j.before) {
			j.state = "failed";
			j.error = "Lệnh chạy xong nhưng phiên bản vẫn là " + j.before + ".";
		} else {
			j.state = "done";
		}
	});
	return { ok: true };
}
