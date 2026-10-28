# Sao Y Lệnh 0.6.3

- **Kết quả CLS, tạo y lệnh mới để trống Cấp độ chăm sóc**: OneMES tự điền cấp độ vào y lệnh mới; tool giờ xóa ô này trước khi Lưu.
- **Bỏ phần trong ngoặc sau tên**: ví dụ "Chụp X-quang khớp vai thẳng [số hóa 1 phim]" ghi thành "Chụp X-quang khớp vai thẳng", "Siêu âm khớp (gối, háng, khuỷu, cổ tay….)" ghi thành "Siêu âm khớp".
- **Tỷ trọng nước tiểu ">=1.030"**: kết quả dạng ">=1.030" (hoặc ">", "<", "<=") mà OneMES tô màu xanh hoặc đỏ thì tool coi là bất thường và ghi "Tỷ trọng >=1.030", không bỏ qua nữa.

## 0.6.2

- **Sửa dòng chữ gây hiểu nhầm ở ngày cuối**: trong **Sửa từng ngày**, ngày cuối (ngày 3 khi chọn 3 ngày, ngày 4 khi chọn 4 ngày) trước ghi "Ô không sửa giữ như y lệnh nguồn" nên trông như ngày đó không được sửa. Thực ra ngày cuối vẫn nhận phần sửa của các ngày trước (có chấm cam và chữ "đã sửa"). Giờ dòng chữ ghi rõ: "Ngày cuối: đã nhận phần sửa của các ngày trước, sửa ở đây chỉ đổi ngày này".

## 0.6.1

- **Sửa từng ngày áp dụng cho cả ngày 3, ngày 4**: trước đây nếu sửa ngày 1 khi đang chọn 2 ngày rồi mới tăng lên 3 hoặc 4 ngày, ngày thêm vào không nhận phần sửa ("Ô không sửa giữ như y lệnh nguồn"). Giờ ngày thêm vào nhận đúng phần sửa của ngày trước nó (giờ, bác sĩ, cấp độ, diễn biến), giống ngày 1 và ngày 2. Vẫn sửa riêng từng ngày được.
- **Tự tick Cồn xoa bóp / Cao thông mạch ổn định hơn**: trước đây nếu lần mở bệnh nhân đầu tiên chưa có gì để tick, tool nhớ luôn "không tick" cho y lệnh nguồn đó, nên lần sau mở lại không tự tick nữa; tool cũng nhớ thuốc của các ngày cũ suốt buổi, nên ngày nào anh/chị thêm thuốc trực tiếp trên OneMES thì tool không biết. Giờ mỗi lần mở bệnh nhân tool đều tính lại (thuốc ngày cũ chỉ nhớ 2 phút). Chỉ khi anh/chị tự bấm đổi tick của 2 thuốc này thì tool mới giữ nguyên lựa chọn của anh/chị.
- **Kết quả CLS**: xét nghiệm không có chỉ số bất thường ghi theo tên mục giống các dòng khác, ví dụ "Hóa sinh máu: Các chỉ số trong giới hạn bình thường", "Công thức máu: Các chỉ số trong giới hạn bình thường".
- **Menu chuột phải**: trong các ô sửa diễn biến, nội dung… bấm chuột phải có Cắt, Sao chép, Dán, Xóa, Chọn tất cả, Hoàn tác. Bôi đen chữ ở chỗ khác rồi chuột phải để Sao chép. Dùng được cả trong trang OneMES ở **Trình duyệt**.

## 0.6.0

