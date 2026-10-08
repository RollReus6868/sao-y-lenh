# Sao Y Lệnh 0.2.0

- Kiểm tra lại sau khi chạy: tool mở lại từng ngày vừa sao chép trên OneMES, so với lựa chọn, và báo ngày nào còn sót mục cần xóa, chưa Hoàn tất hoặc sai ngày.
- Thẻ **Kết quả** trong mỗi bệnh nhân: xem đầy đủ từng ngày vừa tạo (thời gian, diễn biến bệnh, diễn biến PHCN, thuốc/VTYT, DVKT, các mục đã bỏ). Có nút **Kiểm tra lại trên OneMES**.
- Nút **Xóa** cho từng ngày vừa sao chép: tool tự Thu hồi rồi Xóa y lệnh đó trên OneMES (hỏi lại trước khi xóa).
- Danh sách bệnh nhân hiện "Cần xem lại" khi lần kiểm tra thấy vấn đề.
- Sửa nút **Ds Điều trị nội trú**: chạy được cả khi đang ở trang chưa có menu (như trang đầu sau đăng nhập); nếu không mở được thì báo lỗi ngay trong mục Trình duyệt.

## 0.1.2

- Sửa lỗi trang OneMES vẫn hiện và che các mục khác sau khi rời mục Trình duyệt.

## 0.1.1

- Sửa lỗi "Ngày 2 có trạng thái Hoàn tất": OneMES tạo sẵn các ngày sau ở trạng thái Hoàn tất, nay tool tự Thu hồi rồi xóa và Hoàn tất lại.
- Không sao chép trùng: nếu bệnh nhân đã có y lệnh cho các ngày sắp tạo, tool dừng và báo ngày bị trùng.
- Lần quét đầu không còn ra 0 bệnh nhân (tool chờ OneMES tải xong danh sách).
- Hết chớp nháy khi tool đang chạy.
- Trình duyệt OneMES chuyển sang mục riêng "Trình duyệt" ở thanh bên, rộng hơn, dễ thao tác.
- Nút "Ds Điều trị nội trú" đưa trình duyệt thẳng tới danh sách bệnh nhân.
