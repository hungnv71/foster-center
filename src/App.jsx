import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Home, BookOpen, Users, User, DollarSign, BarChart2, Plus, Edit2, Trash2, Search, X, CheckCircle, GraduationCap, AlertCircle, RefreshCw, Download, Upload, FileSpreadsheet, Wifi, WifiOff, FileUp, ClipboardCheck } from "lucide-react";
import { supabase, fetchAll, insertRow, insertRows, updateRow, deleteRow, deleteAll, upsertRows, MAPPERS, signIn, signOut, getSession, getMyProfile } from "./lib/supabase.js";
import { LogOut, Lock, Wallet, History } from "lucide-react";
import { exportFullWorkbook, exportMonthlyPaymentReport, exportSummaryReport } from "./lib/excelExport.js";
import { parseStudentsExcel, parseTeachersExcel, downloadStudentTemplate, downloadTeacherTemplate } from "./lib/excelImport.js";
import leafIcon from "./assets/leaf-icon.png";

// ═══════════════════════════════ CONSTANTS & HELPERS ═══════════════════════════════
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const fmtMoney = (n) => (n || 0).toLocaleString("vi-VN") + "đ";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—");
const todayStr = () => new Date().toISOString().slice(0, 10);
const SUBJECTS = ["Toán", "Ngữ Văn", "Tiếng Anh", "Vật Lý", "Hóa Học", "Sinh Học", "Lịch Sử", "Địa Lý", "Tin Học"];
const GRADES = ["6", "7", "8", "9", "10", "11", "12"];
const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const C = { navy: "#1B3A6B", amber: "#F5A623", blue: "#3B82F6", green: "#10B981", red: "#EF4444", purple: "#8B5CF6", bg: "#EFF3F8", border: "#E2E8F0", text: "#1E293B", muted: "#64748B" };
const PIE_COLORS = [C.blue, C.green, C.purple, C.amber, C.red, "#06B6D4", "#EC4899", "#84CC16"];
const TABLE_ORDER = ["teachers", "classes", "students", "registrations", "payments", "attendance", "payroll", "activity_log"];
const DAY_CODE_BY_JSDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dayCodeOf = (dateStr) => { const [y, m, d] = dateStr.split("-").map(Number); return DAY_CODE_BY_JSDAY[new Date(y, m - 1, d).getDay()]; };
const ATT_STATUS = { present: { label: "Có mặt", color: "#10B981" }, absent: { label: "Vắng", color: "#EF4444" }, late: { label: "Muộn", color: "#F5A623" }, excused: { label: "Có phép", color: "#8B5CF6" } };
const ROOMS = ["P.102", "P.103", "P.104", "P.202", "P.203", "P.204", "P.205"];
const MAX_SESSIONS_PER_WEEK = 3;
// Đăng nhập đang TẠM TẮT — chưa có tài khoản Supabase Auth nào được tạo.
// Bật lại bằng cách đổi thành true SAU KHI đã tạo 2 tài khoản + khóa RLS (xem hướng dẫn trước đó).
const AUTH_ENABLED = false;

// Đếm số buổi học của 1 lớp rơi vào 1 tháng/năm cụ thể, dựa trên các thứ trong schedule
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
const timesOverlap = (s1, e1, s2, e2) => s1 < e2 && s2 < e1;

// Số buổi giáo viên ĐÃ THỰC SỰ dạy trong tháng — đếm theo bản ghi điểm danh thật (không phải lịch lý thuyết)
function sessionsTaughtByTeacher(teacherId, classes, attendance, month, year) {
  const myClassIds = new Set(classes.filter((c) => c.teacherId === teacherId).map((c) => c.id));
  const sessions = new Set();
  attendance.forEach((a) => {
    if (!myClassIds.has(a.classId)) return;
    const [y, m] = a.date.split("-").map(Number);
    if (y === year && m === month) sessions.add(`${a.classId}|${a.date}`);
  });
  return sessions.size;
}

// Tìm xung đột (trùng phòng hoặc trùng giáo viên) giữa 1 lớp (đang tạo/sửa) và các lớp khác đang hoạt động
function findScheduleConflicts(candidate, allClasses) {
  const conflicts = [];
  for (const other of allClasses) {
    if (other.id === candidate.id || other.status !== "active") continue;
    for (const mySlot of candidate.schedule) {
      for (const otherSlot of other.schedule) {
        if (mySlot.day !== otherSlot.day) continue;
        if (!timesOverlap(mySlot.startTime, mySlot.endTime, otherSlot.startTime, otherSlot.endTime)) continue;
        if (mySlot.room && mySlot.room === otherSlot.room) {
          conflicts.push(`Trùng PHÒNG ${mySlot.room} vào ${mySlot.day} (${mySlot.startTime}-${mySlot.endTime}) với lớp "${other.name}"`);
        }
        if (candidate.teacherId && candidate.teacherId === other.teacherId) {
          conflicts.push(`Trùng GIÁO VIÊN vào ${mySlot.day} (${mySlot.startTime}-${mySlot.endTime}) với lớp "${other.name}"`);
        }
      }
    }
  }
  return conflicts;
}
const scheduleSummary = (schedule) => (schedule || []).map((s) => `${s.day} ${s.startTime}-${s.endTime} (${s.room})`).join(" · ");

// ═══════════════════════════════ SAMPLE DATA (used only for "reset") ═══════════════════════════════
const SAMPLE_DATA = {
  teachers: [
    { id: "t1", name: "Nguyễn Thị Lan", phone: "0901234567", subject: "Toán", email: "lan@foster.vn", joinDate: "2023-09-01", feePerSession: 90000 },
    { id: "t2", name: "Trần Văn Nam", phone: "0902345678", subject: "Ngữ Văn", email: "nam@foster.vn", joinDate: "2023-09-01", feePerSession: 90000 },
    { id: "t3", name: "Lê Thị Hoa", phone: "0903456789", subject: "Tiếng Anh", email: "hoa@foster.vn", joinDate: "2024-01-10", feePerSession: 100000 },
    { id: "t4", name: "Phạm Quốc Tuấn", phone: "0904567890", subject: "Vật Lý", email: "tuan@foster.vn", joinDate: "2024-01-10", feePerSession: 90000 },
  ],
  classes: [
    { id: "c1", name: "Toán 10A", subject: "Toán", teacherId: "t1", schedule: [{ day: "T2", startTime: "17:30", endTime: "19:00", room: "P.102" }, { day: "T4", startTime: "17:30", endTime: "19:00", room: "P.102" }, { day: "T6", startTime: "17:30", endTime: "19:00", room: "P.102" }], maxStudents: 20, feePerSession: 125000, status: "active" },
    { id: "c2", name: "Toán 11B", subject: "Toán", teacherId: "t1", schedule: [{ day: "T3", startTime: "18:00", endTime: "19:30", room: "P.103" }, { day: "T5", startTime: "18:00", endTime: "19:30", room: "P.103" }], maxStudents: 18, feePerSession: 125000, status: "active" },
    { id: "c3", name: "Văn 10A", subject: "Ngữ Văn", teacherId: "t2", schedule: [{ day: "T2", startTime: "19:15", endTime: "20:45", room: "P.102" }, { day: "T5", startTime: "18:00", endTime: "19:30", room: "P.104" }], maxStudents: 20, feePerSession: 110000, status: "active" },
    { id: "c4", name: "Anh 9A", subject: "Tiếng Anh", teacherId: "t3", schedule: [{ day: "T7", startTime: "08:00", endTime: "10:00", room: "P.202" }, { day: "CN", startTime: "08:00", endTime: "10:00", room: "P.202" }], maxStudents: 15, feePerSession: 150000, status: "active" },
    { id: "c5", name: "Lý 11A", subject: "Vật Lý", teacherId: "t4", schedule: [{ day: "T4", startTime: "19:00", endTime: "20:30", room: "P.204" }, { day: "T7", startTime: "19:00", endTime: "20:30", room: "P.204" }], maxStudents: 20, feePerSession: 125000, status: "active" },
  ],
  students: [
    { id: "s1", name: "Lê Minh Khoa", phone: "0911111111", parentName: "Lê Văn Hùng", parentPhone: "0911111110", grade: "10", address: "12 Nguyễn Văn Cừ, Q5", joinDate: "2024-09-01" },
    { id: "s2", name: "Trần Thị Mỹ", phone: "0922222222", parentName: "Trần Văn An", parentPhone: "0922222220", grade: "11", address: "34 Lê Lợi, Q1", joinDate: "2024-09-01" },
    { id: "s3", name: "Nguyễn Quốc Anh", phone: "0933333333", parentName: "Nguyễn Thị Lan", parentPhone: "0933333330", grade: "9", address: "56 CMT8, Q3", joinDate: "2024-09-01" },
    { id: "s4", name: "Phạm Thu Hà", phone: "0944444444", parentName: "Phạm Văn Bình", parentPhone: "0944444440", grade: "11", address: "78 Đinh Tiên Hoàng, Q1", joinDate: "2025-01-01" },
    { id: "s5", name: "Hoàng Văn Đức", phone: "0955555555", parentName: "Hoàng Thị Mai", parentPhone: "0955555550", grade: "10", address: "90 Bùi Viện, Q1", joinDate: "2025-01-01" },
  ],
  registrations: [
    { id: "r1", studentId: "s1", classId: "c1", startDate: "2024-09-01", status: "active" },
    { id: "r2", studentId: "s1", classId: "c4", startDate: "2024-09-01", status: "active" },
    { id: "r3", studentId: "s2", classId: "c3", startDate: "2024-09-01", status: "active" },
    { id: "r4", studentId: "s2", classId: "c2", startDate: "2024-09-01", status: "active" },
    { id: "r5", studentId: "s3", classId: "c4", startDate: "2024-09-01", status: "active" },
    { id: "r6", studentId: "s4", classId: "c3", startDate: "2025-01-01", status: "active" },
    { id: "r7", studentId: "s4", classId: "c5", startDate: "2025-01-01", status: "active" },
    { id: "r8", studentId: "s5", classId: "c1", startDate: "2025-01-01", status: "active" },
  ],
  payments: [
    { id: "py1", studentId: "s1", classId: "c1", month: 5, year: 2026, amount: 500000, paidDate: "2026-05-02", status: "paid" },
    { id: "py2", studentId: "s1", classId: "c4", month: 5, year: 2026, amount: 600000, paidDate: "2026-05-02", status: "paid" },
    { id: "py3", studentId: "s2", classId: "c3", month: 5, year: 2026, amount: 450000, paidDate: "2026-05-05", status: "paid" },
    { id: "py4", studentId: "s2", classId: "c2", month: 5, year: 2026, amount: 500000, paidDate: "2026-05-05", status: "paid" },
    { id: "py5", studentId: "s3", classId: "c4", month: 5, year: 2026, amount: 600000, paidDate: "2026-05-10", status: "paid" },
    { id: "py6", studentId: "s4", classId: "c3", month: 5, year: 2026, amount: 450000, paidDate: "2026-05-08", status: "paid" },
    { id: "py7", studentId: "s4", classId: "c5", month: 5, year: 2026, amount: 500000, paidDate: "2026-05-08", status: "paid" },
    { id: "py8", studentId: "s5", classId: "c1", month: 5, year: 2026, amount: 500000, paidDate: "2026-05-12", status: "paid" },
    { id: "py9", studentId: "s1", classId: "c1", month: 6, year: 2026, amount: 500000, paidDate: "2026-06-01", status: "paid" },
    { id: "py10", studentId: "s1", classId: "c4", month: 6, year: 2026, amount: 600000, paidDate: null, status: "unpaid" },
    { id: "py11", studentId: "s2", classId: "c3", month: 6, year: 2026, amount: 450000, paidDate: null, status: "unpaid" },
    { id: "py12", studentId: "s2", classId: "c2", month: 6, year: 2026, amount: 500000, paidDate: "2026-06-05", status: "paid" },
    { id: "py13", studentId: "s3", classId: "c4", month: 6, year: 2026, amount: 600000, paidDate: null, status: "unpaid" },
    { id: "py14", studentId: "s4", classId: "c3", month: 6, year: 2026, amount: 450000, paidDate: null, status: "unpaid" },
    { id: "py15", studentId: "s4", classId: "c5", month: 6, year: 2026, amount: 500000, paidDate: null, status: "unpaid" },
    { id: "py16", studentId: "s5", classId: "c1", month: 6, year: 2026, amount: 500000, paidDate: null, status: "unpaid" },
  ],
  attendance: [],
  payroll: [],
  activity_log: [],
};

