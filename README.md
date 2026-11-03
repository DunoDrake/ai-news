# AI News

Thư viện AI cục bộ: mở trang là tự lấy bài mới, lọc và xếp vào ba kệ cố định. Chỉ hiện tiêu đề ngắn, bấm vào mới mở chi tiết (tóm tắt, ý chính, câu trích, đề xuất, link nguồn).

| Kệ | Nội dung |
|---|---|
| Cần cập nhật | Bản phát hành của công cụ bạn dùng (Claude Code, Codex, OMP, MCP...). Phía trên có dải phiên bản: so bản đang cài trên máy với bản ổn định mới nhất trên GitHub |
| Mẹo mới | Cách dùng agent hiệu quả hơn, kỹ thuật, workflow áp dụng được ngay |
| Repo đang hot | GitHub trending hôm nay, lọc phần liên quan AI |

Phần còn lại nằm trong mục "Tin khác" (thu gọn). Mỗi kệ tối đa 5 mục.

Cùng kiểu với `ai-live` (4873) và `ai-hub` (4880): Node thuần, không dependency, bind `127.0.0.1`, autostart bằng LaunchAgent.

## Chạy

```bash
./start.sh            # http://127.0.0.1:4890/
node run.mjs          # chạy pipeline một lần, không cần server
```

Autostart: `~/Library/LaunchAgents/com.hue.ai-news.plist` (`RunAtLoad`, log `/tmp/ai-news-4890.log`).
Mở trang (`GET /`) mà dữ liệu cũ hơn `AI_NEWS_OPEN_STALE_MINUTES` (mặc định 30) thì server tự chạy lại pipeline, trang hiện khung chờ rồi tự nạp kết quả. Ngoài ra server kiểm tra mỗi 30 phút nếu dữ liệu cũ hơn `AI_NEWS_STALE_HOURS` (mặc định 6). Nút "Cập nhật" chạy tay.

```bash
launchctl bootout   "gui/$(id -u)" ~/Library/LaunchAgents/com.hue.ai-news.plist   # tắt
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.hue.ai-news.plist   # bật
```

## Cấu hình

| File | Vai trò |
|---|---|
| `sources.json` | Danh sách feed (`name`, `url`, `max` bài mới mỗi lần). Feed `releases.atom` bỏ qua bản alpha/beta/rc |
| `profile.md` | Mô tả workflow/công cụ/điểm đau của bạn. Chấm điểm và đề xuất bám vào file này |
| `.env` | `CC_ROUTER_API_KEY` (không commit). Gọi model qua router cục bộ `127.0.0.1:20128` |

Biến môi trường: `PORT`, `AI_NEWS_MODEL` (mặc định `cc/claude-haiku-4-5-20251001`), `AI_NEWS_OPEN_STALE_MINUTES`, `AI_NEWS_STALE_HOURS`, `AI_NEWS_MAX_AGE_DAYS` (mặc định 3), `AI_NEWS_BASE_URL`, `AI_NEWS_API_KEY`.

- Ảnh bìa lấy từ feed (`media:thumbnail`, `enclosure`, thẻ `<img>`), không có thì lấy `og:image` của trang bài. Ảnh avatar GitHub/Gravatar bị loại. Bài không có ảnh dùng bìa màu theo nguồn. Trình duyệt tải ảnh trực tiếp từ nguồn, không qua server.
- Trang có CSP chặt (`default-src 'none'`, chỉ cho phép script/style inline, ảnh http(s), `connect-src 'self'`).

## Luồng xử lý

RSS/Atom → bỏ bài cũ và trùng URL (canonical) → lấy toàn văn nếu feed chỉ có đoạn ngắn → LLM trả JSON (tiêu đề ngắn, câu ngắn, tóm tắt, ý chính, loại, kệ `update`/`trick`/`news`, điểm 0–10, đề xuất, câu trích) → `data/articles.json`.

