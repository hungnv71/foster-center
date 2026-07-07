import * as XLSX from "xlsx";

const todayStr = () => new Date().toISOString().slice(0, 10);

function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try { resolve(XLSX.read(e.target.result, { type: "array", cellDates: true })); }
      catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Không đọc được file"));
    reader.readAsArrayBuffer(file);
  });
}

function firstSheetRows(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return "";
}

function toISODate(v) {
  if (!v) return "";
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // yyyy-mm-dd
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}

/** Đọc file Excel danh sách học sinh -> {students, errors, total}
 *  Mỗi student có thêm field classNames (mảng tên lớp lấy từ cột "Lớp học", nếu có) để tự động đăng ký lớp khi import. */
export async function parseStudentsExcel(file) {
  const wb = await readWorkbook(file);
  const rows = firstSheetRows(wb);
  const students = [];
  const errors = [];
  rows.forEach((row, i) => {
    const name = pick(row, "Họ tên", "Ho ten", "Tên", "Name");
    if (!name) { errors.push(`Dòng ${i + 2}: thiếu "Họ tên" — đã bỏ qua`); return; }
    const classRaw = pick(row, "Lớp học", "Lop hoc", "Lớp đăng ký", "Class");
    const classNames = classRaw ? classRaw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean) : [];
    students.push({
      name,
      grade: pick(row, "Khối", "Khoi", "Lớp") || "10",
      phone: pick(row, "SĐT", "SDT", "SĐT HS", "Điện thoại"),
      parentName: pick(row, "Phụ huynh", "Phu huynh", "Tên phụ huynh"),
      parentPhone: pick(row, "SĐT PH", "SDT PH", "SĐT phụ huynh"),
      parentCccd: pick(row, "CCCD PH", "CCCD", "Số CCCD phụ huynh", "CCCD phụ huynh"),
      parentTaxCode: pick(row, "MST PH", "MST", "Mã số thuế", "Mã số thuế phụ huynh"),
      address: pick(row, "Địa chỉ", "Dia chi"),
      joinDate: toISODate(row["Ngày nhập học"] ?? row["Ngay nhap hoc"]) || todayStr(),
      classNames,
    });
  });
  return { students, errors, total: rows.length };
}

/** Đọc file Excel danh sách giáo viên -> {teachers, errors, total} */
export async function parseTeachersExcel(file) {
  const wb = await readWorkbook(file);
  const rows = firstSheetRows(wb);
  const teachers = [];
  const errors = [];
  rows.forEach((row, i) => {
    const name = pick(row, "Họ tên", "Ho ten", "Tên", "Name");
    if (!name) { errors.push(`Dòng ${i + 2}: thiếu "Họ tên" — đã bỏ qua`); return; }
    teachers.push({
      name,
      subject: pick(row, "Môn dạy", "Mon day", "Môn") || "Toán",
      phone: pick(row, "SĐT", "SDT", "Điện thoại"),
      email: pick(row, "Email", "Mail"),
      joinDate: toISODate(row["Ngày vào làm"] ?? row["Ngay vao lam"]) || todayStr(),
    });
  });
  return { teachers, errors, total: rows.length };
}

function downloadTemplate(rows, sheetName, fileName, colWidths) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = colWidths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

export function downloadStudentTemplate() {
  downloadTemplate(
    [{ "Họ tên": "Nguyễn Văn A", "Khối": "10", "SĐT": "0900000000", "Phụ huynh": "Nguyễn Văn B", "SĐT PH": "0911111111", "CCCD PH": "", "MST PH": "", "Địa chỉ": "12 Lê Lợi, Q1", "Ngày nhập học": "01/07/2026", "Lớp học": "Toán 10A, Anh 9A" }],
    "Học sinh", "Mau-danh-sach-hoc-sinh.xlsx", [20, 8, 14, 20, 14, 16, 12, 28, 14, 22]
  );
}
export function downloadTeacherTemplate() {
  downloadTemplate(
    [{ "Họ tên": "Nguyễn Thị B", "Môn dạy": "Toán", "SĐT": "0900000000", "Email": "gv@foster.vn", "Ngày vào làm": "01/07/2026" }],
    "Giáo viên", "Mau-danh-sach-giao-vien.xlsx", [20, 14, 14, 22, 14]
  );
}
