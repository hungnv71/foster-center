import { createClient } from "@supabase/supabase-js";

// Foster Center Supabase project (free tier).
// The anon/publishable key is safe to expose client-side — access is
// governed by Row Level Security policies on the database, not by
// keeping this key secret.
const SUPABASE_URL = "https://ofhkvfjygntxdfroufbd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9maGt2Zmp5Z250eGRmcm91ZmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4ODY5NjIsImV4cCI6MjA5ODQ2Mjk2Mn0.1JwDOSB0UrJPBcrowcMR30c9tqtlajUbGxPZXl3zws0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════ auth ═══════════════════
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export async function signOut() {
  await supabase.auth.signOut();
}
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export async function getMyProfile() {
  const { data, error } = await supabase.from("profiles").select("*").single();
  if (error) throw error;
  return data; // { id, email, role, name }
}

// ═══════════════════ row (snake_case) <-> app object (camelCase) ═══════════════════
export const rowToTeacher = (r) => ({
  id: r.id, name: r.name, phone: r.phone, subject: r.subject, email: r.email, joinDate: r.join_date,
  feePerSession: Number(r.fee_per_session) || 0,
});
export const teacherToRow = (t) => ({
  id: t.id, name: t.name, phone: t.phone, subject: t.subject, email: t.email, join_date: t.joinDate || null,
  fee_per_session: t.feePerSession || 0,
});

export const rowToClass = (r) => ({
  id: r.id, name: r.name, subject: r.subject, teacherId: r.teacher_id,
  schedule: r.schedule || [], maxStudents: r.max_students,
  feePerSession: Number(r.fee_per_session) || 0, status: r.status,
});
export const classToRow = (c) => ({
  id: c.id, name: c.name, subject: c.subject, teacher_id: c.teacherId || null,
  schedule: c.schedule || [], max_students: c.maxStudents,
  fee_per_session: c.feePerSession, status: c.status,
});

export const rowToStudent = (r) => ({
  id: r.id, name: r.name, phone: r.phone, parentName: r.parent_name, parentPhone: r.parent_phone,
  grade: r.grade, address: r.address, joinDate: r.join_date,
  parentCccd: r.parent_cccd || "", parentTaxCode: r.parent_tax_code || "",
  feePercent: r.fee_percent === null || r.fee_percent === undefined ? 100 : Number(r.fee_percent),
});
export const studentToRow = (s) => ({
  id: s.id, name: s.name, phone: s.phone, parent_name: s.parentName, parent_phone: s.parentPhone,
  grade: s.grade, address: s.address, join_date: s.joinDate || null,
  parent_cccd: s.parentCccd || null, parent_tax_code: s.parentTaxCode || null,
  fee_percent: s.feePercent ?? 100,
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
  sessionsBilled: r.sessions_billed === null || r.sessions_billed === undefined ? undefined : Number(r.sessions_billed),
});
export const paymentToRow = (p) => ({
  id: p.id, student_id: p.studentId, class_id: p.classId, month: p.month, year: p.year,
  amount: p.amount, paid_date: p.paidDate || null, status: p.status,
  sessions_billed: p.sessionsBilled ?? null,
});

export const rowToAttendance = (r) => ({
  id: r.id, classId: r.class_id, studentId: r.student_id, date: r.date, status: r.status, note: r.note || "",
  billable: r.billable !== false, overrideId: r.override_id || "",
});
export const attendanceToRow = (a) => ({
  id: a.id, class_id: a.classId, student_id: a.studentId, date: a.date, status: a.status, note: a.note || null,
  billable: a.billable !== false, override_id: a.overrideId || "",
});

export const rowToOverride = (r) => ({
  id: r.id, classId: r.class_id, originalDate: r.original_date, status: r.status,
  makeupDate: r.makeup_date, makeupStartTime: r.makeup_start_time, makeupEndTime: r.makeup_end_time,
  makeupRoom: r.makeup_room, note: r.note || "",
});
export const overrideToRow = (o) => ({
  id: o.id, class_id: o.classId, original_date: o.originalDate, status: o.status,
  makeup_date: o.makeupDate || null, makeup_start_time: o.makeupStartTime || null, makeup_end_time: o.makeupEndTime || null,
  makeup_room: o.makeupRoom || null, note: o.note || null,
});

export const rowToPayroll = (r) => ({
  id: r.id, teacherId: r.teacher_id, month: r.month, year: r.year,
  sessionsTaught: r.sessions_taught, amount: Number(r.amount) || 0, paidDate: r.paid_date, status: r.status,
});
export const payrollToRow = (p) => ({
  id: p.id, teacher_id: p.teacherId, month: p.month, year: p.year,
  sessions_taught: p.sessionsTaught, amount: p.amount, paid_date: p.paidDate || null, status: p.status,
});

export const rowToLog = (r) => ({ id: r.id, action: r.action, entity: r.entity, summary: r.summary, createdAt: r.created_at });
export const logToRow = (l) => ({ id: l.id, action: l.action, entity: l.entity, summary: l.summary });

export const MAPPERS = {
  teachers: { toApp: rowToTeacher, toRow: teacherToRow },
  classes: { toApp: rowToClass, toRow: classToRow },
  students: { toApp: rowToStudent, toRow: studentToRow },
  registrations: { toApp: rowToReg, toRow: regToRow },
  payments: { toApp: rowToPayment, toRow: paymentToRow },
  attendance: { toApp: rowToAttendance, toRow: attendanceToRow },
  payroll: { toApp: rowToPayroll, toRow: payrollToRow },
  activity_log: { toApp: rowToLog, toRow: logToRow },
  session_overrides: { toApp: rowToOverride, toRow: overrideToRow },
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
export async function deleteRows(table, ids) {
  if (!ids.length) return;
  const { error } = await supabase.from(table).delete().in("id", ids);
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
