import * as XLSX from "xlsx";

const fmtDateVN = (d) => (d ? new Date(d).toLocaleDateString("vi-VN") : "");
const todayTag = () => new Date().toISOString().slice(0, 10);
const ATT_LABEL = { present: "Có mặt", absent: "Vắng", late: "Muộn", excused: "Có phép" };
const LOG_ACTION_LABEL = { create: "Thêm", update: "Sửa", delete: "Xóa" };

function autoWidth(ws, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]).map((k) => ({
    wch: Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)) + 2,
  }));
  ws["!cols"] = cols;
}
function sheetFrom(rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  autoWidth(ws, rows);
  return ws;
}
function oneSheetWorkbook(rows, sheetName, filename) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(rows), sheetName);
  XLSX.writeFile(wb, filename);
}

// ═══════════════════ row builders (dùng chung giữa export toàn bộ và export từng tab) ═══════════════════
const buildTeacherRows = (data) => data.teachers.map((t) => ({
  "Họ tên": t.name, "Môn dạy": t.subject, "SĐT": t.phone, "Email": t.email,
  "Lương/buổi": t.feePerSession, "Ngày vào làm": fmtDateVN(t.joinDate),
}));

const buildClassRows = (data) => data.classes.map((c) => {
  const t = data.teachers.find((x) => x.id === c.teacherId);
  const enrolled = data.registrations.filter((r) => r.classId === c.id && r.status === "active").length;
  return {
    "Tên lớp": c.name, "Môn": c.subject, "Giáo viên": t?.name || "",
    "Lịch học": (c.schedule || []).map((s) => `${s.day} ${s.startTime}-${s.endTime} (${s.room})`).join(" | "),
    "Sĩ số": `${enrolled}/${c.maxStudents}`,
    "Học phí/buổi": c.feePerSession, "Trạng thái": c.status === "active" ? "Đang hoạt động" : "Tạm dừng",
  };
});

const buildStudentRows = (data) => data.students.map((s) => {
  const n = data.registrations.filter((r) => r.studentId === s.id && r.status === "active").length;
  return {
    "Họ tên": s.name, "Khối": s.grade, "SĐT": s.phone, "Phụ huynh": s.parentName, "SĐT PH": s.parentPhone,
    "Địa chỉ": s.address, "Số lớp đang học": n, "Ngày nhập học": fmtDateVN(s.joinDate),
  };
});

const buildRegistrationRows = (data) => data.registrations.map((r) => {
  const s = data.students.find((x) => x.id === r.studentId);
  const c = data.classes.find((x) => x.id === r.classId);
  return {
    "Học sinh": s?.name || "", "Lớp": c?.name || "", "Ngày đăng ký": fmtDateVN(r.startDate),
    "Trạng thái": r.status === "active" ? "Đang học" : "Đã nghỉ",
  };
});

const buildPaymentRows = (data) => data.payments
  .slice().sort((a, b) => b.year - a.year || b.month - a.month)
  .map((p) => {
    const s = data.students.find((x) => x.id === p.studentId);
    const c = data.classes.find((x) => x.id === p.classId);
    return {
      "Tháng": p.month, "Năm": p.year, "Học sinh": s?.name || "", "Lớp": c?.name || "",
      "Số tiền": p.amount, "Trạng thái": p.status === "paid" ? "Đã thu" : "Chưa thu",
      "Ngày thu": p.paidDate ? fmtDateVN(p.paidDate) : "",
    };
  });

const buildAttendanceRows = (data) => (data.attendance || [])
  .slice().sort((a, b) => (a.date < b.date ? 1 : -1))
  .map((a) => {
    const s = data.students.find((x) => x.id === a.studentId);
    const c = data.classes.find((x) => x.id === a.classId);
    return { "Ngày": fmtDateVN(a.date), "Lớp": c?.name || "", "Học sinh": s?.name || "", "Trạng thái": ATT_LABEL[a.status] || a.status, "Ghi chú": a.note || "" };
  });

const buildPayrollRows = (data) => (data.payroll || [])
  .slice().sort((a, b) => b.year - a.year || b.month - a.month)
  .map((p) => {
    const t = data.teachers.find((x) => x.id === p.teacherId);
    return {
      "Tháng": p.month, "Năm": p.year, "Giáo viên": t?.name || "", "Số buổi": p.sessionsTaught,
      "Số tiền": p.amount, "Trạng thái": p.status === "paid" ? "Đã trả" : "Chưa trả",
      "Ngày trả": p.paidDate ? fmtDateVN(p.paidDate) : "",
    };
  });

const buildActivityLogRows = (data) => (data.activity_log || [])
  .slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  .map((l) => ({
    "Thời gian": new Date(l.createdAt).toLocaleString("vi-VN"),
    "Hành động": LOG_ACTION_LABEL[l.action] || l.action,
    "Nội dung": l.summary,
  }));

// ═══════════════════ export toàn bộ (nút ở sidebar) ═══════════════════
export function exportFullWorkbook(data) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(buildTeacherRows(data)), "Giáo viên");
  XLSX.utils.book_append_sheet(wb, sheetFrom(buildClassRows(data)), "Lớp học");
  XLSX.utils.book_append_sheet(wb, sheetFrom(buildStudentRows(data)), "Học sinh");
  XLSX.utils.book_append_sheet(wb, sheetFrom(buildRegistrationRows(data)), "Đăng ký");
  XLSX.utils.book_append_sheet(wb, sheetFrom(buildPaymentRows(data)), "Học phí");
  XLSX.utils.book_append_sheet(wb, sheetFrom(buildAttendanceRows(data)), "Điểm danh");
  XLSX.utils.book_append_sheet(wb, sheetFrom(buildPayrollRows(data)), "Lương GV");
  XLSX.utils.book_append_sheet(wb, sheetFrom(buildActivityLogRows(data)), "Nhật ký");
  XLSX.writeFile(wb, `Foster-du-lieu-${todayTag()}.xlsx`);
}