- **Tự đăng nhập OneMES**: vào **Cài đặt → Tài khoản OneMES** nhập tài khoản và mật khẩu rồi bấm **Lưu tài khoản**, hoặc chỉ cần đăng nhập tay một lần trong trang **Trình duyệt** (đăng nhập được thì tool tự nhớ). Từ đó, mỗi khi OneMES hiện trang đăng nhập (mới mở tool, hết phiên, đang làm thì bị đăng xuất), tool tự điền và đăng nhập rồi làm tiếp việc đang làm. Mật khẩu được mã hóa trên máy, không hiện ra ở đâu. Tắt được bằng công tắc **Tự đăng nhập**. Nếu đăng nhập không được (ví dụ sai mật khẩu), tool không thử lại liên tục mà ghi lý do vào Cài đặt và Nhật ký.
- **Sửa lỗi bắt đăng nhập lại khi chuyển mục**: một nguyên nhân là danh sách bệnh nhân đã quét giữ địa chỉ kèm mã phiên cũ, nên sau khi đăng nhập lại, mở bệnh nhân bằng địa chỉ cũ bị OneMES đưa về trang đăng nhập. Giờ tool luôn mở bằng mã phiên đang dùng. Phiên đăng nhập cũng được giữ khi tắt mở lại tool (nếu máy chủ còn giữ phiên).
- **Tự tick xóa Cồn xoa bóp và Cao thông mạch đã có trong y lệnh nguồn**: các ngày sao lên không lặp lại thuốc đó nữa (dưới tên thuốc ghi "Tự tick xóa N1, N2… (nguồn đã có)"). Riêng ngày đến hạn dùng lại (Cao thông mạch +3 ngày, Cồn xoa bóp +5 ngày) thì giữ lại. Anh/chị vẫn bỏ tick được trước khi sao chép.
- **Tự xóa dòng thuốc/VTYT màu đỏ**: khi sao chép, dòng nào trong Cho thuốc/VTYT của y lệnh mới bị OneMES tô chữ đỏ thì tool tự xóa ở mọi ngày rồi sao chép tiếp bình thường (Nhật ký ghi tên dòng đã xóa; thẻ Kết quả liệt kê trong "Đã bỏ").
- **Thẻ Kết quả gọn hơn**: mỗi ngày một dòng (ngày, giờ, Đúng / số lỗi, số mục bỏ/thêm, nút Sửa, Xóa). Bấm vào ngày nào thì mới mở chi tiết ngày đó để xem và sửa.
- **Kết quả CLS**: xét nghiệm nào không có chỉ số bất thường thì ghi riêng một dòng theo tên mục, ví dụ "Xét nghiệm hóa sinh: Các chỉ số trong giới hạn bình thường."

## 0.5.1

Thẻ **Kết quả CLS**, khi **Tạo y lệnh mới**:
- **Tự bấm "Có"**: nếu OneMES hỏi "Bệnh chính này không được khuyến khích. Bạn vẫn muốn chọn?" thì tool bấm **Có** rồi làm tiếp như bình thường (Nhật ký có ghi lại).
- **Giờ mặc định theo y lệnh thường**: sau khi bấm **Đọc Xem kết quả**, giờ thực hiện tự lấy bằng giờ của y lệnh thường cùng ngày (đổi ngày thì giờ đổi theo). Anh/chị tự gõ giờ thì tool giữ giờ đã gõ; nút **Giờ y lệnh thường** để lấy lại.
- **Y lệnh khác điền sẵn** "* Giải thích kết quả CLS với người bệnh và người nhà." (sửa hoặc xóa được trước khi tạo). Nếu ô đó trên OneMES đã có chữ thì dòng này được thêm xuống dưới.
- **Kết quả dạng chữ không kèm đơn vị**: Positive, Trace, Âm tính… ghi không có đơn vị (ví dụ "Nước tiểu: Nitrit: Positive; Protein: Trace"); kết quả là số vẫn giữ đơn vị.

## 0.5.0