// ═══════════════════════════════ SHARED UI ═══════════════════════════════
const Inp = ({ label, ...p }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, color: C.text }}>{label}</label>}
    <input style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, outline: "none", fontSize: 14, color: C.text, boxSizing: "border-box", background: "#fff" }} {...p} />
  </div>
);
const Sel = ({ label, children, ...p }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, color: C.text }}>{label}</label>}
    <select style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, outline: "none", fontSize: 14, color: C.text, background: "#fff", boxSizing: "border-box" }} {...p}>{children}</select>
  </div>
);
const Btn = ({ color = C.blue, outlined, style: s, ...p }) => (
  <button style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: outlined ? `2px solid ${color}` : "none", background: outlined ? "transparent" : color, color: outlined ? color : "#fff", ...s }} {...p} />
);
const Modal = ({ open, onClose, title, children }) => !open ? null : (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
    <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>{title}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={20} color={C.muted} /></button>
      </div>
      {children}
    </div>
  </div>
);
const Badge = ({ color, children }) => (
  <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 700, background: color + "22", color }}>{children}</span>
);
const StatCard = ({ icon: Icon, label, value, color, sub }) => (
  <div style={{ background: "#fff", borderRadius: 14, padding: "18px 22px", boxShadow: "0 1px 4px rgba(0,0,0,.06)", display: "flex", alignItems: "center", gap: 14 }}>
    <div style={{ background: color + "1a", borderRadius: 12, padding: 12, display: "flex" }}><Icon size={22} color={color} /></div>
    <div>
      <div style={{ fontSize: 24, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color, marginTop: 2, fontWeight: 600 }}>{sub}</div>}
    </div>
  </div>
);
const Card = ({ title, children, action }) => (
  <div style={{ background: "#fff", borderRadius: 14, padding: 22, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 20 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>{title}</h2>
      {action}
    </div>
    {children}
  </div>
);
const Th = ({ children }) => <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: C.muted, fontSize: 12, borderBottom: `2px solid ${C.border}`, whiteSpace: "nowrap" }}>{children}</th>;
const Td = ({ children, style: s }) => <td style={{ padding: "11px 12px", ...s }}>{children}</td>;
const ActionBtn = ({ icon: Icon, color, onClick, title }) => (
  <button title={title} onClick={onClick} style={{ background: color + "18", border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", color, display: "inline-flex" }}><Icon size={14} /></button>
);

// ═══════════════════════════════ DASHBOARD ═══════════════════════════════
// ═══════════════════════════════ LOGIN SCREEN ═══════════════════════════════
function LoginScreen({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await signIn(email.trim(), password);
      onLoggedIn();
    } catch (err) {
      setError(err.message === "Invalid login credentials" ? "Sai email hoặc mật khẩu." : "Đăng nhập thất bại. Thử lại.");
    }
    setLoading(false);
  };

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "system-ui,-apple-system,sans-serif" }}>
      <form onSubmit={submit} style={{ background: "#fff", borderRadius: 18, padding: "36px 34px", width: 360, boxShadow: "0 8px 32px rgba(27,58,107,.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{ display: "inline-flex", background: C.bg, borderRadius: 14, padding: 12, marginBottom: 12 }}>
            <Lock size={26} color={C.navy} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>FOSTER</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>Đăng nhập để tiếp tục</div>
        </div>
        <Inp label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@foster.vn" autoFocus />
        <Inp label="Mật khẩu" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 12, marginTop: -4 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", marginTop: 6, padding: "11px 0", borderRadius: 10, border: "none", background: C.navy, color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}

// Phát hiện học sinh có nguy cơ nghỉ học: vắng liên tiếp ≥3 buổi ở 1 lớp, hoặc chuyên cần <70% trong 30 ngày qua
function computeDropoutRisk(data) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const byStudent = {};
  const flag = (studentId, reason) => {
    if (!byStudent[studentId]) byStudent[studentId] = { studentId, reasons: [] };
    byStudent[studentId].reasons.push(reason);
  };

  const activeRegs = data.registrations.filter((r) => r.status === "active");

  // 1) Vắng liên tiếp theo từng lớp
  activeRegs.forEach((r) => {
    const recs = data.attendance.filter((a) => a.studentId === r.studentId && a.classId === r.classId).sort((a, b) => (a.date < b.date ? 1 : -1));
    let streak = 0;
    for (const rec of recs) { if (rec.status === "absent") streak++; else break; }
    if (streak >= 3) {
      const cls = data.classes.find((c) => c.id === r.classId);
      flag(r.studentId, `Vắng liên tiếp ${streak} buổi tại lớp ${cls?.name || ""}`);
    }
  });

  // 2) Tỷ lệ chuyên cần thấp trong 30 ngày qua (tính chung mọi lớp)
  const byStudentRecent = {};
  data.attendance.filter((a) => a.date >= cutoffStr).forEach((a) => {
    if (!byStudentRecent[a.studentId]) byStudentRecent[a.studentId] = [];
    byStudentRecent[a.studentId].push(a);
  });
  Object.entries(byStudentRecent).forEach(([studentId, recs]) => {
    if (recs.length < 3) return; // đủ dữ liệu mới đánh giá, tránh báo nhầm
    const presentCount = recs.filter((a) => a.status === "present" || a.status === "late").length;
    const rate = presentCount / recs.length;
    if (rate < 0.7) flag(studentId, `Chuyên cần ${Math.round(rate * 100)}% trong 30 ngày qua`);
  });

  return Object.values(byStudent)
    .map((x) => ({ ...x, student: data.students.find((s) => s.id === x.studentId) }))
    .filter((x) => x.student);
}

function Dashboard({ data }) {
  const now = new Date();
  const [cm, cy] = [now.getMonth() + 1, now.getFullYear()];
  const todayStr_ = todayStr();
  const todayCode = dayCodeOf(todayStr_);
  const activeRegs = data.registrations.filter((r) => r.status === "active");
  const mPays = data.payments.filter((p) => p.month === cm && p.year === cy);
  const paidRev = mPays.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const unpaidPays = mPays.filter((p) => p.status === "unpaid");
  const activeClasses = data.classes.filter((c) => c.status === "active");
  const uniqueStudents = [...new Set(activeRegs.map((r) => r.studentId))];

  const todaySessions = activeClasses
    .flatMap((cls) => (cls.schedule || []).filter((s) => s.day === todayCode).map((slot) => ({ cls, slot })))
    .sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime));

  const revenueData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(cy, cm - 1 - i, 1);
    const [m, y] = [d.getMonth() + 1, d.getFullYear()];
    return { month: `T${m}`, revenue: data.payments.filter((p) => p.month === m && p.year === y && p.status === "paid").reduce((s, p) => s + p.amount, 0) };
  }).reverse();

  const unpaidGroup = unpaidPays.reduce((acc, p) => {
    const s = data.students.find((x) => x.id === p.studentId), cl = data.classes.find((x) => x.id === p.classId);
    if (s && cl) { if (!acc[s.id]) acc[s.id] = { name: s.name, amount: 0, classes: [] }; acc[s.id].amount += p.amount; acc[s.id].classes.push(cl.name); }
    return acc;
  }, {});

  const riskList = computeDropoutRisk(data);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 22 }}>
        <StatCard icon={BookOpen} label="Lớp đang hoạt động" value={activeClasses.length} color={C.blue} />
        <StatCard icon={Users} label="Học sinh đang học" value={uniqueStudents.length} color={C.green} />
        <StatCard icon={User} label="Giáo viên" value={data.teachers.length} color={C.purple} />
        <StatCard icon={DollarSign} label={`Đã thu T${cm}/${cy}`} value={fmtMoney(paidRev)} color={C.amber}
          sub={unpaidPays.length ? `⚠ Còn ${unpaidPays.length} khoản chưa thu` : "✓ Thu đầy đủ rồi!"} />
      </div>
      {riskList.length > 0 && (
        <Card title="🚨 Học sinh có nguy cơ nghỉ học">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {riskList.map((r) => (
              <div key={r.studentId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: C.red + "0d", borderRadius: 10, flexWrap: "wrap", gap: 6 }}>
                <div>
                  <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{r.student.name}</span>
                  <span style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>{r.student.parentPhone}</span>
                </div>
                <div style={{ fontSize: 12.5, color: C.red }}>{r.reasons.join(" · ")}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card title={`🗓 Thời khóa biểu hôm nay — ${todayCode}, ${new Date().toLocaleDateString("vi-VN")}`}>
        {todaySessions.length === 0
          ? <div style={{ textAlign: "center", padding: "20px 0", color: C.muted, fontSize: 13 }}>Hôm nay không có lớp nào theo lịch cố định.</div>
          : <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead><tr style={{ background: C.bg }}>{["Giờ học", "Lớp", "Môn", "Giáo viên", "Phòng", "Sĩ số"].map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
                <tbody>
                  {todaySessions.map(({ cls, slot }, i) => {
                    const t = data.teachers.find((x) => x.id === cls.teacherId);
                    const enrolled = data.registrations.filter((r) => r.classId === cls.id && r.status === "active").length;
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <Td style={{ fontWeight: 700, color: C.navy }}>{slot.startTime}–{slot.endTime}</Td>
                        <Td style={{ fontWeight: 700, color: C.text }}>{cls.name}</Td>
                        <Td><Badge color={C.blue}>{cls.subject}</Badge></Td>
                        <Td style={{ color: C.text }}>{t?.name || <span style={{ color: C.red }}>Chưa phân công</span>}</Td>
                        <Td><Badge color={C.purple}>{slot.room}</Badge></Td>
                        <Td style={{ color: C.muted }}>{enrolled}/{cls.maxStudents}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, marginBottom: 18, marginTop: 20 }}>
        <Card title="📈 Doanh thu 6 tháng gần nhất">
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={revenueData}><CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000000).toFixed(1) + "M"} />
              <Tooltip formatter={(v) => fmtMoney(v)} labelStyle={{ fontWeight: 700 }} />
              <Bar dataKey="revenue" fill={C.blue} radius={[6, 6, 0, 0]} name="Doanh thu" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title={`⚠ Chưa thu T${cm}/${cy}`}>
          {Object.values(unpaidGroup).length === 0
            ? <div style={{ textAlign: "center", padding: "28px 0", color: C.muted }}>
                <CheckCircle size={32} color={C.green} style={{ margin: "0 auto 8px", display: "block" }} />
                <div style={{ fontSize: 13 }}>Đã thu đủ học phí!</div>
              </div>
            : <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {Object.values(unpaidGroup).map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div><div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{it.name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{it.classes.join(", ")}</div></div>
                    <Badge color={C.red}>{fmtMoney(it.amount)}</Badge>
                  </div>
                ))}
              </div>}
        </Card>
      </div>
      <Card title="🏫 Tình trạng lớp học">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ background: C.bg }}>
              {["Tên lớp", "Môn", "Giáo viên", "Lịch học", "Sĩ số", "Trạng thái"].map((h) => <Th key={h}>{h}</Th>)}
            </tr></thead>
            <tbody>
              {activeClasses.map((cls) => {
                const t = data.teachers.find((x) => x.id === cls.teacherId);
                const enrolled = data.registrations.filter((r) => r.classId === cls.id && r.status === "active").length;
                const pct = Math.round((enrolled / cls.maxStudents) * 100);
                return (
                  <tr key={cls.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <Td style={{ fontWeight: 700, color: C.text }}>{cls.name}</Td>
                    <Td><Badge color={C.blue}>{cls.subject}</Badge></Td>
                    <Td style={{ color: C.text }}>{t?.name || <span style={{ color: C.red }}>Chưa phân công</span>}</Td>
                    <Td style={{ color: C.muted, fontSize: 12 }}>{scheduleSummary(cls.schedule)}</Td>
                    <Td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, background: C.bg, borderRadius: 4, height: 7, minWidth: 60 }}>
                          <div style={{ width: `${pct}%`, background: pct > 85 ? C.red : pct > 60 ? C.amber : C.green, height: 7, borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{enrolled}/{cls.maxStudents}</span>
                      </div>
                    </Td>
                    <Td><Badge color={C.green}>Đang học</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════ CLASSES VIEW ═══════════════════════════════
// ═══════════════════════════════ ROOM SCHEDULE GRID ═══════════════════════════════
const GRID_START_MIN = 7 * 60;   // 07:00
const GRID_END_MIN = 21.5 * 60;  // 21:30
const toMinutes = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

function RoomScheduleGrid({ data, onSelectClass }) {
  const [day, setDay] = useState(dayCodeOf(todayStr()));
  const totalMin = GRID_END_MIN - GRID_START_MIN;
  const hourMarks = Array.from({ length: 15 }, (_, i) => 7 + i); // 7..21

  const activeClasses = data.classes.filter((c) => c.status === "active");
  const slotsFor = (room) => activeClasses.flatMap((cls) => (cls.schedule || []).filter((s) => s.day === day && s.room === room).map((s) => ({ ...s, cls })));
  const bookedRoomsCount = ROOMS.filter((r) => slotsFor(r).length > 0).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DAYS.map((d) => (
            <button key={d} onClick={() => setDay(d)} style={{ padding: "6px 14px", borderRadius: 8, border: `2px solid ${day === d ? C.blue : C.border}`, background: day === d ? C.blue + "18" : "#fff", color: day === d ? C.blue : C.muted, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>{d}</button>
          ))}
        </div>
        <div style={{ fontSize: 13, color: C.muted }}>{bookedRoomsCount}/{ROOMS.length} phòng có lớp vào {day}</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 920 }}>
          <div style={{ display: "flex", marginLeft: 92, marginBottom: 4 }}>
            {hourMarks.map((h) => (
              <div key={h} style={{ flex: 1, fontSize: 11, color: C.muted }}>{h}:00</div>
            ))}
          </div>
          {ROOMS.map((room) => {
            const slots = slotsFor(room);
            return (
              <div key={room} style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                <div style={{ width: 92, flexShrink: 0, fontWeight: 700, fontSize: 13, color: C.navy }}>{room}</div>
                <div style={{ position: "relative", flex: 1, height: 46, background: C.bg, borderRadius: 8 }}>
                  {hourMarks.map((h, i) => (
                    <div key={h} style={{ position: "absolute", left: `${(i / hourMarks.length) * 100}%`, top: 0, bottom: 0, borderLeft: `1px solid ${C.border}` }} />
                  ))}
                  {slots.map((s, i) => {
                    const left = Math.max(0, ((toMinutes(s.startTime) - GRID_START_MIN) / totalMin) * 100);
                    const width = Math.min(100 - left, ((toMinutes(s.endTime) - toMinutes(s.startTime)) / totalMin) * 100);
                    const t = data.teachers.find((x) => x.id === s.cls.teacherId);
                    return (
                      <div key={i} title={`${s.cls.name} · ${s.startTime}–${s.endTime} · GV: ${t?.name || "chưa phân công"} · Bấm để mở lớp`}
                        onClick={() => onSelectClass?.(s.cls)}
                        style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 4, bottom: 4, background: C.blue, borderRadius: 6, color: "#fff", fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px", overflow: "hidden", whiteSpace: "nowrap", cursor: "pointer" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = C.navy)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = C.blue)}>
                        {s.cls.name}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 12, color: C.muted }}>💡 Bấm vào ô màu xanh để mở lớp đó. Khoảng trắng trên mỗi dòng là thời gian phòng còn trống.</div>
    </div>
  );
}

function ClassesView({ data, api, isAdmin }) {
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [viewStu, setViewStu] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // list | grid
  const blank = { name: "", subject: "Toán", teacherId: "", schedule: [], maxStudents: 20, feePerSession: 125000, status: "active" };
  const usedSubjects = [...new Set(data.classes.map((c) => c.subject))];
  const filtered = data.classes
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.subject.toLowerCase().includes(search.toLowerCase()))
    .filter((c) => !subjectFilter || c.subject === subjectFilter);

  const handleSave = async (cls) => {
    setModal(null);
    if (cls.id) await api.updateClass(cls); else await api.addClass(cls);
  };
  const handleDel = async (id) => { setConfirmDel(null); await api.deleteClass(id, data.classes.find((c) => c.id === id)?.name); };

  return (
    <div>
      <Card title={viewMode === "list" ? `Danh sách lớp học (${filtered.length})` : "🗓 Lịch phòng học"} action={
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: C.bg, borderRadius: 8, padding: 3 }}>
            <button onClick={() => setViewMode("list")} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: viewMode === "list" ? "#fff" : "transparent", boxShadow: viewMode === "list" ? "0 1px 3px rgba(0,0,0,.1)" : "none", color: viewMode === "list" ? C.navy : C.muted, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>📋 Danh sách</button>
            <button onClick={() => setViewMode("grid")} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: viewMode === "grid" ? "#fff" : "transparent", boxShadow: viewMode === "grid" ? "0 1px 3px rgba(0,0,0,.1)" : "none", color: viewMode === "grid" ? C.navy : C.muted, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>🗓 Lịch phòng</button>
          </div>
          {viewMode === "list" && <>
            <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
              <input placeholder="Tìm lớp..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "8px 12px 8px 32px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, width: 180, outline: "none" }} /></div>
            <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none" }}>
              <option value="">Tất cả môn</option>
              {usedSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </>}
          <Btn color={C.blue} onClick={() => setModal({ cls: { ...blank } })}><Plus size={15} />Thêm lớp</Btn>
        </div>
      }>
        {viewMode === "list" ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ background: C.bg }}>
                {["Tên lớp", "Môn", "Giáo viên", "Lịch học", "Học phí/buổi", "Sĩ số", ""].map((h, i) => <Th key={i}>{h}</Th>)}
              </tr></thead>
              <tbody>
                {filtered.map((cls) => {
                  const t = data.teachers.find((x) => x.id === cls.teacherId);
                  const enrolled = data.registrations.filter((r) => r.classId === cls.id && r.status === "active").length;
                  return (
                    <tr key={cls.id} style={{ borderBottom: `1px solid ${C.border}` }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <Td style={{ fontWeight: 700, color: C.text }}>{cls.name}</Td>
                      <Td><Badge color={C.blue}>{cls.subject}</Badge></Td>
                      <Td style={{ color: C.text }}>{t?.name || <span style={{ color: C.red, fontSize: 12 }}>Chưa có GV</span>}</Td>
                      <Td style={{ color: C.muted, fontSize: 12 }}>{scheduleSummary(cls.schedule)}</Td>
                      <Td style={{ color: C.amber, fontWeight: 700 }}>{fmtMoney(cls.feePerSession)}</Td>
                      <Td style={{ color: enrolled >= cls.maxStudents ? C.red : C.text, fontWeight: 600 }}>{enrolled}/{cls.maxStudents}</Td>
                      <Td><div style={{ display: "flex", gap: 5 }}>
                        <ActionBtn icon={Users} color={C.blue} onClick={() => setViewStu(cls.id)} title="Xem học sinh" />
                        <ActionBtn icon={Edit2} color={C.amber} onClick={() => setModal({ cls: { ...cls } })} title="Sửa" />
                        {isAdmin && <ActionBtn icon={Trash2} color={C.red} onClick={() => setConfirmDel(cls.id)} title="Xóa" />}
                      </div></Td>
                    </tr>
                  );
                })}
                {!filtered.length && <tr><td colSpan={7} style={{ padding: "32px", textAlign: "center", color: C.muted }}>Không tìm thấy lớp học</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <RoomScheduleGrid data={data} onSelectClass={(cls) => setModal({ cls: { ...cls } })} />
        )}
      </Card>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.cls.id ? "Chỉnh sửa lớp học" : "Thêm lớp học"}>
        {modal && <ClassForm cls={modal.cls} teachers={data.teachers} allClasses={data.classes} onSave={handleSave} onCancel={() => setModal(null)} />}
      </Modal>
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Xác nhận xóa lớp">
        <p style={{ color: C.text, marginBottom: 20 }}>Xóa lớp này sẽ xóa toàn bộ đăng ký và dữ liệu học phí liên quan. Tiếp tục?</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><Btn color={C.muted} outlined onClick={() => setConfirmDel(null)}>Hủy</Btn><Btn color={C.red} onClick={() => handleDel(confirmDel)}>Xóa</Btn></div>
      </Modal>
      <Modal open={!!viewStu} onClose={() => setViewStu(null)} title={`Học sinh: ${data.classes.find((c) => c.id === viewStu)?.name || ""}`}>
        {viewStu && <StudentsInClass cls={data.classes.find((c) => c.id === viewStu)} data={data} api={api} />}
      </Modal>
    </div>
  );
}

function ClassForm({ cls, teachers, allClasses, onSave, onCancel }) {
  const [f, setF] = useState(cls);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const scheduleDays = f.schedule.map((s) => s.day);
  const toggleDay = (d) => {
    if (scheduleDays.includes(d)) {
      set("schedule", f.schedule.filter((s) => s.day !== d));
    } else {
      if (f.schedule.length >= MAX_SESSIONS_PER_WEEK) return alert(`Tối đa ${MAX_SESSIONS_PER_WEEK} buổi/tuần cho 1 lớp học.`);
      set("schedule", [...f.schedule, { day: d, startTime: "17:30", endTime: "19:00", room: ROOMS[0] }].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day)));
    }
  };
  const updateSlot = (day, key, value) => set("schedule", f.schedule.map((s) => (s.day === day ? { ...s, [key]: value } : s)));

  // room options for a given day/time slot, flagging ones already booked elsewhere at an overlapping time
  const roomConflictFor = (day, startTime, endTime, room) => {
    if (!startTime || !endTime) return false;
    return allClasses.some((other) => other.id !== f.id && other.status === "active" &&
      other.schedule.some((s) => s.day === day && s.room === room && timesOverlap(startTime, endTime, s.startTime, s.endTime)));
  };

  const save = () => {
    if (!f.name.trim()) return alert("Nhập tên lớp!");
    if (!f.schedule.length) return alert("Chọn ít nhất 1 buổi học trong tuần!");
    const conflicts = findScheduleConflicts(f, allClasses);
    if (conflicts.length) {
      alert(`❌ Không thể lưu — trùng lịch:\n\n${conflicts.join("\n")}\n\nMột phòng không thể có 2 lớp học cùng lúc, và 1 giáo viên không thể dạy 2 lớp cùng lúc. Hãy đổi giờ/phòng/giáo viên rồi thử lại.`);
      return;
    }
    onSave(f);
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1/-1" }}><Inp label="Tên lớp *" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="VD: Toán 10A" /></div>
        <Sel label="Môn học" value={f.subject} onChange={(e) => set("subject", e.target.value)}>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</Sel>
        <Sel label="Giáo viên" value={f.teacherId} onChange={(e) => set("teacherId", e.target.value)}>
          <option value="">-- Chọn GV --</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Sel>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: C.text }}>Lịch học (tối đa {MAX_SESSIONS_PER_WEEK} buổi/tuần) — {f.schedule.length}/{MAX_SESSIONS_PER_WEEK}</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>{DAYS.map((d) => (
          <button key={d} onClick={() => toggleDay(d)} style={{ padding: "6px 14px", borderRadius: 8, border: `2px solid ${scheduleDays.includes(d) ? C.blue : C.border}`, background: scheduleDays.includes(d) ? C.blue + "18" : "#fff", color: scheduleDays.includes(d) ? C.blue : C.muted, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>{d}</button>
        ))}</div>
        {f.schedule.map((slot) => {
          const conflict = roomConflictFor(slot.day, slot.startTime, slot.endTime, slot.room);
          return (
            <div key={slot.day} style={{ display: "grid", gridTemplateColumns: "44px 1fr 1fr 1fr", gap: 8, alignItems: "center", padding: "8px 10px", background: C.bg, borderRadius: 8, marginBottom: 6 }}>
              <div style={{ fontWeight: 700, color: C.navy, fontSize: 13 }}>{slot.day}</div>
              <input type="time" value={slot.startTime} onChange={(e) => updateSlot(slot.day, "startTime", e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13 }} />
              <input type="time" value={slot.endTime} onChange={(e) => updateSlot(slot.day, "endTime", e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13 }} />
              <select value={slot.room} onChange={(e) => updateSlot(slot.day, "room", e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${conflict ? C.red : C.border}`, fontSize: 13, color: conflict ? C.red : C.text }}>
                {ROOMS.map((r) => {
                  const busy = roomConflictFor(slot.day, slot.startTime, slot.endTime, r);
                  return <option key={r} value={r} disabled={busy && r !== slot.room}>{r}{busy ? " ⚠ trùng — không chọn được" : ""}</option>;
                })}
              </select>
            </div>
          );
        })}
        {!f.schedule.length && <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>Chưa chọn thứ nào — bấm vào các nút thứ ở trên</div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Inp label="Sĩ số tối đa" type="number" value={f.maxStudents} onChange={(e) => set("maxStudents", +e.target.value)} />
        <Inp label="Học phí / buổi (đ)" type="number" value={f.feePerSession} onChange={(e) => set("feePerSession", +e.target.value)} />
        <Sel label="Trạng thái" value={f.status} onChange={(e) => set("status", e.target.value)}>
          <option value="active">Đang hoạt động</option><option value="inactive">Tạm dừng</option>
        </Sel>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Btn color={C.muted} outlined onClick={onCancel}>Hủy</Btn>
        <Btn color={C.blue} onClick={save}>💾 Lưu</Btn>
      </div>
    </div>
  );
}
function StudentsInClass({ cls, data, api }) {
  const regs = data.registrations.filter((r) => r.classId === cls.id && r.status === "active");
  const [show, setShow] = useState(false);
  const [sel, setSel] = useState("");
  const enrolled = new Set(regs.map((r) => r.studentId));
  const avail = data.students.filter((s) => !enrolled.has(s.id));
  const add = async () => { if (!sel) return; if (regs.length >= cls.maxStudents) return alert("Lớp đã đầy!"); await api.addRegistration({ id: genId(), studentId: sel, classId: cls.id, startDate: todayStr(), status: "active" }); setSel(""); setShow(false); };
  const remove = (id) => api.deleteRegistration(id);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ color: C.muted, fontSize: 14 }}>Sĩ số: <b style={{ color: C.text }}>{regs.length}/{cls.maxStudents}</b></span>
        {regs.length < cls.maxStudents && <Btn color={C.blue} onClick={() => setShow(!show)}><Plus size={14} />Thêm</Btn>}
      </div>
      {show && <div style={{ display: "flex", gap: 8, marginBottom: 12, padding: 12, background: C.bg, borderRadius: 10 }}>
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none" }}>
          <option value="">-- Chọn học sinh --</option>{avail.map((s) => <option key={s.id} value={s.id}>{s.name} (Lớp {s.grade})</option>)}
        </select>
        <Btn color={C.blue} onClick={add}>Thêm</Btn><Btn color={C.muted} outlined onClick={() => setShow(false)}>Hủy</Btn>
      </div>}
      {regs.map((r) => { const s = data.students.find((x) => x.id === r.studentId); return s ? (
        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
          <div><div style={{ fontWeight: 600, color: C.text }}>{s.name}</div><div style={{ fontSize: 12, color: C.muted }}>Lớp {s.grade} · {s.phone} · Từ {fmtDate(r.startDate)}</div></div>
          <ActionBtn icon={Trash2} color={C.red} onClick={() => remove(r.id)} title="Xóa" />
        </div>
      ) : null; })}
      {!regs.length && <div style={{ textAlign: "center", padding: "20px", color: C.muted, fontSize: 13 }}>Chưa có học sinh</div>}
    </div>
  );
}

// ═══════════════════════════════ STUDENTS VIEW ═══════════════════════════════
// ═══════════════════════════════ SHARED: EXCEL IMPORT PREVIEW ═══════════════════════════════
function pickExcelFile(onFile) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".xlsx,.xls";
  input.onchange = (e) => { const f = e.target.files[0]; if (f) onFile(f); };
  input.click();
}
function ImportPreview({ items, errors, warnings, itemNoun, color, onCancel, onConfirm, busy, showClasses }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: 12, background: color + "12", borderRadius: 10 }}>
        <CheckCircle size={20} color={color} />
        <div style={{ fontSize: 14, color: C.text }}>Tìm thấy <b>{items.length}</b> {itemNoun} hợp lệ, sẵn sàng nhập.</div>
      </div>
      {errors.length > 0 && (
        <div style={{ marginBottom: 16, padding: 12, background: C.red + "12", borderRadius: 10, maxHeight: 120, overflowY: "auto" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 6 }}>⚠ {errors.length} dòng bị bỏ qua:</div>
          {errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: C.red }}>{e}</div>)}
        </div>
      )}
      {warnings && warnings.length > 0 && (
        <div style={{ marginBottom: 16, padding: 12, background: C.amber + "15", borderRadius: 10, maxHeight: 120, overflowY: "auto" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.amber, marginBottom: 6 }}>⚠ {warnings.length} tên lớp không khớp (học sinh vẫn được nhập, chỉ không tự xếp lớp):</div>
          {warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: "#92650b" }}>{w}</div>)}
        </div>
      )}
      {items.length > 0 && (
        <div style={{ marginBottom: 16, maxHeight: 220, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
          {items.map((it, i) => (
            <div key={i} style={{ padding: "8px 12px", borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : "none", fontSize: 13, color: C.text }}>
              {it.name}
              {showClasses && it.classNames?.length > 0 && <span style={{ color: C.blue, fontSize: 12, marginLeft: 8 }}>→ {it.classNames.join(", ")}</span>}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn color={C.muted} outlined onClick={onCancel}>Hủy</Btn>
        <Btn color={color} onClick={onConfirm} style={{ opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : "auto" }}>{busy ? "Đang nhập..." : `Nhập ${items.length} ${itemNoun}`}</Btn>
      </div>
    </div>
  );
}

function StudentsView({ data, api, isAdmin }) {
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [viewCls, setViewCls] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const blank = { name: "", phone: "", parentName: "", parentPhone: "", grade: "10", address: "", joinDate: todayStr() };
  const filtered = data.students
    .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search) || s.grade.includes(search))
    .filter((s) => !gradeFilter || s.grade === gradeFilter);
  const countCls = (id) => data.registrations.filter((r) => r.studentId === id && r.status === "active").length;
  const handleSave = async (s) => { setModal(null); if (s.id) await api.updateStudent(s); else await api.addStudent(s); };
  const handleDel = async (id) => { setConfirmDel(null); await api.deleteStudent(id, data.students.find((s) => s.id === id)?.name); };
  const startImport = () => pickExcelFile(async (file) => {
    try {
      const parsed = await parseStudentsExcel(file);
      const warnings = [];
      parsed.students.forEach((s) => {
        s.classNames.forEach((cn) => {
          const found = data.classes.some((c) => c.name.trim().toLowerCase() === cn.trim().toLowerCase());
          if (!found) warnings.push(`${s.name}: không tìm thấy lớp "${cn}"`);
        });
      });
      setImportPreview({ ...parsed, warnings });
    } catch { alert("❌ Không đọc được file. Hãy chắc chắn đây là file .xlsx đúng định dạng."); }
  });
  const confirmImport = async () => {
    setImporting(true);
    const studentsWithIds = importPreview.students.map((s) => ({ ...s, id: genId() }));
    const regs = [];
    studentsWithIds.forEach((s) => {
      (s.classNames || []).forEach((cn) => {
        const cls = data.classes.find((c) => c.name.trim().toLowerCase() === cn.trim().toLowerCase());
        if (cls) regs.push({ id: genId(), studentId: s.id, classId: cls.id, startDate: todayStr(), status: "active" });
      });
    });
    await api.addStudents(studentsWithIds);
    if (regs.length) await api.addRegistrations(regs);
    setImporting(false); setImportPreview(null);
  };
  return (
    <div>
      <Card title={`Danh sách học sinh (${filtered.length})`} action={
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
            <input placeholder="Tìm học sinh..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "8px 12px 8px 32px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, width: 220, outline: "none" }} /></div>
          <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none" }}>
            <option value="">Tất cả khối</option>
            {GRADES.map((g) => <option key={g} value={g}>Lớp {g}</option>)}
          </select>
          <Btn color={C.green} onClick={() => setModal({ student: { ...blank } })}><Plus size={15} />Thêm học sinh</Btn>
          <Btn color={C.blue} outlined onClick={startImport}><FileUp size={15} />Nhập Excel</Btn>
        </div>
      }>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ background: C.bg }}>{["Họ tên", "Khối", "SĐT", "Phụ huynh", "SĐT PH", "Lớp đăng ký", ""].map((h, i) => <Th key={i}>{h}</Th>)}</tr></thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <Td style={{ fontWeight: 700, color: C.text }}>{s.name}</Td>
                  <Td><Badge color={C.purple}>Lớp {s.grade}</Badge></Td>
                  <Td style={{ color: C.text }}>{s.phone || "—"}</Td>
                  <Td style={{ color: C.text }}>{s.parentName}</Td>
                  <Td style={{ color: C.text }}>{s.parentPhone}</Td>
                  <Td>
                    <button onClick={() => setViewCls(s.id)} style={{ background: C.blue + "18", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", color: C.blue, fontWeight: 700, fontSize: 13 }}>
                      {countCls(s.id)} lớp
                    </button>
                  </Td>
                  <Td><div style={{ display: "flex", gap: 5 }}>
                    <ActionBtn icon={Edit2} color={C.amber} onClick={() => setModal({ student: { ...s } })} title="Sửa" />
                    {isAdmin && <ActionBtn icon={Trash2} color={C.red} onClick={() => setConfirmDel(s.id)} title="Xóa" />}
                  </div></Td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} style={{ padding: "32px", textAlign: "center", color: C.muted }}>Không tìm thấy học sinh</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.student.id ? "Chỉnh sửa học sinh" : "Thêm học sinh"}>
        {modal && <StudentForm student={modal.student} onSave={handleSave} onCancel={() => setModal(null)} />}
      </Modal>
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Xác nhận xóa học sinh">
        <p style={{ color: C.text, marginBottom: 20 }}>Xóa học sinh sẽ xóa toàn bộ đăng ký lớp và lịch sử học phí. Tiếp tục?</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><Btn color={C.muted} outlined onClick={() => setConfirmDel(null)}>Hủy</Btn><Btn color={C.red} onClick={() => handleDel(confirmDel)}>Xóa</Btn></div>
      </Modal>
      <Modal open={!!viewCls} onClose={() => setViewCls(null)} title={`Lớp của: ${data.students.find((s) => s.id === viewCls)?.name || ""}`}>
        {viewCls && <ClassesOfStudent studentId={viewCls} data={data} api={api} />}
      </Modal>
      <Modal open={!!importPreview} onClose={() => setImportPreview(null)} title="Nhập danh sách học sinh từ Excel">
        {importPreview && <ImportPreview items={importPreview.students} errors={importPreview.errors} warnings={importPreview.warnings} showClasses itemNoun="học sinh" color={C.green} busy={importing} onCancel={() => setImportPreview(null)} onConfirm={confirmImport} />}
      </Modal>
      <div style={{ textAlign: "right", marginTop: -12, marginBottom: 8 }}>
        <button onClick={downloadStudentTemplate} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Tải file mẫu Excel học sinh</button>
      </div>
    </div>
  );
}
function StudentForm({ student, onSave, onCancel }) {
  const [f, setF] = useState(student);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1/-1" }}><Inp label="Họ tên học sinh *" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Nhập tên học sinh" /></div>
        <Sel label="Đang học khối" value={f.grade} onChange={(e) => set("grade", e.target.value)}>{GRADES.map((g) => <option key={g} value={g}>Lớp {g}</option>)}</Sel>
        <Inp label="SĐT học sinh" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="09xxxxxxxx" />
        <Inp label="Họ tên phụ huynh *" value={f.parentName} onChange={(e) => set("parentName", e.target.value)} placeholder="Tên phụ huynh" />
        <Inp label="SĐT phụ huynh *" value={f.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} placeholder="09xxxxxxxx" />
        <div style={{ gridColumn: "1/-1" }}><Inp label="Địa chỉ" value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Số nhà, đường, quận" /></div>
        <Inp label="Ngày nhập học" type="date" value={f.joinDate} onChange={(e) => set("joinDate", e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Btn color={C.muted} outlined onClick={onCancel}>Hủy</Btn>
        <Btn color={C.green} onClick={() => { if (!f.name.trim()) return alert("Nhập tên học sinh!"); onSave(f); }}>💾 Lưu</Btn>
      </div>
    </div>
  );
}
function ClassesOfStudent({ studentId, data, api }) {
  const regs = data.registrations.filter((r) => r.studentId === studentId && r.status === "active");
  const [show, setShow] = useState(false);
  const [sel, setSel] = useState("");
  const enrolled = new Set(regs.map((r) => r.classId));
  const avail = data.classes.filter((c) => !enrolled.has(c.id) && c.status === "active");
  const add = async () => {
    if (!sel) return;
    const cl = data.classes.find((c) => c.id === sel);
    const cnt = data.registrations.filter((r) => r.classId === sel && r.status === "active").length;
    if (cl && cnt >= cl.maxStudents) return alert("Lớp đã đầy!");
    await api.addRegistration({ id: genId(), studentId, classId: sel, startDate: todayStr(), status: "active" });
    setSel(""); setShow(false);
  };
  const remove = (id) => api.deleteRegistration(id);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ color: C.muted, fontSize: 14 }}>Đang học <b style={{ color: C.text }}>{regs.length}</b> lớp</span>
        <Btn color={C.blue} onClick={() => setShow(!show)}><Plus size={14} />Đăng ký thêm</Btn>
      </div>
      {show && <div style={{ display: "flex", gap: 8, marginBottom: 12, padding: 12, background: C.bg, borderRadius: 10 }}>
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none" }}>
          <option value="">-- Chọn lớp --</option>{avail.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.subject} · {scheduleSummary(c.schedule)}</option>)}
        </select>
        <Btn color={C.blue} onClick={add}>Đăng ký</Btn><Btn color={C.muted} outlined onClick={() => setShow(false)}>Hủy</Btn>
      </div>}
      {regs.map((r) => { const cl = data.classes.find((c) => c.id === r.classId); return cl ? (
        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${C.border}` }}>
          <div><div style={{ fontWeight: 700, color: C.text }}>{cl.name}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{cl.subject} · {scheduleSummary(cl.schedule)} · {fmtMoney(cl.feePerSession)}/buổi</div></div>
          <ActionBtn icon={Trash2} color={C.red} onClick={() => remove(r.id)} title="Hủy đăng ký" />
        </div>
      ) : null; })}
      {!regs.length && <div style={{ textAlign: "center", padding: "20px", color: C.muted, fontSize: 13 }}>Chưa đăng ký lớp nào</div>}
    </div>
  );
}

// ═══════════════════════════════ TEACHERS VIEW ═══════════════════════════════
function TeachersView({ data, api, isAdmin }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const blank = { name: "", phone: "", subject: "Toán", email: "", joinDate: todayStr(), feePerSession: 90000 };
  const filtered = data.teachers.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase()));
  const getClasses = (id) => data.classes.filter((c) => c.teacherId === id && c.status === "active");
  const handleSave = async (t) => { setModal(null); if (t.id) await api.updateTeacher(t); else await api.addTeacher(t); };
  const handleDel = async (id) => {
    if (data.classes.some((c) => c.teacherId === id)) return alert("Giáo viên đang phụ trách lớp học.\nVui lòng chuyển lớp trước khi xóa.");
    setConfirmDel(null); await api.deleteTeacher(id, data.teachers.find((t) => t.id === id)?.name);
  };
  const startImport = () => pickExcelFile(async (file) => {
    try { setImportPreview(await parseTeachersExcel(file)); }
    catch { alert("❌ Không đọc được file. Hãy chắc chắn đây là file .xlsx đúng định dạng."); }
  });
  const confirmImport = async () => {
    setImporting(true);
    await api.addTeachers(importPreview.teachers);
    setImporting(false); setImportPreview(null);
  };
  return (
    <div>
      <Card title={`Đội ngũ giáo viên (${filtered.length})`} action={
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
            <input placeholder="Tìm giáo viên..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "8px 12px 8px 32px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, width: 200, outline: "none" }} /></div>
          <Btn color={C.purple} onClick={() => setModal({ teacher: { ...blank } })}><Plus size={15} />Thêm GV</Btn>
          <Btn color={C.blue} outlined onClick={startImport}><FileUp size={15} />Nhập Excel</Btn>
        </div>
      }>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
          {filtered.map((t) => {
            const cls = getClasses(t.id);
            return (
              <div key={t.id} style={{ background: C.bg, borderRadius: 12, padding: 18, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{t.name}</div>
                    <div style={{ marginTop: 4 }}><Badge color={C.purple}>{t.subject}</Badge></div>
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <ActionBtn icon={Edit2} color={C.amber} onClick={() => setModal({ teacher: { ...t } })} title="Sửa" />
                    {isAdmin && <ActionBtn icon={Trash2} color={C.red} onClick={() => setConfirmDel(t.id)} title="Xóa" />}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
                  <div>📞 {t.phone}</div>{t.email && <div>✉️ {t.email}</div>}<div>📅 Từ {fmtDate(t.joinDate)}</div><div>💵 {fmtMoney(t.feePerSession)}/buổi</div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Lớp phụ trách ({cls.length}):</div>
                  {cls.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{cls.map((c) => <Badge key={c.id} color={C.blue}>{c.name}</Badge>)}</div>
                    : <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>Chưa phân công lớp</div>}
                </div>
              </div>
            );
          })}
          {!filtered.length && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "32px", color: C.muted }}>Không tìm thấy giáo viên</div>}
        </div>
      </Card>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.teacher.id ? "Chỉnh sửa giáo viên" : "Thêm giáo viên"}>
        {modal && <TeacherForm teacher={modal.teacher} onSave={handleSave} onCancel={() => setModal(null)} />}
      </Modal>
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Xác nhận xóa">
        <p style={{ color: C.text, marginBottom: 20 }}>Bạn có chắc muốn xóa giáo viên này không?</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><Btn color={C.muted} outlined onClick={() => setConfirmDel(null)}>Hủy</Btn><Btn color={C.red} onClick={() => handleDel(confirmDel)}>Xóa</Btn></div>
      </Modal>
      <Modal open={!!importPreview} onClose={() => setImportPreview(null)} title="Nhập danh sách giáo viên từ Excel">
        {importPreview && <ImportPreview items={importPreview.teachers} errors={importPreview.errors} itemNoun="giáo viên" color={C.purple} busy={importing} onCancel={() => setImportPreview(null)} onConfirm={confirmImport} />}
      </Modal>
      <div style={{ textAlign: "right", marginTop: -12, marginBottom: 8 }}>
        <button onClick={downloadTeacherTemplate} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Tải file mẫu Excel giáo viên</button>
      </div>
    </div>
  );
}
function TeacherForm({ teacher, onSave, onCancel }) {
  const [f, setF] = useState(teacher);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <Inp label="Họ tên *" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Nhập tên giáo viên" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Sel label="Môn dạy" value={f.subject} onChange={(e) => set("subject", e.target.value)}>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</Sel>
        <Inp label="SĐT *" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="09xxxxxxxx" />
        <Inp label="Email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="email@foster.vn" />
        <Inp label="Ngày bắt đầu" type="date" value={f.joinDate} onChange={(e) => set("joinDate", e.target.value)} />
        <Inp label="Lương / buổi dạy (đ)" type="number" value={f.feePerSession} onChange={(e) => set("feePerSession", +e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Btn color={C.muted} outlined onClick={onCancel}>Hủy</Btn>
        <Btn color={C.purple} onClick={() => { if (!f.name.trim()) return alert("Nhập tên GV!"); onSave(f); }}>💾 Lưu</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════ PAYMENTS VIEW ═══════════════════════════════
// ═══════════════════════════════ ATTENDANCE VIEW ═══════════════════════════════
function AttendanceView({ data, api }) {
  const [date, setDate] = useState(todayStr());
  const [classId, setClassId] = useState("");
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [statusMap, setStatusMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [viewFilter, setViewFilter] = useState("all"); // all | present | absent | late | excused

  const dayCode = dayCodeOf(date);
  const activeClasses = data.classes.filter((c) => c.status === "active");
  const relevantClasses = showAllClasses ? activeClasses : activeClasses.filter((c) => (c.schedule || []).some((s) => s.day === dayCode));
  const classList = relevantClasses.length ? relevantClasses : activeClasses; // fallback if nothing scheduled that day

  useEffect(() => {
    if (!classList.some((c) => c.id === classId)) setClassId(classList[0]?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, showAllClasses, data.classes.length]);

  const cls = data.classes.find((c) => c.id === classId);
  const roster = cls
    ? data.registrations.filter((r) => r.classId === cls.id && r.status === "active")
        .map((r) => data.students.find((s) => s.id === r.studentId)).filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name, "vi"))
    : [];

  const existing = {};
  data.attendance.filter((a) => a.classId === classId && a.date === date).forEach((a) => { existing[a.studentId] = a; });

  useEffect(() => {
    const m = {};
    roster.forEach((s) => { const ex = existing[s.id]; m[s.id] = { status: ex?.status || "present", note: ex?.note || "" }; });
    setStatusMap(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date, data.attendance.length]);

  const setStatus = (sid, status) => setStatusMap((m) => ({ ...m, [sid]: { ...m[sid], status } }));
  const setNote = (sid, note) => setStatusMap((m) => ({ ...m, [sid]: { ...m[sid], note } }));
  const markAll = (status) => setStatusMap((m) => { const n = { ...m }; roster.forEach((s) => { n[s.id] = { ...n[s.id], status }; }); return n; });

  const save = async () => {
    if (!roster.length) return;
    setSaving(true);
    const rows = roster.map((s) => ({
      id: existing[s.id]?.id || genId(), classId, studentId: s.id, date,
      status: statusMap[s.id]?.status || "present", note: statusMap[s.id]?.note || "",
    }));
    await api.saveAttendance(rows);
    setSaving(false);
  };

  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  roster.forEach((s) => { const st = statusMap[s.id]?.status || "present"; counts[st] = (counts[st] || 0) + 1; });
  const alreadySaved = roster.length > 0 && roster.every((s) => existing[s.id]);
  const visibleRoster = roster.filter((s) => viewFilter === "all" || (statusMap[s.id]?.status || "present") === viewFilter);

  return (
    <div>
      <Card title="📋 Điểm danh theo buổi học" action={
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none" }} />
          <select value={classId} onChange={(e) => setClassId(e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none", minWidth: 200 }}>
            {classList.length === 0 && <option value="">Chưa có lớp</option>}
            {classList.map((c) => <option key={c.id} value={c.id}>{c.name} ({scheduleSummary(c.schedule)})</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: C.muted, cursor: "pointer" }}>
            <input type="checkbox" checked={showAllClasses} onChange={(e) => setShowAllClasses(e.target.checked)} />
            Hiện tất cả lớp
          </label>
        </div>
      }>
        {!relevantClasses.length && !showAllClasses && (
          <div style={{ marginBottom: 14, padding: 10, background: C.amber + "15", borderRadius: 8, fontSize: 13, color: "#92650b" }}>
            Không có lớp nào lịch học rơi vào thứ này ({dayCode}). Đang hiện tất cả lớp — tick "Hiện tất cả lớp" nếu đây là buổi học bù.
          </div>
        )}
        {cls && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              {Object.entries(ATT_STATUS).map(([key, v]) => (
                <button key={key} onClick={() => setViewFilter(viewFilter === key ? "all" : key)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: v.color + "15", border: viewFilter === key ? `1.5px solid ${v.color}` : "1.5px solid transparent", cursor: "pointer" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: v.color }} />
                  <span style={{ fontSize: 13, color: C.text }}>{v.label}: <b>{counts[key] || 0}</b></span>
                </button>
              ))}
              {viewFilter !== "all" && <Btn color={C.muted} outlined style={{ padding: "5px 12px", fontSize: 12.5 }} onClick={() => setViewFilter("all")}>✕ Bỏ lọc</Btn>}
              {alreadySaved && <Badge color={C.blue}>Đã lưu điểm danh buổi này</Badge>}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <Btn color={C.green} outlined style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => markAll("present")}>Đánh dấu tất cả Có mặt</Btn>
            </div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              {visibleRoster.map((s, i) => {
                const st = statusMap[s.id]?.status || "present";
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: i < visibleRoster.length - 1 ? `1px solid ${C.border}` : "none", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 160, fontWeight: 700, color: C.text, fontSize: 14 }}>{s.name}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {Object.entries(ATT_STATUS).map(([key, v]) => (
                        <button key={key} onClick={() => setStatus(s.id, key)}
                          style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${st === key ? v.color : C.border}`, background: st === key ? v.color + "18" : "#fff", color: st === key ? v.color : C.muted }}>
                          {v.label}
                        </button>
                      ))}
                    </div>
                    <input placeholder="Ghi chú (tùy chọn)" value={statusMap[s.id]?.note || ""} onChange={(e) => setNote(s.id, e.target.value)}
                      style={{ flex: 1, minWidth: 140, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12.5, outline: "none" }} />
                  </div>
                );
              })}
              {!roster.length && <div style={{ padding: "32px", textAlign: "center", color: C.muted }}>Lớp này chưa có học sinh đăng ký</div>}
              {roster.length > 0 && !visibleRoster.length && <div style={{ padding: "32px", textAlign: "center", color: C.muted }}>Không có học sinh nào khớp bộ lọc</div>}
            </div>
            {roster.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <Btn color={C.blue} onClick={save} style={{ opacity: saving ? 0.6 : 1 }}>{saving ? "Đang lưu..." : "💾 Lưu điểm danh"}</Btn>
              </div>
            )}
          </>
        )}
        {!cls && <div style={{ padding: "32px", textAlign: "center", color: C.muted }}>Chưa có lớp học nào — vào tab Lớp học để tạo trước</div>}
      </Card>
    </div>
  );
}

function PaymentsView({ data, api }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // "" | paid | unpaid
  const [viewMode, setViewMode] = useState("monthly"); // monthly | debt
  const activeRegs = data.registrations.filter((r) => r.status === "active");
  const mPays = data.payments.filter((p) => p.month === month && p.year === year);
  const amountFor = (cl) => cl.feePerSession * sessionsInMonth(cl.schedule, month, year);

  const rows = activeRegs.map((r) => {
    const s = data.students.find((x) => x.id === r.studentId);
    const cl = data.classes.find((x) => x.id === r.classId);
    if (!s || !cl) return null;
    const pay = mPays.find((p) => p.studentId === r.studentId && p.classId === r.classId);
    return { r, s, cl, pay };
  }).filter(Boolean)
    .filter((row) => row.s.name.toLowerCase().includes(search.toLowerCase()) || row.cl.name.toLowerCase().includes(search.toLowerCase()))
    .filter((row) => !statusFilter || (statusFilter === "paid" ? row.pay?.status === "paid" : row.pay?.status !== "paid"));

  const totalExpected = rows.reduce((sum, r) => sum + (r.pay?.amount ?? amountFor(r.cl)), 0);
  const totalPaid = rows.filter((r) => r.pay?.status === "paid").reduce((sum, r) => sum + r.pay.amount, 0);
  const totalUnpaid = rows.filter((r) => !r.pay || r.pay.status === "unpaid").reduce((sum, r) => sum + (r.pay?.amount ?? amountFor(r.cl)), 0);
  const unpaidCount = rows.filter((r) => !r.pay || r.pay.status === "unpaid").length;

  // ── Công nợ tổng hợp: cộng dồn TẤT CẢ các khoản chưa thu, mọi tháng/năm ──
  const debtByStudent = {};
  data.payments.filter((p) => p.status === "unpaid").forEach((p) => {
    const s = data.students.find((x) => x.id === p.studentId);
    const cl = data.classes.find((x) => x.id === p.classId);
    if (!s || !cl) return;
    if (!debtByStudent[s.id]) debtByStudent[s.id] = { student: s, total: 0, items: [] };
    debtByStudent[s.id].total += p.amount;
    debtByStudent[s.id].items.push({ cl, month: p.month, year: p.year, amount: p.amount });
  });
  const debtList = Object.values(debtByStudent).sort((a, b) => b.total - a.total);
  const grandTotalDebt = debtList.reduce((s, d) => s + d.total, 0);

  const markPaid = async (row) => {
    const label = `${row.s.name} - ${row.cl.name} (T${month}/${year})`;
    if (row.pay) await api.updatePaymentStatus(row.pay.id, "paid", todayStr(), label);
    else await api.addPayment({ id: genId(), studentId: row.s.id, classId: row.cl.id, month, year, amount: amountFor(row.cl), paidDate: todayStr(), status: "paid" });
  };
  const markUnpaid = async (row) => { if (row.pay) await api.updatePaymentStatus(row.pay.id, "unpaid", null, `${row.s.name} - ${row.cl.name} (T${month}/${year})`); };
  const generate = async () => {
    const ex = new Set(mPays.map((p) => `${p.studentId}-${p.classId}`));
    const news = activeRegs.filter((r) => { const cl = data.classes.find((c) => c.id === r.classId); return cl && !ex.has(`${r.studentId}-${r.classId}`); })
      .map((r) => { const cl = data.classes.find((c) => c.id === r.classId); return { id: genId(), studentId: r.studentId, classId: r.classId, month, year, amount: amountFor(cl), paidDate: null, status: "unpaid" }; });
    if (!news.length) return alert("Đã có đầy đủ bản ghi cho tháng này!");
    await api.addPayments(news);
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
        <StatCard icon={DollarSign} label="Tổng dự kiến" value={fmtMoney(totalExpected)} color={C.blue} />
        <StatCard icon={CheckCircle} label="Đã thu" value={fmtMoney(totalPaid)} color={C.green} />
        <StatCard icon={AlertCircle} label="Chưa thu" value={fmtMoney(totalUnpaid)} color={C.red} />
      </div>
      <Card title={viewMode === "monthly" ? "💰 Quản lý học phí" : "📕 Công nợ tổng hợp — mọi tháng"} action={
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: C.bg, borderRadius: 8, padding: 3 }}>
            <button onClick={() => setViewMode("monthly")} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: viewMode === "monthly" ? "#fff" : "transparent", boxShadow: viewMode === "monthly" ? "0 1px 3px rgba(0,0,0,.1)" : "none", color: viewMode === "monthly" ? C.navy : C.muted, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Theo tháng</button>
            <button onClick={() => setViewMode("debt")} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: viewMode === "debt" ? "#fff" : "transparent", boxShadow: viewMode === "debt" ? "0 1px 3px rgba(0,0,0,.1)" : "none", color: viewMode === "debt" ? C.navy : C.muted, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Công nợ tổng hợp</button>
          </div>
          {viewMode === "monthly" && <>
            <select value={month} onChange={(e) => setMonth(+e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none" }}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(+e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none" }}>
              {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${statusFilter === "unpaid" ? C.red : C.border}`, fontSize: 14, outline: "none", color: statusFilter === "unpaid" ? C.red : C.text }}>
              <option value="">Tất cả trạng thái</option>
              <option value="unpaid">⚠ Chưa thu ({unpaidCount})</option>
              <option value="paid">✓ Đã thu</option>
            </select>
            <div style={{ position: "relative" }}><Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
              <input placeholder="Tìm..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "7px 12px 7px 30px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, width: 140, outline: "none" }} /></div>
            <Btn color={C.blue} onClick={generate}><RefreshCw size={14} />Tạo bản ghi</Btn>
            <Btn color={C.green} onClick={() => exportMonthlyPaymentReport(rows, month, year)}><FileSpreadsheet size={14} />Xuất Excel</Btn>
          </>}
        </div>
      }>
        {viewMode === "monthly" ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ background: C.bg }}>{["Học sinh", "Lớp", "Số buổi", "Học phí", "Trạng thái", "Ngày thu", "Thao tác"].map((h, i) => <Th key={i}>{h}</Th>)}</tr></thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                    <Td style={{ fontWeight: 700, color: C.text }}>{row.s.name}</Td>
                    <Td><Badge color={C.blue}>{row.cl.name}</Badge></Td>
                    <Td style={{ color: C.muted }}>{sessionsInMonth(row.cl.schedule, month, year)} buổi</Td>
                    <Td style={{ fontWeight: 700, color: C.amber }}>{fmtMoney(row.pay?.amount ?? amountFor(row.cl))}</Td>
                    <Td>
                      {!row.pay ? <Badge color={C.muted}>Chưa tạo</Badge>
                        : row.pay.status === "paid" ? <Badge color={C.green}>✓ Đã thu</Badge>
                        : <Badge color={C.red}>⚠ Chưa thu</Badge>}
                    </Td>
                    <Td style={{ color: C.muted }}>{row.pay?.paidDate ? fmtDate(row.pay.paidDate) : "—"}</Td>
                    <Td>
                      {(!row.pay || row.pay.status === "unpaid")
                        ? <Btn color={C.green} style={{ padding: "5px 12px", fontSize: 13 }} onClick={() => markPaid(row)}><CheckCircle size={13} />Thu tiền</Btn>
                        : <Btn color={C.red} outlined style={{ padding: "5px 12px", fontSize: 13 }} onClick={() => markUnpaid(row)}>Hoàn lại</Btn>}
                    </Td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7} style={{ padding: "32px", textAlign: "center", color: C.muted }}>Không có dữ liệu khớp bộ lọc</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 16, padding: 14, background: C.red + "10", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: C.text }}>Tổng công nợ toàn trung tâm (mọi tháng chưa thu)</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: C.red }}>{fmtMoney(grandTotalDebt)}</span>
            </div>
            {debtList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px", color: C.muted }}>🎉 Không có học sinh nào nợ học phí!</div>
            ) : (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                {debtList.map(({ student, total, items }) => (
                  <div key={student.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div>
                        <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{student.name}</span>
                        <span style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>{student.parentPhone}</span>
                      </div>
                      <span style={{ fontWeight: 800, color: C.red, fontSize: 15 }}>{fmtMoney(total)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {items.map((it, i) => `${it.cl.name} (T${it.month}/${it.year}: ${fmtMoney(it.amount)})`).join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════ PAYROLL VIEW (Lương giáo viên) ═══════════════════════════════
function PayrollView({ data, api }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const mRolls = data.payroll.filter((p) => p.month === month && p.year === year);

  const rows = data.teachers.map((t) => {
    const sessions = sessionsTaughtByTeacher(t.id, data.classes, data.attendance, month, year);
    const roll = mRolls.find((p) => p.teacherId === t.id);
    return { t, sessions, roll, amount: roll?.amount ?? t.feePerSession * sessions };
  });

  const totalExpected = rows.reduce((s, r) => s + r.amount, 0);
  const totalPaid = rows.filter((r) => r.roll?.status === "paid").reduce((s, r) => s + r.roll.amount, 0);
  const totalUnpaid = totalExpected - totalPaid;

  const generate = async () => {
    const ex = new Set(mRolls.map((p) => p.teacherId));
    const news = rows.filter((r) => !ex.has(r.t.id) && r.sessions > 0)
      .map((r) => ({ id: genId(), teacherId: r.t.id, month, year, sessionsTaught: r.sessions, amount: r.amount, paidDate: null, status: "unpaid" }));
    if (!news.length) return alert("Không có giáo viên nào có buổi dạy mới cần tạo bảng lương (hoặc đã tạo đủ rồi).");
    await api.addPayrolls(news);
  };
  const markPaid = async (row) => {
    const label = `${row.t.name} (T${month}/${year})`;
    if (row.roll) await api.updatePayrollStatus(row.roll.id, "paid", todayStr(), label);
    else await api.addPayrolls([{ id: genId(), teacherId: row.t.id, month, year, sessionsTaught: row.sessions, amount: row.amount, paidDate: todayStr(), status: "paid" }]);
  };
  const markUnpaid = async (row) => { if (row.roll) await api.updatePayrollStatus(row.roll.id, "unpaid", null, `${row.t.name} (T${month}/${year})`); };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
        <StatCard icon={DollarSign} label="Tổng lương dự kiến" value={fmtMoney(totalExpected)} color={C.blue} />
        <StatCard icon={CheckCircle} label="Đã trả" value={fmtMoney(totalPaid)} color={C.green} />
        <StatCard icon={AlertCircle} label="Chưa trả" value={fmtMoney(totalUnpaid)} color={C.red} />
      </div>
      <Card title="👨‍🏫 Lương giáo viên theo buổi dạy" action={
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={month} onChange={(e) => setMonth(+e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none" }}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(+e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none" }}>
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <Btn color={C.blue} onClick={generate}><RefreshCw size={14} />Tạo bảng lương</Btn>
        </div>
      }>
        <div style={{ marginBottom: 14, padding: 10, background: C.blue + "10", borderRadius: 8, fontSize: 12.5, color: C.navy }}>
          💡 Số buổi tính theo <b>điểm danh thực tế</b> đã ghi nhận trong tháng — lớp nào chưa điểm danh sẽ chưa được tính vào lương.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ background: C.bg }}>{["Giáo viên", "Môn", "Số buổi dạy", "Lương/buổi", "Tổng lương", "Trạng thái", "Thao tác"].map((h, i) => <Th key={i}>{h}</Th>)}</tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.t.id} style={{ borderBottom: `1px solid ${C.border}` }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <Td style={{ fontWeight: 700, color: C.text }}>{row.t.name}</Td>
                  <Td><Badge color={C.purple}>{row.t.subject}</Badge></Td>
                  <Td style={{ color: C.muted }}>{row.sessions} buổi</Td>
                  <Td style={{ color: C.muted }}>{fmtMoney(row.t.feePerSession)}</Td>
                  <Td style={{ fontWeight: 700, color: C.amber }}>{fmtMoney(row.amount)}</Td>
                  <Td>
                    {!row.roll ? <Badge color={C.muted}>Chưa tạo</Badge>
                      : row.roll.status === "paid" ? <Badge color={C.green}>✓ Đã trả</Badge>
                      : <Badge color={C.red}>⚠ Chưa trả</Badge>}
                  </Td>
                  <Td>
                    {row.sessions === 0 ? <span style={{ color: C.muted, fontSize: 12 }}>Chưa có buổi dạy</span>
                      : (!row.roll || row.roll.status === "unpaid")
                      ? <Btn color={C.green} style={{ padding: "5px 12px", fontSize: 13 }} onClick={() => markPaid(row)}><CheckCircle size={13} />Trả lương</Btn>
                      : <Btn color={C.red} outlined style={{ padding: "5px 12px", fontSize: 13 }} onClick={() => markUnpaid(row)}>Hoàn lại</Btn>}
                  </Td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} style={{ padding: "32px", textAlign: "center", color: C.muted }}>Chưa có giáo viên nào</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════ ACTIVITY LOG VIEW (Nhật ký hoạt động) ═══════════════════════════════
const LOG_ENTITY_LABEL = { teacher: "Giáo viên", class: "Lớp học", student: "Học sinh", payment: "Học phí", payroll: "Lương GV" };
const LOG_ACTION_STYLE = { create: { label: "Thêm", color: C.green }, update: { label: "Sửa", color: C.amber }, delete: { label: "Xóa", color: C.red } };
function ActivityLogView({ data }) {
  const [entityFilter, setEntityFilter] = useState("");
  const sorted = [...data.activity_log].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const filtered = sorted.filter((l) => !entityFilter || l.entity === entityFilter);
  const usedEntities = [...new Set(sorted.map((l) => l.entity))];

  const fmtWhen = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      <Card title={`📜 Nhật ký hoạt động (${filtered.length})`} action={
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none" }}>
          <option value="">Tất cả loại</option>
          {usedEntities.map((e) => <option key={e} value={e}>{LOG_ENTITY_LABEL[e] || e}</option>)}
        </select>
      }>
        <div style={{ marginBottom: 14, padding: 10, background: C.amber + "12", borderRadius: 8, fontSize: 12.5, color: "#92650b" }}>
          ⚠ Hệ thống dùng chung 1 tài khoản đăng nhập nên nhật ký chỉ ghi lại <b>việc gì, lúc nào</b> — chưa xác định được chính xác ai thực hiện.
        </div>
        {!filtered.length ? (
          <div style={{ textAlign: "center", padding: "32px", color: C.muted }}>Chưa có hoạt động nào được ghi nhận.</div>
        ) : (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", maxHeight: 560, overflowY: "auto" }}>
            {filtered.map((l) => {
              const st = LOG_ACTION_STYLE[l.action] || { label: l.action, color: C.muted };
              return (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
                  <Badge color={st.color}>{st.label}</Badge>
                  <div style={{ flex: 1, fontSize: 13.5, color: C.text }}>{l.summary}</div>
                  <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{fmtWhen(l.createdAt)}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════ REPORTS VIEW ═══════════════════════════════
function ReportsView({ data }) {
  const now = new Date();
  const [cm, cy] = [now.getMonth() + 1, now.getFullYear()];
  const totalRev = data.payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const mRev = data.payments.filter((p) => p.month === cm && p.year === cy && p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const actStudents = [...new Set(data.registrations.filter((r) => r.status === "active").map((r) => r.studentId))].length;

  const monthAtt = (data.attendance || []).filter((a) => { const [y, m] = a.date.split("-").map(Number); return y === cy && m === cm; });
  const attRate = monthAtt.length ? Math.round((monthAtt.filter((a) => a.status === "present" || a.status === "late").length / monthAtt.length) * 100) : null;

  const revenueData = Array.from({ length: 6 }, (_, i) => { const d = new Date(cy, cm - 1 - i, 1); const [m, y] = [d.getMonth() + 1, d.getFullYear()]; return { month: `T${m}`, revenue: data.payments.filter((p) => p.month === m && p.year === y && p.status === "paid").reduce((s, p) => s + p.amount, 0) }; }).reverse();
  const gradeData = GRADES.map((g) => ({ grade: `Lớp ${g}`, count: data.students.filter((s) => s.grade === g).length })).filter((x) => x.count > 0);
  const subjectData = SUBJECTS.map((s) => ({ name: s, value: data.classes.filter((c) => c.subject === s && c.status === "active").length })).filter((x) => x.value > 0);
  const occData = data.classes.filter((c) => c.status === "active").map((c) => ({ name: c.name, enrolled: data.registrations.filter((r) => r.classId === c.id && r.status === "active").length, max: c.maxStudents }));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <StatCard icon={DollarSign} label="Tổng doanh thu" value={fmtMoney(totalRev)} color={C.amber} />
        <StatCard icon={DollarSign} label={`Thu tháng ${cm}/${cy}`} value={fmtMoney(mRev)} color={C.green} />
        <StatCard icon={Users} label="Học sinh đang học" value={actStudents} color={C.blue} />
        <StatCard icon={ClipboardCheck} label={`Chuyên cần T${cm}/${cy}`} value={attRate === null ? "—" : `${attRate}%`} color={C.purple} sub={monthAtt.length ? `${monthAtt.length} lượt điểm danh` : "Chưa điểm danh tháng này"} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <Btn color={C.green} onClick={() => exportSummaryReport({ revenueData, gradeData, occData })}><FileSpreadsheet size={15} />Xuất báo cáo Excel</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 18, marginBottom: 18 }}>
        <Card title="📈 Doanh thu 6 tháng">
          <ResponsiveContainer width="100%" height={210}><BarChart data={revenueData}><CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" /><XAxis dataKey="month" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000000).toFixed(1) + "M"} /><Tooltip formatter={(v) => fmtMoney(v)} /><Bar dataKey="revenue" fill={C.blue} radius={[5, 5, 0, 0]} name="Doanh thu" /></BarChart></ResponsiveContainer>
        </Card>
        <Card title="🎯 Phân bổ môn học">
          <ResponsiveContainer width="100%" height={210}><PieChart><Pie data={subjectData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}:${value}`} labelLine={false} fontSize={11}>{subjectData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
        </Card>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Card title="👥 Học sinh theo khối">
          <ResponsiveContainer width="100%" height={190}><BarChart data={gradeData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis dataKey="grade" type="category" tick={{ fontSize: 11 }} width={52} /><Tooltip /><Bar dataKey="count" fill={C.green} radius={[0, 5, 5, 0]} name="Học sinh" /></BarChart></ResponsiveContainer>
        </Card>
        <Card title="📊 Tỷ lệ lấp đầy lớp">
          <div style={{ maxHeight: 190, overflowY: "auto" }}>
            {occData.map((c, i) => { const pct = Math.round((c.enrolled / c.max) * 100); return (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: C.text }}>{c.name}</span>
                  <span style={{ color: C.muted }}>{c.enrolled}/{c.max} ({pct}%)</span>
                </div>
                <div style={{ background: C.bg, borderRadius: 4, height: 8 }}>
                  <div style={{ width: `${pct}%`, background: pct > 85 ? C.red : pct > 60 ? C.amber : C.green, height: 8, borderRadius: 4, transition: "width .4s" }} />
                </div>
              </div>
            ); })}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════ MAIN APP ═══════════════════════════════
const NAV = [
  { id: "dashboard", icon: Home, label: "Tổng quan" },
  { id: "classes", icon: BookOpen, label: "Lớp học" },
  { id: "students", icon: Users, label: "Học sinh" },
  { id: "teachers", icon: User, label: "Giáo viên" },
  { id: "attendance", icon: ClipboardCheck, label: "Điểm danh" },
  { id: "payments", icon: DollarSign, label: "Học phí" },
  { id: "payroll", icon: Wallet, label: "Lương GV" },
  { id: "reports", icon: BarChart2, label: "Báo cáo" },
  { id: "activitylog", icon: History, label: "Nhật ký" },
];

function AuthenticatedApp({ profile, onSignOut }) {
  const isAdmin = profile?.role === "admin";
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [online, setOnline] = useState(false);

  const showToast = useCallback((msg, color = C.green) => { setToast({ msg, color }); setTimeout(() => setToast(null), 3000); }, []);

  const applyChange = useCallback((table, payload) => {
    const mapFn = MAPPERS[table].toApp;
    setData((d) => {
      if (!d) return d;
      const arr = d[table];
      if (payload.eventType === "INSERT") {
        const row = mapFn(payload.new);
        if (arr.some((x) => x.id === row.id)) return { ...d, [table]: arr.map((x) => (x.id === row.id ? row : x)) };
        return { ...d, [table]: [...arr, row] };
      }
      if (payload.eventType === "UPDATE") {
        const row = mapFn(payload.new);
        return { ...d, [table]: arr.map((x) => (x.id === row.id ? row : x)) };
      }
      if (payload.eventType === "DELETE") {
        const id = payload.old.id;
        return { ...d, [table]: arr.filter((x) => x.id !== id) };
      }
      return d;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [teachers, classes, students, registrations, payments, attendance, payroll, activity_log] = await Promise.all(TABLE_ORDER.map(fetchAll));
        if (!cancelled) setData({ teachers, classes, students, registrations, payments, attendance, payroll, activity_log });
      } catch (e) {
        console.error(e);
        if (!cancelled) showToast("⚠ Không thể tải dữ liệu — kiểm tra kết nối mạng", C.red);
      }
      if (!cancelled) setLoading(false);
    })();

    const channel = supabase.channel("foster-realtime");
    TABLE_ORDER.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => applyChange(table, payload));
    });
    channel.subscribe((status) => setOnline(status === "SUBSCRIBED"));

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [applyChange, showToast]);

  // ── Nhật ký hoạt động: ghi lại (không chờ, không chặn UI) ──
  const log = (action, entity, summary) => {
    insertRow("activity_log", { id: genId(), action, entity, summary }).catch(() => {});
  };

  // ── Mutation API passed down to views. State updates arrive via realtime. ──
  const api = {
    addTeacher: async (t) => { try { await insertRow("teachers", { ...t, id: genId() }); log("create", "teacher", `Thêm giáo viên: ${t.name}`); } catch { showToast("⚠ Lỗi khi thêm giáo viên", C.red); } },
    addTeachers: async (ts) => { try { await insertRows("teachers", ts.map((t) => ({ ...t, id: genId() }))); log("create", "teacher", `Nhập Excel ${ts.length} giáo viên`); showToast(`✓ Đã nhập ${ts.length} giáo viên`); } catch { showToast("⚠ Lỗi khi nhập danh sách giáo viên", C.red); } },
    updateTeacher: async (t) => { try { await updateRow("teachers", t.id, MAPPERS.teachers.toRow(t)); log("update", "teacher", `Sửa giáo viên: ${t.name}`); } catch { showToast("⚠ Lỗi khi cập nhật giáo viên", C.red); } },
    deleteTeacher: async (id, name) => { try { await deleteRow("teachers", id); log("delete", "teacher", `Xóa giáo viên: ${name || id}`); } catch { showToast("⚠ Lỗi khi xóa giáo viên", C.red); } },

    addClass: async (c) => { try { await insertRow("classes", { ...c, id: genId() }); log("create", "class", `Thêm lớp: ${c.name}`); } catch { showToast("⚠ Lỗi khi thêm lớp", C.red); } },
    updateClass: async (c) => { try { await updateRow("classes", c.id, MAPPERS.classes.toRow(c)); log("update", "class", `Sửa lớp: ${c.name}`); } catch { showToast("⚠ Lỗi khi cập nhật lớp", C.red); } },
    deleteClass: async (id, name) => { try { await deleteRow("classes", id); log("delete", "class", `Xóa lớp: ${name || id}`); } catch { showToast("⚠ Lỗi khi xóa lớp", C.red); } },

    addStudent: async (s) => { try { await insertRow("students", { ...s, id: genId() }); log("create", "student", `Thêm học sinh: ${s.name}`); } catch { showToast("⚠ Lỗi khi thêm học sinh", C.red); } },
    addStudents: async (ss) => { try { await insertRows("students", ss); log("create", "student", `Nhập Excel ${ss.length} học sinh`); showToast(`✓ Đã nhập ${ss.length} học sinh`); } catch { showToast("⚠ Lỗi khi nhập danh sách học sinh", C.red); } },
    updateStudent: async (s) => { try { await updateRow("students", s.id, MAPPERS.students.toRow(s)); log("update", "student", `Sửa học sinh: ${s.name}`); } catch { showToast("⚠ Lỗi khi cập nhật học sinh", C.red); } },
    deleteStudent: async (id, name) => { try { await deleteRow("students", id); log("delete", "student", `Xóa học sinh: ${name || id}`); } catch { showToast("⚠ Lỗi khi xóa học sinh", C.red); } },

    addRegistration: async (r) => { try { await insertRow("registrations", r); } catch { showToast("⚠ Lỗi khi đăng ký lớp", C.red); } },
    addRegistrations: async (rs) => { try { await insertRows("registrations", rs); } catch { showToast("⚠ Lỗi khi đăng ký lớp hàng loạt", C.red); } },
    deleteRegistration: async (id) => { try { await deleteRow("registrations", id); } catch { showToast("⚠ Lỗi khi hủy đăng ký", C.red); } },

    addPayment: async (p) => { try { await insertRow("payments", p); } catch { showToast("⚠ Lỗi khi ghi nhận học phí", C.red); } },
    addPayments: async (ps) => { try { await insertRows("payments", ps); } catch { showToast("⚠ Lỗi khi tạo bản ghi học phí", C.red); } },
    updatePaymentStatus: async (id, status, paid_date, label) => { try { await updateRow("payments", id, { status, paid_date }); if (label) log("update", "payment", `${status === "paid" ? "Thu học phí" : "Hoàn lại học phí"}: ${label}`); } catch { showToast("⚠ Lỗi khi cập nhật học phí", C.red); } },

    saveAttendance: async (rows) => {
      try { await upsertRows("attendance", rows, "class_id,student_id,date"); showToast("✓ Đã lưu điểm danh"); }
      catch { showToast("⚠ Lỗi khi lưu điểm danh", C.red); }
    },

    addPayrolls: async (ps) => { try { await insertRows("payroll", ps); } catch { showToast("⚠ Lỗi khi tạo bảng lương", C.red); } },
    updatePayrollStatus: async (id, status, paid_date, label) => { try { await updateRow("payroll", id, { status, paid_date }); if (label) log("update", "payroll", `${status === "paid" ? "Trả lương" : "Hoàn lại lương"}: ${label}`); } catch { showToast("⚠ Lỗi khi cập nhật lương", C.red); } },
  };

  const exportJSON = () => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `foster-backup-${todayStr()}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast("✓ Đã xuất file backup JSON!");
  };

  const pushFullDataset = async (dataset) => {
    // delete children first to respect FK constraints, then re-insert in dependency order
    await deleteAll("activity_log"); await deleteAll("payroll"); await deleteAll("attendance"); await deleteAll("payments"); await deleteAll("registrations"); await deleteAll("classes");
    await deleteAll("students"); await deleteAll("teachers");
    await insertRows("teachers", dataset.teachers);
    await insertRows("classes", dataset.classes);
    await insertRows("students", dataset.students);
    await insertRows("registrations", dataset.registrations);
    await insertRows("payments", dataset.payments);
    await insertRows("attendance", dataset.attendance || []);
    await insertRows("payroll", dataset.payroll || []);
    await insertRows("activity_log", dataset.activity_log || []);
  };

  const importJSON = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          const keys = ["teachers", "classes", "students", "registrations", "payments"];
          if (!keys.every((k) => Array.isArray(parsed[k]))) return alert("❌ File không đúng định dạng Foster!");
          if (!Array.isArray(parsed.attendance)) parsed.attendance = [];
          if (!Array.isArray(parsed.payroll)) parsed.payroll = [];
          if (!Array.isArray(parsed.activity_log)) parsed.activity_log = [];
          const info = `📂 ${file.name}\n\n• ${parsed.teachers.length} giáo viên\n• ${parsed.classes.length} lớp học\n• ${parsed.students.length} học sinh\n• ${parsed.registrations.length} đăng ký\n• ${parsed.payments.length} bản ghi học phí\n• ${parsed.attendance.length} bản ghi điểm danh\n• ${parsed.payroll.length} bản ghi lương\n\n⚠ Dữ liệu hiện tại (trên mọi thiết bị) sẽ bị ghi đè. Tiếp tục?`;
          if (!confirm(info)) return;
          setData(parsed);
          await pushFullDataset(parsed);
          showToast(`✓ Import thành công — ${parsed.students.length} học sinh, ${parsed.classes.length} lớp`);
        } catch (err) { console.error(err); alert("❌ File lỗi hoặc không đúng định dạng JSON!"); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const resetToSample = async () => {
    if (!confirm("Reset về dữ liệu mẫu?\n\n⚠ Toàn bộ dữ liệu hiện tại (trên mọi thiết bị) sẽ bị xóa!")) return;
    setData(SAMPLE_DATA);
    try { await pushFullDataset(SAMPLE_DATA); showToast("↺ Đã reset về dữ liệu mẫu", C.amber); }
    catch { showToast("⚠ Lỗi khi reset dữ liệu", C.red); }
  };

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
      <div style={{ textAlign: "center", color: C.navy }}>
        <img src={leafIcon} alt="Foster" style={{ width: 56, height: 56, objectFit: "contain", margin: "0 auto 12px", display: "block" }} />
        <div style={{ fontSize: 20, fontWeight: 800 }}>Đang tải Foster...</div>
      </div>
    </div>
  );

  const curTab = NAV.find((n) => n.id === tab);
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: C.bg, fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {/* ── Sidebar ── */}
      <div style={{ width: 215, background: C.navy, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "22px 18px 16px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "#fff", borderRadius: 10, padding: 6, display: "flex", boxShadow: "0 1px 4px rgba(0,0,0,.15)" }}>
              <img src={leafIcon} alt="Foster" style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4 }} />
            </div>
            <div><div style={{ color: "#fff", fontWeight: 800, fontSize: 19, letterSpacing: -0.5 }}>FOSTER</div>
            <div style={{ color: "rgba(255,255,255,.45)", fontSize: 10.5, lineHeight: 1.3 }}>Nuôi dưỡng ước mơ, kiến tạo tương lai</div></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 10, fontSize: 11, color: online ? "#6EE7B7" : "rgba(255,255,255,.4)" }}>
            {online ? <Wifi size={12} /> : <WifiOff size={12} />}{online ? "Đồng bộ trực tuyến" : "Đang kết nối..."}
          </div>
        </div>
        <nav style={{ padding: "10px 8px", flex: 1 }}>
          {NAV.map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setTab(id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", marginBottom: 2, textAlign: "left", background: tab === id ? C.amber : "transparent", color: tab === id ? "#fff" : "rgba(255,255,255,.6)", fontWeight: tab === id ? 700 : 400, fontSize: 14, transition: "all .15s" }}>
              <Icon size={17} />{label}
            </button>
          ))}
        </nav>
        <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,.1)" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Dữ liệu</div>
          <button onClick={() => exportFullWorkbook(data)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.85)", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            <FileSpreadsheet size={13} />Xuất Excel toàn bộ
          </button>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <button onClick={exportJSON} title="Tải file backup JSON về máy" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.8)", fontSize: 12, fontWeight: 600 }}>
              <Download size={13} />Export
            </button>
            {isAdmin && (
              <button onClick={importJSON} title="Khôi phục từ file backup JSON" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.8)", fontSize: 12, fontWeight: 600 }}>
                <Upload size={13} />Import
              </button>
            )}
          </div>
          {isAdmin && (
            <button onClick={resetToSample} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.25)", fontSize: 11, textAlign: "left", padding: "4px 0", marginBottom: 10 }}>↺ Reset dữ liệu mẫu</button>
          )}
          {AUTH_ENABLED && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.1)" }}>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.email}</div>
                <div style={{ fontSize: 10.5, color: isAdmin ? "#F5A623" : "rgba(255,255,255,.5)" }}>{isAdmin ? "Admin" : "Cán bộ"}</div>
              </div>
              <button onClick={onSignOut} title="Đăng xuất" style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", display: "flex", flexShrink: 0 }}>
                <LogOut size={14} color="rgba(255,255,255,.7)" />
              </button>
            </div>
          )}
          <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.1)" }}>
            <button onClick={lockSimpleAuth} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: "rgba(255,255,255,.4)", fontSize: 11.5, fontWeight: 600 }}>
              <LogOut size={12} />Khóa lại
            </button>
          </div>
        </div>
      </div>
      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.color, color: "#fff", padding: "12px 24px", borderRadius: 99, fontSize: 14, fontWeight: 700, zIndex: 999, boxShadow: "0 4px 20px rgba(0,0,0,.2)", whiteSpace: "nowrap" }}>
          {toast.msg}
        </div>
      )}
      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ background: "#fff", padding: "14px 26px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>{curTab?.label}</h1>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: C.muted }}>
            <span>📚 {data.classes.filter((c) => c.status === "active").length} lớp</span>
            <span>·</span>
            <span>👥 {data.students.length} học sinh</span>
            <span>·</span>
            <span>👨‍🏫 {data.teachers.length} GV</span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>
          {tab === "dashboard" && <Dashboard data={data} />}
          {tab === "classes" && <ClassesView data={data} api={api} isAdmin={isAdmin} />}
          {tab === "students" && <StudentsView data={data} api={api} isAdmin={isAdmin} />}
          {tab === "teachers" && <TeachersView data={data} api={api} isAdmin={isAdmin} />}
          {tab === "attendance" && <AttendanceView data={data} api={api} />}
          {tab === "payments" && <PaymentsView data={data} api={api} />}
          {tab === "payroll" && <PayrollView data={data} api={api} />}
          {tab === "reports" && <ReportsView data={data} />}
          {tab === "activitylog" && <ActivityLogView data={data} />}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════ AUTH GATE ═══════════════════════════════
