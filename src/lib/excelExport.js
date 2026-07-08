import ExcelJS from "exceljs";

const fmtDateVN = (d) => (d ? new Date(d).toLocaleDateString("vi-VN") : "");
const todayTag = () => new Date().toISOString().slice(0, 10);
const ATT_LABEL = { present: "Có mặt", absent: "Vắng", late: "Muộn", excused: "Có phép" };
const LOG_ACTION_LABEL = { create: "Thêm", update: "Sửa", delete: "Xóa" };
const NAVY = "FF132A52";
const BORDER = "FFE2E8F0";
const HEADER_TXT = "FFFFFFFF";

// ═══════════════════ hạ tầng: tạo sheet có định dạng đẹp + tải file ═══════════════════
async function downloadWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function addStyledSheet(wb, sheetName, rows, opts = {}) {
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  if (!rows.length) { ws.addRow(["Không có dữ liệu"]); return ws; }
  const headers = Object.keys(rows[0]);
  const currencyCols = opts.currencyColumns || headers.filter((h) => /tiền|lương|học phí|nợ/i.test(h));
  const centerCols = opts.centerColumns || headers.filter((h) => /^(khối|số buổi|% học phí|trạng thái|ngày|tháng|năm|sĩ số)/i.test(h));

  ws.columns = headers.map((h) => ({
    header: h, key: h,
    width: Math.min(42, Math.max(h.length, ...rows.map((r) => String(r[h] ?? "").length)) + 3),
  }));

  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TXT }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  headerRow.height = 22;

  rows.forEach((r) => ws.addRow(r));

  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    if (currencyCols.includes(h)) { col.numFmt = "#,##0\" đ\""; col.alignment = { horizontal: "right" }; }
    else if (centerCols.includes(h)) { col.alignment = { horizontal: "center" }; }
  });

  ws.eachRow((row, rowNum) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: BORDER } }, left: { style: "thin", color: { argb: BORDER } },
        bottom: { style: "thin", color: { argb: BORDER } }, right: { style: "thin", color: { argb: BORDER } },
      };
      if (rowNum > 1) cell.alignment = { ...cell.alignment, vertical: "middle" };
    });
    if (rowNum > 1 && rowNum % 2 === 0) row.eachCell((c) => { if (!c.fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F8FA" } }; });
  });

  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  return ws;
}

