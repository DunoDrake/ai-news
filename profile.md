# Workflow profile (sửa file này để đề xuất sát hơn)

Người dùng: frontend dev làm game slot bằng Cocos Creator (TypeScript, ES5-safe), repo `tektale`.

Công cụ AI đang dùng:
- OMP (agent CLI chính), Claude Code, Codex, Cursor; model gọi qua router cục bộ `cc-router` (Claude Opus/Sonnet/Haiku).
- Skills trong `.claude/skills/`, subagent (scout, dev, reviewer, planner...), MCP server tự dựng cho Cocos Editor.
- AI Hub (quản lý task bằng Backlog.md, phân model theo nhãn dev-high/medium/low), AI Live (theo dõi session và quota).
- Báo cáo ngày và worklog Jira được sinh bằng script + skill `daily-report`.

Điểm đau đã biết:
- Phiên dài tốn phần lớn thời gian chờ model, ít thời gian tool; cần chia việc song song và verify sớm.
- Quota token nhiều nhà cung cấp, cần biết lúc nào dùng model nào cho rẻ.
- Ràng buộc ES5 và ba phiên bản engine (v213/v373/v385) khiến agent hay viết sai cú pháp.
- Nhiều việc lặp lại: report, worklog, port scene, đồng bộ asset.

Quan tâm: cách làm việc với agent hiệu quả hơn (prompt/skill/subagent/MCP/hook), tính năng mới của Claude Code/Codex/OMP,
giảm chi phí token, tự động hóa việc lặp, an toàn khi cho agent chạy lệnh.
Không quan tâm: tin tài chính/đầu tư, tuyển dụng, drama công ty, nghiên cứu thuần lý thuyết không áp dụng được.