function FosterAppInner() {
  const [status, setStatus] = useState(AUTH_ENABLED ? "checking" : "in");
  const [profile, setProfile] = useState(AUTH_ENABLED ? null : { role: "admin" });

  const loadProfile = async () => {
    try { setProfile(await getMyProfile()); setStatus("in"); }
    catch { setProfile(null); setStatus("in"); } // logged in but no profile row yet — treat as staff (no admin rights) below
  };

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    let mounted = true;
    (async () => {
      const session = await getSession();
      if (!mounted) return;
      if (session) await loadProfile(); else setStatus("out");
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) loadProfile();
      if (event === "SIGNED_OUT") { setProfile(null); setStatus("out"); }
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  if (status === "checking") return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
      <img src={leafIcon} alt="Foster" style={{ width: 48, height: 48, objectFit: "contain" }} />
    </div>
  );

  if (status === "out") return <LoginScreen onLoggedIn={() => {}} />;

  return <AuthenticatedApp profile={profile || { role: "staff" }} onSignOut={signOut} />;
}

// ═══════════════════════════════ SIMPLE SHARED-PASSWORD GATE ═══════════════════════════════
// Chặn ở giao diện bằng 1 tài khoản/mật khẩu dùng chung — KHÔNG khóa ở tầng database.
// Đủ dùng để ngăn người ngoài tình cờ có link vào xem/sửa dữ liệu; không chặn được
// người cố tình mở DevTools. Muốn khóa thật ở tầng dữ liệu, dùng lại AUTH_ENABLED
// (Supabase Auth) đã xây sẵn phía trên.
const SIMPLE_LOGIN = { username: "foster2026", password: "Hanoi2026@" };
const SIMPLE_AUTH_KEY = "foster_unlocked_v1";
export function lockSimpleAuth() { localStorage.removeItem(SIMPLE_AUTH_KEY); window.location.reload(); }

function SimplePasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(SIMPLE_AUTH_KEY) === "1");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (username.trim() === SIMPLE_LOGIN.username && password === SIMPLE_LOGIN.password) {
      localStorage.setItem(SIMPLE_AUTH_KEY, "1");
      setUnlocked(true);
    } else {
      setError("Sai tài khoản hoặc mật khẩu.");
    }
  };

  if (unlocked) return children;

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "system-ui,-apple-system,sans-serif" }}>
      <form onSubmit={submit} style={{ background: "#fff", borderRadius: 18, padding: "36px 34px", width: 360, boxShadow: "0 8px 32px rgba(27,58,107,.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{ display: "inline-flex", background: C.bg, borderRadius: 14, padding: 12, marginBottom: 12 }}>
            <Lock size={26} color={C.navy} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>FOSTER</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>Nhập tài khoản để tiếp tục</div>
        </div>
        <Inp label="Tài khoản" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <Inp label="Mật khẩu" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 12, marginTop: -4 }}>{error}</div>}
        <button type="submit" style={{ width: "100%", marginTop: 6, padding: "11px 0", borderRadius: 10, border: "none", background: C.navy, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          Đăng nhập
        </button>
      </form>
    </div>
  );
}

export default function FosterApp() {
  return (
    <SimplePasswordGate>
      <FosterAppInner />
    </SimplePasswordGate>
  );
}
