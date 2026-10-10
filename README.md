# Sao Y Lệnh

Tool desktop sao chép và sửa y lệnh nội trú trên OneMES 3.0: quét danh sách bệnh nhân, chọn mục xóa cho từng ngày, rồi để tool tự Sao chép, Sao y lệnh (ngày), xóa và Hoàn tất.

## Cài đặt (Windows)

1. Vào [Releases](https://github.com/RollReus6868/sao-y-lenh/releases/latest), tải `SaoYLenh-x.y.z-windows-setup.exe`.
2. Mở file. Windows có thể báo "Windows protected your PC" vì tool chưa ký số: bấm **More info → Run anyway**.
3. Khi có bản mới, tool hiện "Bản mới" ở góc trái dưới; vào **Cài đặt → Cập nhật**.

## Dùng

1. Mở mục **Trình duyệt** ở thanh bên, đăng nhập OneMES như trên Chrome. Nút **Ds Điều trị nội trú** đưa thẳng tới danh sách bệnh nhân.
2. **Quét danh sách**.
3. Bấm một bệnh nhân. Tool mở Lịch sử y lệnh và chọn y lệnh nguồn.
4. Chọn **Số ngày tạo** (1 = chỉ Sao chép; 2–4 = Sao chép + Sao y lệnh 1–3 ngày).
5. Tick ô đỏ ở mục cần xóa cho từng ngày. Bấm tên mục để chọn cả hàng; bấm tiêu đề cột để chọn nhanh hoặc áp mẫu. Vật tư y tế có ghi (Hao phí) hoặc (Bảo hiểm).
6. Muốn đổi giờ thực hiện, bác sĩ, cấp độ chăm sóc hay diễn biến của ngày nào thì bấm ngày đó ở **Sửa từng ngày**. Sửa ở một ngày thì các ngày sau cũng theo; ngày sau nào sửa riêng thì giữ phần riêng đó.
   Muốn thêm **Cồn xoa bóp** hay **Cao thông mạch** ngày nào thì tick ô xanh **+** ở hàng **Thêm thuốc**. Kho, số lượng, cách dùng đổi ở **Cài đặt → Thêm thuốc khi sao chép**.
7. **Sao chép & xóa cho N ngày** → xem lại → **Bắt đầu**.
8. Xong, tool tự kiểm tra lại và mở thẻ **Kết quả**: xem từng ngày vừa tạo. Ngày nào sai thì bấm **Sửa** rồi **Cập nhật lên OneMES**, hoặc **Xóa** (tool Thu hồi rồi Xóa trên OneMES).
9. Thẻ **Bệnh án**: lần đầu bấm **Nhập mẫu từ file HTML** và chọn trang Thông tin bệnh án đã hoàn tất (lưu bằng Ctrl+S trong Chrome). Bệnh nhân mới bắt đầu từ mẫu đó; sửa rồi **Cập nhật bệnh án lên OneMES**. Tool chỉ điền ô còn trống trên OneMES, ô đã có nội dung giữ nguyên.

Lần đầu nên bật **Từng bước** và thử với 1 bệnh nhân.

Nhật ký: `%APPDATA%\SaoYLenh\logs`.

## Cách tool làm (để kiểm tra)

- Ngày 1: bấm Sao chép → Đồng ý trên y lệnh nguồn.
- Mục bị xóa ở mọi ngày được xóa ngay trên ngày 1, trước khi Sao y lệnh, để các ngày sau cũng không có.
- Ngày 1 được Hoàn tất với Sao y lệnh (ngày) = N−1 (hình thức trong Cài đặt), OneMES tạo các ngày tiếp theo.
- Nếu ngày 1 còn mục riêng cần xóa: Thu hồi ngày 1, xóa, Hoàn tất lại.
- Mỗi ngày tiếp theo: mở, kiểm tra trạng thái Mới, xóa, Hoàn tất.
- Sửa giờ, bác sĩ, cấp độ, diễn biến: ngày 1 sửa trước khi Sao y lệnh; ngày sau chỉ Thu hồi khi khác với điều đã chọn. Điền vào ô, bấm Lưu, đọc lại, rồi Hoàn tất.
- Thêm thuốc: trên y lệnh đang Mới, bấm Kê Tây y/VTYT, chọn kho, gõ từ khóa vào ô Thuốc/VTYT và chọn đúng tên, điền số lượng và cách dùng, bấm Thêm, rồi Chấp nhận. Không bao giờ bấm X hay Bỏ qua của popup này (OneMES xóa cả đơn thuốc). Thuốc tick ở mọi ngày được thêm trên ngày 1 trước Sao y lệnh; thuốc chỉ tick vài ngày thì thêm riêng từng ngày. Ngày đã có thuốc đó thì không thêm lần nữa.
- Bệnh án: Tổng kết → Lập bìa bệnh án, đọc nội dung hiện có, chỉ điền các ô còn trống, gọi Lưu Thông tin chung và Lưu Thông tin chuyên khoa của chính trang đó, rồi mở lại để so.
- Khi OneMES báo cảnh báo hoặc trang không như mong đợi, tool dừng bệnh nhân đó và ghi nhật ký, không đoán.

## Phát triển

```
npm ci && (cd ui && npm ci)
npm run mock                 # OneMES giả lập ở http://127.0.0.1:2026
SYL_ONEMES_URL=http://127.0.0.1:2026/login.aspx npx electron .
npm test                     # agent, driver, updater trên trang giả lập
```
