import * as XLSX from "xlsx";

const fmtDateVN = (d) => (d ? new Date(d).toLocaleDateString("vi-VN") : "");
const todayTag = () => new Date().toISOString().slice(0, 10);

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

/** Export toàn bộ dữ liệu (5 sheets, tên cột tiếng Việt) */
export function exportFullWorkbook(data) {
  const wb = XLSX.utils.book_new();

  const teacherRows = data.teachers.map((t) => ({
    "Họ tên": t.name, "Môn dạy": t.subject, "SĐT": t.phone, "Email": t.email, "Ngày vào làm": fmtDateVN(t.joinDate),
  }));
  XLSX.utils.book_append_sheet(wb, sheetFrom(teacherRows), "Giáo viên");

  const classRows = data.classes.map((c) => {
    const t = data.teachers.find((x) => x.id === c.teacherId);
    const enrolled = data.registrations.filter((r) => r.classId === c.id && r.status === "active").length;
    return {
      "Tên lớp": c.name, "Môn": c.subject, "Giáo viên": t?.name || "", "Lịch học": c.days.join(","),
      "Giờ học": `${c.startTime}-${c.endTime}`, "Phòng": c.room, "Sĩ số": `${enrolled}/${c.maxStudents}`,
      "Học phí/tháng": c.monthlyFee, "Trạng thái": c.status === "active" ? "Đang hoạt động" : "Tạm dừng",
    };
  });
  XLSX.utils.book_append_sheet(wb, sheetFrom(classRows), "Lớp học");

  const studentRows = data.students.map((s) => {
    const n = data.registrations.filter((r) => r.studentId === s.id && r.status === "active").length;
    return {
      "Họ tên": s.name, "Khối": s.grade, "SĐT": s.phone, "Phụ huynh": s.parentName, "SĐT PH": s.parentPhone,
      "Địa chỉ": s.address, "Số lớp đang học": n, "Ngày nhập học": fmtDateVN(s.joinDate),
    };
  });
  XLSX.utils.book_append_sheet(wb, sheetFrom(studentRows), "Học sinh");

  const regRows = data.registrations.map((r) => {
    const s = data.students.find((x) => x.id === r.studentId);
    const c = data.classes.find((x) => x.id === r.classId);
    return {
      "Học sinh": s?.name || "", "Lớp": c?.name || "", "Ngày đăng ký": fmtDateVN(r.startDate),
      "Trạng thái": r.status === "active" ? "Đang học" : "Đã nghỉ",
    };
  });
  XLSX.utils.book_append_sheet(wb, sheetFrom(regRows), "Đăng ký");

  const payRows = data.payments
    .sort((a, b) => b.year - a.year || b.month - a.month)
    .map((p) => {
      const s = data.students.find((x) => x.id === p.studentId);
      const c = data.classes.find((x) => x.id === p.classId);
      return {
        "Tháng": p.month, "Năm": p.year, "Học sinh": s?.name || "", "Lớp": c?.name || "",
        "Số tiền": p.amount, "Trạng thái": p.status === "paid" ? "Đã thu" : "Chưa thu",
        "Ngày thu": p.paidDate ? fmtDateVN(p.paidDate) : "",
      };
    });
  XLSX.utils.book_append_sheet(wb, sheetFrom(payRows), "Học phí");

  const ATT_LABEL = { present: "Có mặt", absent: "Vắng", late: "Muộn", excused: "Có phép" };
  const attRows = (data.attendance || [])
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((a) => {
      const s = data.students.find((x) => x.id === a.studentId);
      const c = data.classes.find((x) => x.id === a.classId);
      return { "Ngày": fmtDateVN(a.date), "Lớp": c?.name || "", "Học sinh": s?.name || "", "Trạng thái": ATT_LABEL[a.status] || a.status, "Ghi chú": a.note || "" };
    });
  XLSX.utils.book_append_sheet(wb, sheetFrom(attRows), "Điểm danh");

  XLSX.writeFile(wb, `Foster-du-lieu-${todayTag()}.xlsx`);
}

/** Export báo cáo học phí của 1 tháng cụ thể */
export function exportMonthlyPaymentReport(rows, month, year) {
  const out = rows.map(({ s, cl, pay }) => ({
    "Học sinh": s.name, "Phụ huynh": s.parentName, "SĐT PH": s.parentPhone, "Lớp": cl.name,
    "Học phí": pay?.amount ?? cl.monthlyFee,
    "Trạng thái": !pay ? "Chưa tạo" : pay.status === "paid" ? "Đã thu" : "Chưa thu",
    "Ngày thu": pay?.paidDate ? fmtDateVN(pay.paidDate) : "",
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(out), `Thang ${month}-${year}`);
  XLSX.writeFile(wb, `Foster-hoc-phi-T${month}-${year}.xlsx`);
}

/** Export báo cáo tổng hợp (doanh thu, khối, lấp đầy) */
export function exportSummaryReport({ revenueData, gradeData, occData }) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb, sheetFrom(revenueData.map((r) => ({ "Tháng": r.month, "Doanh thu": r.revenue }))), "Doanh thu"
  );
  XLSX.utils.book_append_sheet(
    wb, sheetFrom(gradeData.map((g) => ({ "Khối": g.grade, "Số học sinh": g.count }))), "Học sinh theo khối"
  );
  XLSX.utils.book_append_sheet(
    wb, sheetFrom(occData.map((c) => ({ "Lớp": c.name, "Sĩ số hiện tại": c.enrolled, "Sĩ số tối đa": c.max, "Tỷ lệ lấp đầy (%)": Math.round((c.enrolled / c.max) * 100) }))),
    "Tỷ lệ lấp đầy"
  );
  XLSX.writeFile(wb, `Foster-bao-cao-${todayTag()}.xlsx`);
}
