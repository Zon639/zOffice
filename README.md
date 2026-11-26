# zOffice - Quản Lý Văn Bản & Công Việc (Windows Desktop App - Tích hợp Zalo `zca-js`)

Ứng dụng Desktop trên Windows xây dựng bằng **Electron** và thư viện **[RFS-ADRENO/zca-js](https://github.com/RFS-ADRENO/zca-js)** giúp quản lý tiến độ văn bản/công việc cần xử lý và tự động hóa việc gửi thông báo, nhắc việc, đính kèm tệp văn bản qua Zalo cho người phụ trách.

## Tính năng chính

1. **3 Tab Quản lý Văn bản Trực quan**:
   - **⏳ Đang xử lý**: Hiển thị các văn bản trong hạn xử lý kèm bộ đếm thời gian còn lại (cảnh báo màu cam khi còn dưới 24 giờ).
   - **🚨 Quá hạn**: Tự động phân loại các văn bản chưa hoàn thành đã vượt quá hạn xử lý (`Deadline`), hiển thị số ngày/giờ trễ hạn và hỗ trợ nút **Gửi Zalo đôn đốc tất cả quá hạn**.
   - **✅ Đã xử lý**: Lưu trữ các văn bản đã hoàn thành kèm thời gian và kết quả xử lý.

2. **Tích hợp Danh bạ & Nhắn tin Zalo (`zca-js`)**:
   - **Đăng nhập Zalo**: Hỗ trợ **Quét mã QR trực tiếp** trên ứng dụng (`zalo.loginQR`) hoặc đăng nhập bằng **Cookie / IMEI** (`zalo.login`). Tự động lưu phiên đăng nhập tại `data/zalo-session.json`.
   - **Đồng bộ Danh bạ Zalo**: Tải toàn bộ danh sách bạn bè (`getAllFriends`) kết hợp tên gợi nhớ (`getAliasList`) và tìm kiếm người dùng qua số điện thoại (`findUser`).
   - **Chọn nhiều người phụ trách**: Cho phép gán nhiều người phụ trách cho cùng 1 văn bản và phân vai trò **Chủ trì** / **Phối hợp**.
   - **Gửi tin nhắn & Tệp đính kèm qua Zalo**:
     - Tích hợp 4 mẫu tin nhắn tự động điền thông tin văn bản (*Giao văn bản mới*, *Nhắc sắp đến hạn*, *Đôn đốc QUÁ HẠN*, *Xác nhận hoàn thành*).
     - Hỗ trợ gắn nhãn ưu tiên tin nhắn Zalo (`Urgency`: Bình thường / Quan trọng / Khẩn cấp).
     - Gửi kèm các tệp văn bản đính kèm (PDF, Word, Excel, Ảnh...) trực tiếp qua Zalo (`sendMessage` + `uploadAttachment`).
     - Tùy chọn **Tự động gửi tin nhắn Zalo ngay khi tạo mới / lưu văn bản**.

## Cách khởi chạy trên Windows

- **Cách 1 (Nhanh nhất)**: Nhấp đúp chuột vào file **`KhoiDongApp.bat`** trong thư mục dự án.
- **Cách 2 (Qua Terminal / PowerShell)**:
  ```powershell
  npm.cmd start
  ```