async function oneSheetWorkbook(rows, sheetName, filename, opts) {
  const wb = new ExcelJS.Workbook();
  addStyledSheet(wb, sheetName, rows, opts);
  await downloadWorkbook(wb, filename);
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
    "CCCD PH": s.parentCccd || "", "MST PH": s.parentTaxCode || "", "% học phí": s.feePercent ?? 100,
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

// Số buổi đi học thực tế (mọi trạng thái) vs số buổi tính học phí (đã trừ buổi "không tính")
function sessionCounts(attendance, studentId, classId, month, year) {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const recs = attendance.filter((a) => a.studentId === studentId && a.classId === classId && a.date.startsWith(prefix));
  return { total: recs.length, billed: recs.filter((a) => a.billable !== false).length };
}

const buildPaymentRows = (data) => data.payments
  .slice().sort((a, b) => b.year - a.year || b.month - a.month)
  .map((p) => {
    const s = data.students.find((x) => x.id === p.studentId);
    const c = data.classes.find((x) => x.id === p.classId);
    const counts = sessionCounts(data.attendance || [], p.studentId, p.classId, p.month, p.year);
    return {
      "Tháng": p.month, "Năm": p.year, "Học sinh": s?.name || "", "Lớp": c?.name || "",
      "Số buổi đi học": counts.total, "Số buổi tính học phí": p.sessionsBilled ?? counts.billed,
      "% học phí": s?.feePercent ?? 100, "Số tiền": p.amount, "Trạng thái": p.status === "paid" ? "Đã thu" : "Chưa thu",
      "Ngày thu": p.paidDate ? fmtDateVN(p.paidDate) : "",
    };
  });

const buildAttendanceRows = (data) => (data.attendance || [])
  .slice().sort((a, b) => (a.date < b.date ? 1 : -1))
  .map((a) => {
    const s = data.students.find((x) => x.id === a.studentId);
    const c = data.classes.find((x) => x.id === a.classId);
    return {
      "Ngày": fmtDateVN(a.date), "Lớp": c?.name || "", "Buổi": a.overrideId ? "Học bù (lớp tạm)" : "Chính thức",
      "Học sinh": s?.name || "", "Trạng thái": ATT_LABEL[a.status] || a.status,
      "Tính học phí": a.billable === false ? "Không" : "Có", "Ghi chú": a.note || "",
    };
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

const buildOverrideRows = (data) => (data.session_overrides || [])
  .slice().sort((a, b) => (a.originalDate < b.originalDate ? 1 : -1))
  .map((o) => {
    const c = data.classes.find((x) => x.id === o.classId);
    return {
      "Lớp": c?.name || "", "Ngày gốc": fmtDateVN(o.originalDate),
      "Trạng thái": o.status === "cancelled" ? "Nghỉ" : "Học bù",
      "Ngày học bù": o.makeupDate ? fmtDateVN(o.makeupDate) : "",
      "Giờ học bù": o.makeupStartTime ? `${o.makeupStartTime}-${o.makeupEndTime}` : "",
      "Phòng học bù": o.makeupRoom || "", "Ghi chú": o.note || "",
    };
  });

// ═══════════════════ export toàn bộ (nút ở sidebar) ═══════════════════
export async function exportFullWorkbook(data) {
  const wb = new ExcelJS.Workbook();
  addStyledSheet(wb, "Giáo viên", buildTeacherRows(data));
  addStyledSheet(wb, "Lớp học", buildClassRows(data));
  addStyledSheet(wb, "Học sinh", buildStudentRows(data));
  addStyledSheet(wb, "Đăng ký", buildRegistrationRows(data));
  addStyledSheet(wb, "Học phí", buildPaymentRows(data));
  addStyledSheet(wb, "Điểm danh", buildAttendanceRows(data));
  addStyledSheet(wb, "Nghỉ - Học bù", buildOverrideRows(data));
  addStyledSheet(wb, "Lương GV", buildPayrollRows(data));
  addStyledSheet(wb, "Nhật ký", buildActivityLogRows(data));
  await downloadWorkbook(wb, `Foster-du-lieu-${todayTag()}.xlsx`);
}

// ═══════════════════ export riêng từng tab ═══════════════════
export const exportTeachersTab = (data) => oneSheetWorkbook(buildTeacherRows(data), "Giáo viên", `Foster-giao-vien-${todayTag()}.xlsx`);
export const exportClassesTab = (data) => oneSheetWorkbook(buildClassRows(data), "Lớp học", `Foster-lop-hoc-${todayTag()}.xlsx`);
export const exportStudentsTab = (data) => oneSheetWorkbook(buildStudentRows(data), "Học sinh", `Foster-hoc-sinh-${todayTag()}.xlsx`);
export const exportAttendanceTab = (data) => oneSheetWorkbook(buildAttendanceRows(data), "Điểm danh", `Foster-diem-danh-${todayTag()}.xlsx`);
export const exportPayrollTab = (data) => oneSheetWorkbook(buildPayrollRows(data), "Lương GV", `Foster-luong-gv-${todayTag()}.xlsx`);
export const exportActivityLogTab = (data) => oneSheetWorkbook(buildActivityLogRows(data), "Nhật ký", `Foster-nhat-ky-${todayTag()}.xlsx`);

export async function exportDashboardTab(data, todaySessions) {
  const wb = new ExcelJS.Workbook();
  const summary = [{
    "Lớp đang hoạt động": data.classes.filter((c) => c.status === "active").length,
    "Học sinh đang học": [...new Set(data.registrations.filter((r) => r.status === "active").map((r) => r.studentId))].length,
    "Giáo viên": data.teachers.length,
  }];
  addStyledSheet(wb, "Tổng quan", summary);
  const todayRows = todaySessions.map(({ cls, slot, teacherName, enrolled }) => ({
    "Giờ học": `${slot.startTime}-${slot.endTime}`, "Lớp": cls.name, "Môn": cls.subject,
    "Giáo viên": teacherName, "Phòng": slot.room, "Sĩ số": enrolled,
  }));
  addStyledSheet(wb, "Lịch hôm nay", todayRows);
  await downloadWorkbook(wb, `Foster-tong-quan-${todayTag()}.xlsx`);
}

export function exportDebtSummaryTab(debtList) {
  const rows = debtList.flatMap(({ student, items }) =>
    items.map((it) => ({
      "Học sinh": student.name, "SĐT PH": student.parentPhone, "Lớp": it.cl.name,
      "Tháng": it.month, "Năm": it.year, "Số tiền nợ": it.amount,
    }))
  );
  return oneSheetWorkbook(rows, "Công nợ", `Foster-cong-no-${todayTag()}.xlsx`);
}

// ═══════════════════ báo cáo học phí / lương / báo cáo tổng hợp ═══════════════════
export function exportMonthlyPaymentReport(rows, month, year) {
  const out = rows.map(({ s, cl, pay, sessions, amount }) => ({
    "Học sinh": s.name, "Phụ huynh": s.parentName, "SĐT PH": s.parentPhone, "Lớp": cl.name,
    "Số buổi tính học phí": sessions, "% học phí": s.feePercent ?? 100,
    "Học phí": amount,
    "Trạng thái": !pay ? "Chưa tạo" : pay.status === "paid" ? "Đã thu" : "Chưa thu",
    "Ngày thu": pay?.paidDate ? fmtDateVN(pay.paidDate) : "",
  }));
  return oneSheetWorkbook(out, `Thang ${month}-${year}`, `Foster-hoc-phi-T${month}-${year}.xlsx`);
}

export function exportMonthlyPayrollReport(rows, month, year) {
  const out = rows.map(({ t, sessions, amount, roll }) => ({
    "Giáo viên": t.name, "Môn": t.subject, "Số buổi dạy": sessions, "Lương/buổi": t.feePerSession,
    "Tổng lương": amount, "Trạng thái": !roll ? "Chưa tạo" : roll.status === "paid" ? "Đã trả" : "Chưa trả",
    "Ngày trả": roll?.paidDate ? fmtDateVN(roll.paidDate) : "",
  }));
  return oneSheetWorkbook(out, `Luong T${month}-${year}`, `Foster-luong-gv-T${month}-${year}.xlsx`);
}

export async function exportSummaryReport({ revenueData, gradeData, occData }) {
  const wb = new ExcelJS.Workbook();
  addStyledSheet(wb, "Doanh thu", revenueData.map((r) => ({ "Tháng": r.month, "Doanh thu": r.revenue })));
  addStyledSheet(wb, "Học sinh theo khối", gradeData.map((g) => ({ "Khối": g.grade, "Số học sinh": g.count })));
  addStyledSheet(wb, "Tỷ lệ lấp đầy", occData.map((c) => ({ "Lớp": c.name, "Sĩ số hiện tại": c.enrolled, "Sĩ số tối đa": c.max, "Tỷ lệ lấp đầy (%)": Math.round((c.enrolled / c.max) * 100) })));
  await downloadWorkbook(wb, `Foster-bao-cao-${todayTag()}.xlsx`);
}
