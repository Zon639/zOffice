# Hướng Dẫn Thiết Lập Google Sheet Tổng Hợp & Dashboard Apps Script

Hệ thống hỗ trợ nhiều chuyên viên ở các máy khác nhau cùng giao việc và tự động đồng bộ về một **Google Sheet trung tâm**, kèm theo **Web Dashboard** theo dõi tiến độ toàn cơ quan hoặc lọc riêng theo từng phòng ban:
- Phòng Kinh tế
- Phòng Văn Hóa
- Công an
- Quân sự
- Trung tâm dịch vụ tổng hợp
- Trung tâm Phục vụ Hành chính công

## Bước 1: Tạo Google Sheet tổng hợp
1. Truy cập [Google Sheets](https://sheets.google.com) và tạo một bảng tính mới (ví dụ: `TongHop_CongViec_PhongBan`).
2. Trên thanh menu của Google Sheet, chọn **Tiện ích mở rộng (Extensions)** → **Apps Script**.

## Bước 2: Dán mã Apps Script
1. Trong trình soạn thảo Apps Script, mở tệp mặc định `Code.gs`, xóa hết nội dung cũ và dán toàn bộ nội dung từ tệp `apps-script/Code.gs`.
2. Bấm dấu **＋** bên cạnh mục **Tệp (Files)** → chọn **HTML** → đặt tên chính xác là `Dashboard` (Apps Script tự thêm `.html` thành `Dashboard.html`).
3. Dán toàn bộ nội dung từ tệp `apps-script/Dashboard.html` vào tệp `Dashboard.html` vừa tạo.
4. Bấm **Lưu (Ctrl + S)**.
5. Chạy thử hàm `setupDatabase` lần đầu (chọn `setupDatabase` trên thanh công cụ → bấm **Chạy (Run)** → cấp quyền truy cập Google Sheet) để tự động tạo 2 sheet `CongViec_TongHop` và `NhatKy_DongBo`.

## Bước 3: Triển khai (Deploy) thành Web App
1. Bấm nút **Triển khai (Deploy)** ở góc trên bên phải → **Triển khai mới (New deployment)**.
2. Ở mục **Chọn loại (Select type)**, bấm biểu tượng bánh răng và chọn **Ứng dụng web (Web app)**.
3. Cấu hình quyền truy cập:
   - **Thực thi dưới danh nghĩa (Execute as):** `Tôi (Me)` (tài khoản tạo Google Sheet).
   - **Ai có quyền truy cập (Who has access):** `Bất kỳ ai (Anyone)` *(để phần mềm trên máy các chuyên viên gửi dữ liệu vào được và cán bộ xem Dashboard không lỗi quyền)* — hoặc `Bất kỳ ai trong tổ chức` nếu dùng Google Workspace nội bộ.
4. Bấm **Triển khai (Deploy)** và sao chép **URL ứng dụng web (`https://script.google.com/macros/s/.../exec`)**.

## Bước 4: Cấu hình trên phần mềm của từng chuyên viên
1. Mở ứng dụng **zOffice** → vào biểu tượng **⚙️ Cài đặt**.
2. Kéo xuống mục **4. Chuyên viên & Đồng bộ Google Sheet Tổng Hợp**:
   - Nhập **Tên chuyên viên** và chọn **Phòng ban mặc định** (nếu có).
   - Dán **URL Web App Apps Script** ở Bước 3 vào ô **URL Đồng bộ & Dashboard**.
   - Bấm **🧪 Kiểm tra kết nối** và **💾 Lưu Tất Cả Cấu Hình**.
3. Từ giờ trở đi, mỗi khi chuyên viên giao việc mới, chỉnh sửa, gửi Zalo hoặc đánh dấu hoàn thành, dữ liệu sẽ tự động gửi lên Google Sheet trung tâm.
4. Bấm **📊 Dashboard Tổng hợp** ngay trên phần mềm (hoặc mở trực tiếp link Web App trên trình duyệt) để theo dõi tình hình thực hiện công việc của tất cả các phòng ban hoặc lọc từng phòng riêng biệt.

## (Tùy chọn) Bảo mật bằng Secret Token
Nếu muốn chỉ phần mềm có mã bí mật mới được ghi dữ liệu vào Google Sheet:
1. Trong Apps Script, vào **Cài đặt dự án (Project Settings)** → **Thuộc tính tập lệnh (Script Properties)** → thêm thuộc tính `SYNC_SECRET` với chuỗi mật khẩu bất kỳ.
2. Nhập đúng chuỗi đó vào ô **Mã bảo mật đồng bộ** trong cài đặt của ứng dụng.