- **Tự sao chép sắc thuốc thang**: sao chép y lệnh thường của một bệnh nhân xong (và không lỗi), nếu bệnh nhân đó có y lệnh sắc thuốc thang thì tool tự sao chép tiếp sắc thuốc thang với **cùng số ngày**, không cần chuyển sang chế độ Sắc thuốc thang và bấm Sao chép nữa. Cách điền giữ như cũ: giờ thực hiện theo y lệnh thường cùng ngày, giờ chỉ định và bác sĩ theo y lệnh thường ngày hôm trước; mục DVKT đã chọn xóa ở chế độ Sắc thuốc thang vẫn được dùng. Bệnh nhân không có sắc thuốc thang thì bỏ qua; y lệnh thường lỗi thì không chạy sắc. Chạy nhiều bệnh nhân (nút **Chạy**) cũng vậy. Kết quả sắc xem ở thẻ **Kết quả** khi chọn **Sắc thuốc thang**.
- **Tick sẵn Cao thông mạch và Cồn xoa bóp**: khi mở bệnh nhân, tool đọc các y lệnh thường (có cả Diễn biến bệnh và Diễn biến PHCN) gần đây. Ngày nào có **Cao thông mạch** thì tick sẵn ô **+** ở ngày đó **+ 3 ngày**; có **Cồn xoa bóp** thì **+ 5 ngày** (ví dụ ngày 13 có Cao thông mạch thì ngày 16 được tick). Dưới tên thuốc ghi rõ "Tự tick N… (vì ngày … có)". Anh/chị vẫn bỏ tick hoặc tick thêm được trước khi bấm Sao chép. Số ngày này đổi ở **Cài đặt → Thêm thuốc khi sao chép → Tự tick sau (ngày)**; để trống là không tự tick.

## 0.4.4

- **Kết quả CLS kiểm tra lại khoảng tham chiếu**: OneMES đôi khi tô xanh/đỏ cả chỉ số vẫn nằm trong khoảng tham chiếu. Giờ tool so từng chỉ số tô màu với cột **Khoảng tham chiếu**: nằm ngoài khoảng mới ghi vào y lệnh, còn nằm trong khoảng thì bỏ qua. Danh sách kết quả ghi rõ "bỏ N chỉ số tô màu nhầm" (rê chuột vào để xem chỉ số nào). Khoảng tham chiếu không đọc được (ví dụ chỉ ghi chữ) thì vẫn theo màu của OneMES.
- **Không có bất thường**: nếu các xét nghiệm đã quét không có chỉ số nào bất thường, nội dung ghi "Các chỉ số trong giới hạn bình thường" (có kết luận CĐHA thì ghi "Xét nghiệm: các chỉ số trong giới hạn bình thường" rồi đến kết luận).

## 0.4.3

- **Thu phóng trang OneMES** trong **Trình duyệt**: mặc định thu nhỏ còn 70% để thấy được nhiều hơn. Trên thanh trên cùng có nút **−** / **+** để chỉnh từng 10%; bấm vào số % để về 70%. Cũng dùng được Ctrl + lăn chuột, Ctrl + và Ctrl −. Tool nhớ mức đã chọn cho lần sau.
- **Nhớ bệnh nhân đang làm**: chuyển sang Trình duyệt, Nhật ký, Cài đặt… rồi quay lại **Bệnh nhân** thì vẫn đang mở đúng bệnh nhân đó, đúng thẻ đang làm (Sao chép, Kết quả, Bệnh án, Dọn thủ thuật, Kết quả CLS) và những gì đã đọc, không phải bấm chọn lại.

## 0.4.2

- **Kết quả CLS**: tool bấm vào ô ngày ở cột **TG chỉ định** của từng dòng (như anh/chị bấm tay), lần lượt từng dòng, rồi chờ bảng chỉ số hiện ra bên phải mới đọc. Bản 0.4.1 bấm vào ô của bảng chứ không bấm vào nút ngày nên không mở được kết quả.
- **Sắc thuốc thang**: bác sĩ điền sẵn giờ lấy theo y lệnh thường ở **thời gian chỉ định** (ngày hôm trước), không phải ngày thực hiện.

## 0.4.1