Song song là `lib/extras.mjs` → `data/extras.json`:
- **Phiên bản:** chạy `claude/codex/omp --version` (danh sách cố định trong code, không đọc từ cấu hình) và so với release ổn định mới nhất từ feed GitHub.
- **Trending:** đọc `github.com/trending?since=daily` (GitHub không có API chính thức cho trang này, nên parse HTML; nếu GitHub đổi giao diện thì kệ báo lỗi và giữ dữ liệu cũ). Model chỉ gắn nhãn AI, mô tả tiếng Việt và điểm liên quan; không có model thì lọc bằng từ khóa.

- Câu trích chỉ được giữ nếu khớp nguyên văn với bài. Không khớp thì bỏ.
- Đề xuất chỉ xuất hiện khi điểm ≥ 8, tối đa 3 mỗi ngày.
- Trang chặn đọc toàn văn (ví dụ OpenAI trả 403) → hiển thị là "chỉ có mô tả ngắn", không đề xuất, điểm tối đa 5.
- Bài lỗi thử lại tối đa 3 lần rồi bỏ. Nguồn lỗi hiện ở cuối trang.
- Dữ liệu giữ 60 ngày.

## Cập nhật công cụ từ trang

Bấm công cụ đang có nền vàng trong dải phiên bản → hộp thoại hỏi xác nhận (hiện phiên bản cũ → mới và lệnh sẽ chạy) → bấm "Cập nhật" mới chạy `<tool> update` trên máy, kết quả hiện trực tiếp. Chạy xong server đọc lại phiên bản để xác nhận thật sự đã đổi; lệnh thoát 0 mà phiên bản không đổi vẫn báo lỗi.

- Danh sách lệnh cố định trong `lib/extras.mjs` (`claude update`, `codex update`, `omp update`). Không có tham số hay tên lệnh nào lấy từ request.
- `POST /api/update` chỉ nhận khi `Origin` đúng là trang này và có header `x-ai-news: update`; `curl` trơn hoặc trang web khác bị chặn 403. Chỉ chạy được khi công cụ đó đang có bản mới, mỗi lần một công cụ, tối đa 10 phút.
- Lệnh `update` do từng công cụ tự xử lý. Codex ở máy này nằm trong thư mục runtime của Orca (`~/Library/Application Support/orca/codex-runtime-home/...`), còn Claude Code cài qua npm. Nếu cách cài không cho phép tự cập nhật thì hộp thoại hiện đúng thông báo lỗi của lệnh.
- `AI_NEWS_EXTRA_PATH` chỉ dùng cho kiểm thử (đặt thư mục lệnh giả lên đầu `PATH`).

## Phát hành

Mã nguồn nằm ở repo private `DunoDrake/ai-news`. Bản phát hành đưa lên repo private riêng `DunoDrake/ai-news-releases` (chỉ chứa file zip, `SHA256SUMS` và ghi chú, không có mã nguồn).

```bash
echo 0.1.1 > VERSION && git commit -am "Bump 0.1.1"
scripts/release.sh
```

Script yêu cầu cây làm việc sạch và `VERSION` chưa có release, tạo tag `v<VERSION>`, đóng zip bằng `git archive` (chỉ file đã commit, nên không có `.env` hay `data/`), upload zip và `SHA256SUMS` rồi tải lại để kiểm tra checksum. Ghi chú lấy từ tiêu đề commit kể từ tag trước.

Cài từ bản phát hành: giải nén, tạo `.env` có `CC_ROUTER_API_KEY`, chạy `node server.mjs`.

## Bảo mật

- Nội dung bài là dữ liệu không đáng tin: bước tóm tắt không có quyền gọi tool hay ghi file, chỉ trả JSON; giao diện render bằng `textContent`.
- Server chỉ nhận `Host` là `127.0.0.1`/`localhost` đúng cổng và chặn `Origin` lạ trên `POST /api/refresh`.
- Nội dung bài gửi lên model qua router của bạn để tóm tắt. Không gửi dữ liệu repo hay transcript.
