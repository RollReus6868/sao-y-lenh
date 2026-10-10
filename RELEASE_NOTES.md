# Sao Y Lệnh 0.3.3

- **Thêm Cồn xoa bóp và Cao thông mạch** khi sao chép: trong trang bệnh nhân có hàng **Thêm thuốc** với ô xanh **+** cho từng ngày. Tick ngày nào thì tool mở **Kê Tây y/VTYT** của ngày đó, chọn kho KCPSX, tìm thuốc, điền SL 1 và cách dùng như anh/chị vẫn nhập (Cồn xoa bóp: "Mỗi lần dùng 5ml, xoa bóp các chỗ đau 4 lần/ngày"; Cao thông mạch: "Uống 20ml/lần * 2 lần/ngày * 3 ngày (sáng, chiều) sau ăn"), bấm **Thêm** rồi **Chấp nhận**. Ngày đã có thuốc đó thì không thêm lần nữa. Đổi kho, số lượng, cách dùng, hoặc thêm thuốc khác ở **Cài đặt → Thêm thuốc khi sao chép**.
- **Sửa từng ngày**: sửa ở một ngày thì các ngày sau tự theo, không cần bấm "Dùng cho mọi ngày" nữa. Ngày sau nào đã sửa riêng thì giữ phần riêng đó.
- **Bệnh án**: khi cập nhật lên OneMES, ô nào trên OneMES đã có nội dung thì giữ nguyên, tool chỉ điền vào ô còn trống và báo số mục đã điền, số mục giữ nguyên.
- Bỏ các gạch đỏ kiểm tra chính tả dưới chữ trong mọi ô nhập.

## 0.3.2

- Thẻ **Bệnh án**, phần Thông tin chung: bỏ các mục từ **Tuần hoàn** trở xuống (Tuần hoàn, Hô hấp, … đến Phương pháp điều trị) vì khoa không dùng. Tool không hiện và không ghi các mục này lên OneMES nữa; các mục khác giữ nguyên.

## 0.3.1

- Sửa nút **Ds Điều trị nội trú** ngay sau khi đăng nhập: trang chủ OneMES có một bảng bệnh nhân nhỏ trùng tên với bảng của trang Ds Điều trị nội trú, nên tool tưởng đã ở đúng trang và chỉ tải lại trang chủ. Giờ tool phân biệt hai bảng theo các cột (T/G vào, Họ tên).

## 0.3.0

- **Sửa từng ngày** trước khi sao chép: giờ thực hiện (giờ chỉ định tự lùi 1 phút), bác sĩ, cấp độ chăm sóc, diễn biến bệnh, diễn biến PHCN. Ngày nào sửa thì tool sửa và bấm Lưu trên OneMES cho đúng ngày đó.
- Các ngày sao chép hiện cả thứ: "T4 14/10", "Thứ 4 14/10".
- Vật tư y tế ghi rõ **(Hao phí)** hoặc **(Bảo hiểm)** cạnh tên.
- Danh sách bác sĩ và cấp độ chăm sóc đọc từ OneMES. Vào **Cài đặt → Bác sĩ hay dùng** để gắn sao các bác sĩ hay chọn, họ hiện đầu danh sách.
- Thẻ **Kết quả**: nút **Sửa** cho từng ngày (giờ, bác sĩ, cấp độ, diễn biến, tick mục cần xóa) rồi **Cập nhật lên OneMES**: tool Thu hồi, sửa, Lưu, Hoàn tất lại và kiểm tra.
- Thẻ mới **Bệnh án** cho từng bệnh nhân: toàn bộ mục B. PHẦN BỆNH ÁN (163 mục). Nhập mẫu từ file HTML trang Thông tin bệnh án đã hoàn tất, sửa, rồi **Cập nhật bệnh án lên OneMES** (tool lưu Thông tin chung và Thông tin chuyên khoa rồi đọc lại để kiểm tra). Có **Đọc từ OneMES** và **Lưu làm mẫu**.
- Chống nháy: trình duyệt OneMES được tách hẳn khỏi cửa sổ khi không xem, giao diện bỏ hiệu ứng làm mờ, cập nhật gom lại; trên Windows mặc định vẽ bằng CPU (tắt/bật ở **Cài đặt → Hiển thị**).
- Nút **Ds Điều trị nội trú** tìm thêm mã phiên trong trang và menu, nên chạy được ngay sau khi đăng nhập.

## 0.2.0

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
