# Checklist Any & Eny

Trang web tick thói quen hằng ngày cho 2 người. Chạy trên GitHub Pages, không cần server hay dịch vụ nào khác.

- Code (repo này, công khai) chỉ là HTML/JS tĩnh.
- Dữ liệu nằm trong file `data.json` ở repo **riêng tư** `habit-checklist-data`. Trang đọc và ghi file này bằng GitHub API.
- Mỗi điện thoại nhập **một lần** một mã truy cập (fine-grained token, chỉ được đọc/ghi repo dữ liệu). Mã lưu trong trình duyệt của máy đó, không nằm trong code.

## Luật

Xem đầu file `js/rules.js`: việc mỗi ngày, giới hạn theo tuần của Any, skip, cách tính chuỗi, phần thưởng 7/14/21 ngày, mục tiêu 50 ngày. Sửa câu chữ thoải mái; giữ nguyên các khóa (`tap`, `game`…) vì chúng nằm trong `data.json`.

## Test

`npm test` (Node 22, không cần cài gì).