- **Kết quả CLS đọc được Lịch sử XN**: bản trước không thấy dòng xét nghiệm nào (giờ chỉ định nằm trong ô, dòng mở theo cách khác). Giờ tool đọc từng dòng có ngày giờ, bấm mở và lấy các chỉ số chữ đỏ hoặc xanh dương kèm tên chỉ số (ví dụ "Cholesterol toàn phần: 6.67 mmol/L", "PCT: 0.13%"). Lịch sử CĐHA chỉ lấy phần **Kết luận**. Nếu vẫn không đọc được, Nhật ký ghi lại hình dạng bảng (không có thông tin bệnh nhân) để sửa tiếp.
- **Sắc thuốc thang**:
  - Bỏ hàng **Thêm thuốc** và mục **Cho thuốc / VTYT**; chỉ còn Chỉ định DVKT để xóa nếu cần.
  - **Sửa từng ngày** có hai ô đầy đủ cả giờ và ngày: **Thời gian chỉ định** và **Thời gian thực hiện**.
  - Điền sẵn: thời gian thực hiện và bác sĩ giống y lệnh thường cùng ngày; thời gian chỉ định giống thời gian chỉ định của y lệnh thường ngày hôm trước. Ngày nào chưa có y lệnh thường thì tool báo và giữ như bản sao (nên sao chép y lệnh thường trước).
  - Ngày của y lệnh sắc tính theo thời gian thực hiện (khi kiểm tra trùng ngày và khi kiểm tra lại).

## 0.4.0

- **Dọn thủ thuật các ngày cũ** (thẻ mới **Dọn thủ thuật** của mỗi bệnh nhân): bấm **Quét các ngày cũ**, tool mở từng ngày trước hôm nay có cột DV màu vàng (bỏ qua ngày có y lệnh sắc thuốc thang) và liệt kê các thủ thuật **Hoàn trả** hoặc **Chờ thực hiện**. Bỏ tick mục không muốn dọn rồi bấm **Dọn**: thủ thuật Hoàn trả thì xóa; Chờ thực hiện thì vào **Sửa DVKT**, **Thu hồi**, rồi xóa, như trong video.
- **Sao chép y lệnh sắc thuốc thang**: ở thẻ **Sao chép** chọn **Sắc thuốc thang** thay cho **Y lệnh thường**. Tool lấy y lệnh có Y lệnh khác "Chỉ định sắc thuốc thang" làm nguồn và sao chép như bình thường, đủ các tính năng cũ (số ngày, xóa mục, sửa từng ngày, thêm thuốc, Kết quả). Ngày đã có y lệnh thường vẫn sao chép y lệnh sắc vào được, chỉ không cho hai y lệnh sắc trùng ngày.
- **Cập nhật kết quả cận lâm sàng** (thẻ mới **Kết quả CLS**): bấm **Đọc Xem kết quả**, chọn ngày, bấm **Lấy kết quả**. Tool đọc lần lượt Lịch sử XN rồi Lịch sử CĐHA từ trên xuống, ghi các chỉ số màu đỏ hoặc xanh dương (tên chỉ số + kết quả) và kết luận CĐHA; chỉ số bình thường bỏ qua. Anh/chị sửa nội dung, chọn giờ và ngày, rồi **Tạo y lệnh mới**: tool bấm **Thêm y lệnh mới**, điền giờ và nội dung vào Diễn biến bệnh, Lưu.
- **Nút gọn hơn**: bỏ các nút to ở cuối trang. Các nút chính (Quét, Chạy, Sao chép, Cập nhật bệnh án, Kiểm tra lại) nhỏ lại và nằm ở góc trên bên phải; Từng bước và Tự Hoàn tất nằm cạnh các thẻ. Khi tool đang chạy, thanh tiến trình và nút **Dừng** là một dải mỏng ở trên.

## 0.3.4

- **Nhiều mẫu bệnh án**: lưu được bao nhiêu mẫu cũng được. Trong thẻ **Bệnh án** của mỗi bệnh nhân có ô **Mẫu** để chọn mẫu, rồi bấm **Điền từ mẫu**.
- Tạo mẫu bằng hai cách: tự điền các mục rồi bấm **Lưu làm mẫu** (chọn **Thêm mẫu mới** hoặc **Ghi đè mẫu có sẵn**), hoặc **Nhập mẫu từ file HTML** (mỗi file thêm một mẫu mới).
- **Cài đặt → Mẫu Thông tin bệnh án**: xem danh sách mẫu, đổi tên, xóa, thêm mẫu từ file. Mẫu có ngôi sao là mẫu bệnh nhân mới bắt đầu; bấm ngôi sao để đổi.
- Mẫu đã lưu ở bản trước vẫn còn, thành mẫu đầu tiên trong danh sách.

## 0.3.3

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