// ═══════════════════ export riêng từng tab ═══════════════════
export const exportTeachersTab = (data) => oneSheetWorkbook(buildTeacherRows(data), "Giáo viên", `Foster-giao-vien-${todayTag()}.xlsx`);
export const exportClassesTab = (data) => oneSheetWorkbook(buildClassRows(data), "Lớp học", `Foster-lop-hoc-${todayTag()}.xlsx`);
export const exportStudentsTab = (data) => oneSheetWorkbook(buildStudentRows(data), "Học sinh", `Foster-hoc-sinh-${todayTag()}.xlsx`);
export const exportAttendanceTab = (data) => oneSheetWorkbook(buildAttendanceRows(data), "Điểm danh", `Foster-diem-danh-${todayTag()}.xlsx`);
export const exportPayrollTab = (data) => oneSheetWorkbook(buildPayrollRows(data), "Lương GV", `Foster-luong-gv-${todayTag()}.xlsx`);
export const exportActivityLogTab = (data) => oneSheetWorkbook(buildActivityLogRows(data), "Nhật ký", `Foster-nhat-ky-${todayTag()}.xlsx`);

export function exportDashboardTab(data, todaySessions) {
  const wb = XLSX.utils.book_new();
  const summary = [{
    "Lớp đang hoạt động": data.classes.filter((c) => c.status === "active").length,
    "Học sinh đang học": [...new Set(data.registrations.filter((r) => r.status === "active").map((r) => r.studentId))].length,
    "Giáo viên": data.teachers.length,
  }];
  XLSX.utils.book_append_sheet(wb, sheetFrom(summary), "Tổng quan");
  const todayRows = todaySessions.map(({ cls, slot, teacherName, enrolled }) => ({
    "Giờ học": `${slot.startTime}-${slot.endTime}`, "Lớp": cls.name, "Môn": cls.subject,
    "Giáo viên": teacherName, "Phòng": slot.room, "Sĩ số": enrolled,
  }));
  XLSX.utils.book_append_sheet(wb, sheetFrom(todayRows), "Lịch hôm nay");
  XLSX.writeFile(wb, `Foster-tong-quan-${todayTag()}.xlsx`);
}

export function exportDebtSummaryTab(debtList) {
  const rows = debtList.flatMap(({ student, items }) =>
    items.map((it) => ({
      "Học sinh": student.name, "SĐT PH": student.parentPhone, "Lớp": it.cl.name,
      "Tháng": it.month, "Năm": it.year, "Số tiền nợ": it.amount,
    }))
  );
  oneSheetWorkbook(rows, "Công nợ", `Foster-cong-no-${todayTag()}.xlsx`);
}

// ═══════════════════ báo cáo học phí / lương / báo cáo tổng hợp ═══════════════════
const DAY_CODE_BY_JSDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
function sessionsInMonth(schedule, month, year) {
  if (!schedule?.length) return 0;
  const scheduledDays = new Set(schedule.map((s) => s.day));
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (scheduledDays.has(DAY_CODE_BY_JSDAY[new Date(year, month - 1, d).getDay()])) count++;
  }
  return count;
}

export function exportMonthlyPaymentReport(rows, month, year) {
  const out = rows.map(({ s, cl, pay }) => ({
    "Học sinh": s.name, "Phụ huynh": s.parentName, "SĐT PH": s.parentPhone, "Lớp": cl.name,
    "Số buổi": sessionsInMonth(cl.schedule, month, year),
    "Học phí": pay?.amount ?? (cl.feePerSession * sessionsInMonth(cl.schedule, month, year)),
    "Trạng thái": !pay ? "Chưa tạo" : pay.status === "paid" ? "Đã thu" : "Chưa thu",
    "Ngày thu": pay?.paidDate ? fmtDateVN(pay.paidDate) : "",
  }));
  oneSheetWorkbook(out, `Thang ${month}-${year}`, `Foster-hoc-phi-T${month}-${year}.xlsx`);
}

export function exportMonthlyPayrollReport(rows, month, year) {
  const out = rows.map(({ t, sessions, amount, roll }) => ({
    "Giáo viên": t.name, "Môn": t.subject, "Số buổi dạy": sessions, "Lương/buổi": t.feePerSession,
    "Tổng lương": amount, "Trạng thái": !roll ? "Chưa tạo" : roll.status === "paid" ? "Đã trả" : "Chưa trả",
    "Ngày trả": roll?.paidDate ? fmtDateVN(roll.paidDate) : "",
  }));
  oneSheetWorkbook(out, `Luong T${month}-${year}`, `Foster-luong-gv-T${month}-${year}.xlsx`);
}

export function exportSummaryReport({ revenueData, gradeData, occData }) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(revenueData.map((r) => ({ "Tháng": r.month, "Doanh thu": r.revenue }))), "Doanh thu");
  XLSX.utils.book_append_sheet(wb, sheetFrom(gradeData.map((g) => ({ "Khối": g.grade, "Số học sinh": g.count }))), "Học sinh theo khối");
  XLSX.utils.book_append_sheet(wb, sheetFrom(occData.map((c) => ({ "Lớp": c.name, "Sĩ số hiện tại": c.enrolled, "Sĩ số tối đa": c.max, "Tỷ lệ lấp đầy (%)": Math.round((c.enrolled / c.max) * 100) }))), "Tỷ lệ lấp đầy");
  XLSX.writeFile(wb, `Foster-bao-cao-${todayTag()}.xlsx`);
}
