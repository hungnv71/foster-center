import { createClient } from "@supabase/supabase-js";

// Foster Center Supabase project (free tier).
// The anon/publishable key is safe to expose client-side — access is
// governed by Row Level Security policies on the database, not by
// keeping this key secret.
const SUPABASE_URL = "https://ofhkvfjygntxdfroufbd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9maGt2Zmp5Z250eGRmcm91ZmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4ODY5NjIsImV4cCI6MjA5ODQ2Mjk2Mn0.1JwDOSB0UrJPBcrowcMR30c9tqtlajUbGxPZXl3zws0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════ row (snake_case) <-> app object (camelCase) ═══════════════════
export const rowToTeacher = (r) => ({
  id: r.id, name: r.name, phone: r.phone, subject: r.subject, email: r.email, joinDate: r.join_date,
});
export const teacherToRow = (t) => ({
  id: t.id, name: t.name, phone: t.phone, subject: t.subject, email: t.email, join_date: t.joinDate || null,
});

export const rowToClass = (r) => ({
  id: r.id, name: r.name, subject: r.subject, teacherId: r.teacher_id, days: r.days || [],
  startTime: r.start_time, endTime: r.end_time, room: r.room, maxStudents: r.max_students,
  monthlyFee: Number(r.monthly_fee) || 0, status: r.status,
});
export const classToRow = (c) => ({
  id: c.id, name: c.name, subject: c.subject, teacher_id: c.teacherId || null, days: c.days,
  start_time: c.startTime, end_time: c.endTime, room: c.room, max_students: c.maxStudents,
  monthly_fee: c.monthlyFee, status: c.status,
});

export const rowToStudent = (r) => ({
  id: r.id, name: r.name, phone: r.phone, parentName: r.parent_name, parentPhone: r.parent_phone,
  grade: r.grade, address: r.address, joinDate: r.join_date,
});
export const studentToRow = (s) => ({
  id: s.id, name: s.name, phone: s.phone, parent_name: s.parentName, parent_phone: s.parentPhone,
  grade: s.grade, address: s.address, join_date: s.joinDate || null,
});

export const rowToReg = (r) => ({
  id: r.id, studentId: r.student_id, classId: r.class_id, startDate: r.start_date, status: r.status,
});
export const regToRow = (r) => ({
  id: r.id, student_id: r.studentId, class_id: r.classId, start_date: r.startDate || null, status: r.status,
});

export const rowToPayment = (r) => ({
  id: r.id, studentId: r.student_id, classId: r.class_id, month: r.month, year: r.year,
  amount: Number(r.amount) || 0, paidDate: r.paid_date, status: r.status,
});
export const paymentToRow = (p) => ({
  id: p.id, student_id: p.studentId, class_id: p.classId, month: p.month, year: p.year,
  amount: p.amount, paid_date: p.paidDate || null, status: p.status,
});

export const rowToAttendance = (r) => ({
  id: r.id, classId: r.class_id, studentId: r.student_id, date: r.date, status: r.status, note: r.note || "",
});
export const attendanceToRow = (a) => ({
  id: a.id, class_id: a.classId, student_id: a.studentId, date: a.date, status: a.status, note: a.note || null,
});

export const MAPPERS = {
  teachers: { toApp: rowToTeacher, toRow: teacherToRow },
  classes: { toApp: rowToClass, toRow: classToRow },
  students: { toApp: rowToStudent, toRow: studentToRow },
  registrations: { toApp: rowToReg, toRow: regToRow },
  payments: { toApp: rowToPayment, toRow: paymentToRow },
  attendance: { toApp: rowToAttendance, toRow: attendanceToRow },
};

// ═══════════════════ generic CRUD ═══════════════════
export async function insertRow(table, appObj) {
  const row = MAPPERS[table].toRow(appObj);
  const { error } = await supabase.from(table).insert(row);
  if (error) throw error;
}
export async function insertRows(table, appObjs) {
  if (!appObjs.length) return;
  const rows = appObjs.map(MAPPERS[table].toRow);
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw error;
}
export async function updateRow(table, id, patch) {
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) throw error;
}
export async function upsertRows(table, appObjs, conflictCols) {
  if (!appObjs.length) return;
  const rows = appObjs.map(MAPPERS[table].toRow);
  const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictCols });
  if (error) throw error;
}
export async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}
export async function deleteAll(table) {
  const { error } = await supabase.from(table).delete().neq("id", "__none__");
  if (error) throw error;
}
export async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw error;
  return data.map(MAPPERS[table].toApp);
}
