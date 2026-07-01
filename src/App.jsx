import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Home, BookOpen, Users, User, DollarSign, BarChart2, Plus, Edit2, Trash2, Search, X, CheckCircle, GraduationCap, AlertCircle, RefreshCw, Download, Upload, FileSpreadsheet, Wifi, WifiOff } from "lucide-react";
import { supabase, fetchAll, insertRow, insertRows, updateRow, deleteRow, deleteAll, MAPPERS } from "./lib/supabase.js";
import { exportFullWorkbook, exportMonthlyPaymentReport, exportSummaryReport } from "./lib/excelExport.js";

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
const TABLE_ORDER = ["teachers", "classes", "students", "registrations", "payments"];

// ═══════════════════════════════ SAMPLE DATA (used only for "reset") ═══════════════════════════════
const SAMPLE_DATA = {
  teachers: [
    { id: "t1", name: "Nguyễn Thị Lan", phone: "0901234567", subject: "Toán", email: "lan@foster.vn", joinDate: "2023-09-01" },
    { id: "t2", name: "Trần Văn Nam", phone: "0902345678", subject: "Ngữ Văn", email: "nam@foster.vn", joinDate: "2023-09-01" },
    { id: "t3", name: "Lê Thị Hoa", phone: "0903456789", subject: "Tiếng Anh", email: "hoa@foster.vn", joinDate: "2024-01-10" },
    { id: "t4", name: "Phạm Quốc Tuấn", phone: "0904567890", subject: "Vật Lý", email: "tuan@foster.vn", joinDate: "2024-01-10" },
  ],
  classes: [
    { id: "c1", name: "Toán 10A", subject: "Toán", teacherId: "t1", days: ["T2", "T4", "T6"], startTime: "17:30", endTime: "19:00", room: "P.101", maxStudents: 20, monthlyFee: 500000, status: "active" },
    { id: "c2", name: "Toán 11B", subject: "Toán", teacherId: "t1", days: ["T3", "T5"], startTime: "18:00", endTime: "19:30", room: "P.101", maxStudents: 18, monthlyFee: 500000, status: "active" },
    { id: "c3", name: "Văn 10A", subject: "Ngữ Văn", teacherId: "t2", days: ["T2", "T5"], startTime: "18:00", endTime: "19:30", room: "P.102", maxStudents: 20, monthlyFee: 450000, status: "active" },
    { id: "c4", name: "Anh 9A", subject: "Tiếng Anh", teacherId: "t3", days: ["T7", "CN"], startTime: "08:00", endTime: "10:00", room: "P.103", maxStudents: 15, monthlyFee: 600000, status: "active" },
    { id: "c5", name: "Lý 11A", subject: "Vật Lý", teacherId: "t4", days: ["T4", "T7"], startTime: "19:00", endTime: "20:30", room: "P.104", maxStudents: 20, monthlyFee: 500000, status: "active" },
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
function Dashboard({ data }) {
  const now = new Date();
  const [cm, cy] = [now.getMonth() + 1, now.getFullYear()];
  const activeRegs = data.registrations.filter((r) => r.status === "active");
  const mPays = data.payments.filter((p) => p.month === cm && p.year === cy);
  const paidRev = mPays.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const unpaidPays = mPays.filter((p) => p.status === "unpaid");
  const activeClasses = data.classes.filter((c) => c.status === "active");
  const uniqueStudents = [...new Set(activeRegs.map((r) => r.studentId))];

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

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 22 }}>
        <StatCard icon={BookOpen} label="Lớp đang hoạt động" value={activeClasses.length} color={C.blue} />
        <StatCard icon={Users} label="Học sinh đang học" value={uniqueStudents.length} color={C.green} />
        <StatCard icon={User} label="Giáo viên" value={data.teachers.length} color={C.purple} />
        <StatCard icon={DollarSign} label={`Đã thu T${cm}/${cy}`} value={fmtMoney(paidRev)} color={C.amber}
          sub={unpaidPays.length ? `⚠ Còn ${unpaidPays.length} khoản chưa thu` : "✓ Thu đầy đủ rồi!"} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, marginBottom: 18 }}>
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
                    <Td style={{ color: C.muted, fontSize: 12 }}>{cls.days.join(",")} · {cls.startTime}–{cls.endTime}</Td>
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
function ClassesView({ data, api }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [viewStu, setViewStu] = useState(null);
  const blank = { name: "", subject: "Toán", teacherId: "", days: [], startTime: "17:00", endTime: "18:30", room: "", maxStudents: 20, monthlyFee: 500000, status: "active" };
  const filtered = data.classes.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.subject.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async (cls) => {
    setModal(null);
    if (cls.id) await api.updateClass(cls); else await api.addClass(cls);
  };
  const handleDel = async (id) => { setConfirmDel(null); await api.deleteClass(id); };

  return (
    <div>
      <Card title={`Danh sách lớp học (${filtered.length})`} action={
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
            <input placeholder="Tìm lớp..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "8px 12px 8px 32px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, width: 200, outline: "none" }} /></div>
          <Btn color={C.blue} onClick={() => setModal({ cls: { ...blank } })}><Plus size={15} />Thêm lớp</Btn>
        </div>
      }>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ background: C.bg }}>
              {["Tên lớp", "Môn", "Giáo viên", "Lịch học", "Phòng", "Học phí", "Sĩ số", ""].map((h, i) => <Th key={i}>{h}</Th>)}
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
                    <Td style={{ color: C.muted, fontSize: 12 }}>{cls.days.join(",")} {cls.startTime}–{cls.endTime}</Td>
                    <Td style={{ color: C.text }}>{cls.room || "—"}</Td>
                    <Td style={{ color: C.amber, fontWeight: 700 }}>{fmtMoney(cls.monthlyFee)}</Td>
                    <Td style={{ color: enrolled >= cls.maxStudents ? C.red : C.text, fontWeight: 600 }}>{enrolled}/{cls.maxStudents}</Td>
                    <Td><div style={{ display: "flex", gap: 5 }}>
                      <ActionBtn icon={Users} color={C.blue} onClick={() => setViewStu(cls.id)} title="Xem học sinh" />
                      <ActionBtn icon={Edit2} color={C.amber} onClick={() => setModal({ cls: { ...cls } })} title="Sửa" />
                      <ActionBtn icon={Trash2} color={C.red} onClick={() => setConfirmDel(cls.id)} title="Xóa" />
                    </div></Td>
                  </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan={8} style={{ padding: "32px", textAlign: "center", color: C.muted }}>Không tìm thấy lớp học</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.cls.id ? "Chỉnh sửa lớp học" : "Thêm lớp học"}>
        {modal && <ClassForm cls={modal.cls} teachers={data.teachers} onSave={handleSave} onCancel={() => setModal(null)} />}
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
function ClassForm({ cls, teachers, onSave, onCancel }) {
  const [f, setF] = useState(cls);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggleDay = (d) => set("days", f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d]);
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
        <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: C.text }}>Lịch học</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{DAYS.map((d) => (
          <button key={d} onClick={() => toggleDay(d)} style={{ padding: "6px 14px", borderRadius: 8, border: `2px solid ${f.days.includes(d) ? C.blue : C.border}`, background: f.days.includes(d) ? C.blue + "18" : "#fff", color: f.days.includes(d) ? C.blue : C.muted, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>{d}</button>
        ))}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Inp label="Giờ bắt đầu" type="time" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} />
        <Inp label="Giờ kết thúc" type="time" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} />
        <Inp label="Phòng học" value={f.room} onChange={(e) => set("room", e.target.value)} placeholder="P.101" />
        <Inp label="Sĩ số tối đa" type="number" value={f.maxStudents} onChange={(e) => set("maxStudents", +e.target.value)} />
        <Inp label="Học phí / tháng (đ)" type="number" value={f.monthlyFee} onChange={(e) => set("monthlyFee", +e.target.value)} />
        <Sel label="Trạng thái" value={f.status} onChange={(e) => set("status", e.target.value)}>
          <option value="active">Đang hoạt động</option><option value="inactive">Tạm dừng</option>
        </Sel>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Btn color={C.muted} outlined onClick={onCancel}>Hủy</Btn>
        <Btn color={C.blue} onClick={() => { if (!f.name.trim()) return alert("Nhập tên lớp!"); onSave(f); }}>💾 Lưu</Btn>
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
function StudentsView({ data, api }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [viewCls, setViewCls] = useState(null);
  const blank = { name: "", phone: "", parentName: "", parentPhone: "", grade: "10", address: "", joinDate: todayStr() };
  const filtered = data.students.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search) || s.grade.includes(search));
  const countCls = (id) => data.registrations.filter((r) => r.studentId === id && r.status === "active").length;
  const handleSave = async (s) => { setModal(null); if (s.id) await api.updateStudent(s); else await api.addStudent(s); };
  const handleDel = async (id) => { setConfirmDel(null); await api.deleteStudent(id); };
  return (
    <div>
      <Card title={`Danh sách học sinh (${filtered.length})`} action={
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
            <input placeholder="Tìm học sinh..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "8px 12px 8px 32px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, width: 220, outline: "none" }} /></div>
          <Btn color={C.green} onClick={() => setModal({ student: { ...blank } })}><Plus size={15} />Thêm học sinh</Btn>
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
                    <ActionBtn icon={Trash2} color={C.red} onClick={() => setConfirmDel(s.id)} title="Xóa" />
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
          <option value="">-- Chọn lớp --</option>{avail.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.subject} · {c.days.join(",")} {c.startTime}</option>)}
        </select>
        <Btn color={C.blue} onClick={add}>Đăng ký</Btn><Btn color={C.muted} outlined onClick={() => setShow(false)}>Hủy</Btn>
      </div>}
      {regs.map((r) => { const cl = data.classes.find((c) => c.id === r.classId); return cl ? (
        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${C.border}` }}>
          <div><div style={{ fontWeight: 700, color: C.text }}>{cl.name}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{cl.subject} · {cl.days.join(",")} · {cl.startTime}–{cl.endTime} · {fmtMoney(cl.monthlyFee)}/tháng</div></div>
          <ActionBtn icon={Trash2} color={C.red} onClick={() => remove(r.id)} title="Hủy đăng ký" />
        </div>
      ) : null; })}
      {!regs.length && <div style={{ textAlign: "center", padding: "20px", color: C.muted, fontSize: 13 }}>Chưa đăng ký lớp nào</div>}
    </div>
  );
}

// ═══════════════════════════════ TEACHERS VIEW ═══════════════════════════════
function TeachersView({ data, api }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const blank = { name: "", phone: "", subject: "Toán", email: "", joinDate: todayStr() };
  const filtered = data.teachers.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase()));
  const getClasses = (id) => data.classes.filter((c) => c.teacherId === id && c.status === "active");
  const handleSave = async (t) => { setModal(null); if (t.id) await api.updateTeacher(t); else await api.addTeacher(t); };
  const handleDel = async (id) => {
    if (data.classes.some((c) => c.teacherId === id)) return alert("Giáo viên đang phụ trách lớp học.\nVui lòng chuyển lớp trước khi xóa.");
    setConfirmDel(null); await api.deleteTeacher(id);
  };
  return (
    <div>
      <Card title={`Đội ngũ giáo viên (${filtered.length})`} action={
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
            <input placeholder="Tìm giáo viên..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "8px 12px 8px 32px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, width: 200, outline: "none" }} /></div>
          <Btn color={C.purple} onClick={() => setModal({ teacher: { ...blank } })}><Plus size={15} />Thêm GV</Btn>
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
                    <ActionBtn icon={Trash2} color={C.red} onClick={() => setConfirmDel(t.id)} title="Xóa" />
                  </div>
                </div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
                  <div>📞 {t.phone}</div>{t.email && <div>✉️ {t.email}</div>}<div>📅 Từ {fmtDate(t.joinDate)}</div>
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
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Btn color={C.muted} outlined onClick={onCancel}>Hủy</Btn>
        <Btn color={C.purple} onClick={() => { if (!f.name.trim()) return alert("Nhập tên GV!"); onSave(f); }}>💾 Lưu</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════ PAYMENTS VIEW ═══════════════════════════════
function PaymentsView({ data, api }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const activeRegs = data.registrations.filter((r) => r.status === "active");
  const mPays = data.payments.filter((p) => p.month === month && p.year === year);

  const rows = activeRegs.map((r) => {
    const s = data.students.find((x) => x.id === r.studentId);
    const cl = data.classes.find((x) => x.id === r.classId);
    if (!s || !cl) return null;
    const pay = mPays.find((p) => p.studentId === r.studentId && p.classId === r.classId);
    return { r, s, cl, pay };
  }).filter(Boolean).filter((row) => row.s.name.toLowerCase().includes(search.toLowerCase()) || row.cl.name.toLowerCase().includes(search.toLowerCase()));

  const totalExpected = rows.reduce((sum, r) => sum + (r.pay?.amount || r.cl.monthlyFee), 0);
  const totalPaid = rows.filter((r) => r.pay?.status === "paid").reduce((sum, r) => sum + r.pay.amount, 0);
  const totalUnpaid = rows.filter((r) => !r.pay || r.pay.status === "unpaid").reduce((sum, r) => sum + (r.pay?.amount || r.cl.monthlyFee), 0);

  const markPaid = async (row) => {
    if (row.pay) await api.updatePaymentStatus(row.pay.id, "paid", todayStr());
    else await api.addPayment({ id: genId(), studentId: row.s.id, classId: row.cl.id, month, year, amount: row.cl.monthlyFee, paidDate: todayStr(), status: "paid" });
  };
  const markUnpaid = async (row) => { if (row.pay) await api.updatePaymentStatus(row.pay.id, "unpaid", null); };
  const generate = async () => {
    const ex = new Set(mPays.map((p) => `${p.studentId}-${p.classId}`));
    const news = activeRegs.filter((r) => { const cl = data.classes.find((c) => c.id === r.classId); return cl && !ex.has(`${r.studentId}-${r.classId}`); })
      .map((r) => { const cl = data.classes.find((c) => c.id === r.classId); return { id: genId(), studentId: r.studentId, classId: r.classId, month, year, amount: cl.monthlyFee, paidDate: null, status: "unpaid" }; });
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
      <Card title="💰 Quản lý học phí" action={
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={month} onChange={(e) => setMonth(+e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none" }}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(+e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none" }}>
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <div style={{ position: "relative" }}><Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
            <input placeholder="Tìm..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "7px 12px 7px 30px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, width: 140, outline: "none" }} /></div>
          <Btn color={C.blue} onClick={generate}><RefreshCw size={14} />Tạo bản ghi</Btn>
          <Btn color={C.green} onClick={() => exportMonthlyPaymentReport(rows, month, year)}><FileSpreadsheet size={14} />Xuất Excel</Btn>
        </div>
      }>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ background: C.bg }}>{["Học sinh", "Lớp", "Học phí", "Trạng thái", "Ngày thu", "Thao tác"].map((h, i) => <Th key={i}>{h}</Th>)}</tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <Td style={{ fontWeight: 700, color: C.text }}>{row.s.name}</Td>
                  <Td><Badge color={C.blue}>{row.cl.name}</Badge></Td>
                  <Td style={{ fontWeight: 700, color: C.amber }}>{fmtMoney(row.pay?.amount || row.cl.monthlyFee)}</Td>
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
              {!rows.length && <tr><td colSpan={6} style={{ padding: "32px", textAlign: "center", color: C.muted }}>Không có dữ liệu — nhấn "Tạo bản ghi" để bắt đầu</td></tr>}
            </tbody>
          </table>
        </div>
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

  const revenueData = Array.from({ length: 6 }, (_, i) => { const d = new Date(cy, cm - 1 - i, 1); const [m, y] = [d.getMonth() + 1, d.getFullYear()]; return { month: `T${m}`, revenue: data.payments.filter((p) => p.month === m && p.year === y && p.status === "paid").reduce((s, p) => s + p.amount, 0) }; }).reverse();
  const gradeData = GRADES.map((g) => ({ grade: `Lớp ${g}`, count: data.students.filter((s) => s.grade === g).length })).filter((x) => x.count > 0);
  const subjectData = SUBJECTS.map((s) => ({ name: s, value: data.classes.filter((c) => c.subject === s && c.status === "active").length })).filter((x) => x.value > 0);
  const occData = data.classes.filter((c) => c.status === "active").map((c) => ({ name: c.name, enrolled: data.registrations.filter((r) => r.classId === c.id && r.status === "active").length, max: c.maxStudents }));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
        <StatCard icon={DollarSign} label="Tổng doanh thu" value={fmtMoney(totalRev)} color={C.amber} />
        <StatCard icon={DollarSign} label={`Thu tháng ${cm}/${cy}`} value={fmtMoney(mRev)} color={C.green} />
        <StatCard icon={Users} label="Học sinh đang học" value={actStudents} color={C.blue} />
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
  { id: "payments", icon: DollarSign, label: "Học phí" },
  { id: "reports", icon: BarChart2, label: "Báo cáo" },
];

export default function FosterApp() {
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
        const [teachers, classes, students, registrations, payments] = await Promise.all(TABLE_ORDER.map(fetchAll));
        if (!cancelled) setData({ teachers, classes, students, registrations, payments });
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

  // ── Mutation API passed down to views. State updates arrive via realtime. ──
  const api = {
    addTeacher: async (t) => { try { await insertRow("teachers", { ...t, id: genId() }); } catch { showToast("⚠ Lỗi khi thêm giáo viên", C.red); } },
    updateTeacher: async (t) => { try { await updateRow("teachers", t.id, MAPPERS.teachers.toRow(t)); } catch { showToast("⚠ Lỗi khi cập nhật giáo viên", C.red); } },
    deleteTeacher: async (id) => { try { await deleteRow("teachers", id); } catch { showToast("⚠ Lỗi khi xóa giáo viên", C.red); } },

    addClass: async (c) => { try { await insertRow("classes", { ...c, id: genId() }); } catch { showToast("⚠ Lỗi khi thêm lớp", C.red); } },
    updateClass: async (c) => { try { await updateRow("classes", c.id, MAPPERS.classes.toRow(c)); } catch { showToast("⚠ Lỗi khi cập nhật lớp", C.red); } },
    deleteClass: async (id) => { try { await deleteRow("classes", id); } catch { showToast("⚠ Lỗi khi xóa lớp", C.red); } },

    addStudent: async (s) => { try { await insertRow("students", { ...s, id: genId() }); } catch { showToast("⚠ Lỗi khi thêm học sinh", C.red); } },
    updateStudent: async (s) => { try { await updateRow("students", s.id, MAPPERS.students.toRow(s)); } catch { showToast("⚠ Lỗi khi cập nhật học sinh", C.red); } },
    deleteStudent: async (id) => { try { await deleteRow("students", id); } catch { showToast("⚠ Lỗi khi xóa học sinh", C.red); } },

    addRegistration: async (r) => { try { await insertRow("registrations", r); } catch { showToast("⚠ Lỗi khi đăng ký lớp", C.red); } },
    deleteRegistration: async (id) => { try { await deleteRow("registrations", id); } catch { showToast("⚠ Lỗi khi hủy đăng ký", C.red); } },

    addPayment: async (p) => { try { await insertRow("payments", p); } catch { showToast("⚠ Lỗi khi ghi nhận học phí", C.red); } },
    addPayments: async (ps) => { try { await insertRows("payments", ps); } catch { showToast("⚠ Lỗi khi tạo bản ghi học phí", C.red); } },
    updatePaymentStatus: async (id, status, paid_date) => { try { await updateRow("payments", id, { status, paid_date }); } catch { showToast("⚠ Lỗi khi cập nhật học phí", C.red); } },
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
    await deleteAll("payments"); await deleteAll("registrations"); await deleteAll("classes");
    await deleteAll("students"); await deleteAll("teachers");
    await insertRows("teachers", dataset.teachers);
    await insertRows("classes", dataset.classes);
    await insertRows("students", dataset.students);
    await insertRows("registrations", dataset.registrations);
    await insertRows("payments", dataset.payments);
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
          const info = `📂 ${file.name}\n\n• ${parsed.teachers.length} giáo viên\n• ${parsed.classes.length} lớp học\n• ${parsed.students.length} học sinh\n• ${parsed.registrations.length} đăng ký\n• ${parsed.payments.length} bản ghi học phí\n\n⚠ Dữ liệu hiện tại (trên mọi thiết bị) sẽ bị ghi đè. Tiếp tục?`;
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
        <GraduationCap size={52} color={C.amber} style={{ margin: "0 auto 12px", display: "block" }} />
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
            <div style={{ background: C.amber, borderRadius: 10, padding: 8, display: "flex" }}><GraduationCap size={20} color="#fff" /></div>
            <div><div style={{ color: "#fff", fontWeight: 800, fontSize: 19, letterSpacing: -0.5 }}>FOSTER</div>
            <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11 }}>Trung tâm dạy thêm</div></div>
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
            <button onClick={importJSON} title="Khôi phục từ file backup JSON" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.8)", fontSize: 12, fontWeight: 600 }}>
              <Upload size={13} />Import
            </button>
          </div>
          <button onClick={resetToSample} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.25)", fontSize: 11, textAlign: "left", padding: "4px 0" }}>↺ Reset dữ liệu mẫu</button>
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
          {tab === "classes" && <ClassesView data={data} api={api} />}
          {tab === "students" && <StudentsView data={data} api={api} />}
          {tab === "teachers" && <TeachersView data={data} api={api} />}
          {tab === "payments" && <PaymentsView data={data} api={api} />}
          {tab === "reports" && <ReportsView data={data} />}
        </div>
      </div>
    </div>
  );
}
