-- Foster Center — schema (đã áp dụng sẵn lên project Supabase, file này chỉ để tham khảo/backup)
create table teachers (
  id text primary key,
  name text not null,
  phone text,
  subject text,
  email text,
  join_date date,
  created_at timestamptz default now()
);

create table classes (
  id text primary key,
  name text not null,
  subject text,
  teacher_id text references teachers(id) on delete set null,
  days text[] default '{}',
  start_time text,
  end_time text,
  room text,
  max_students int default 20,
  monthly_fee numeric default 0,
  status text default 'active',
  created_at timestamptz default now()
);

create table students (
  id text primary key,
  name text not null,
  phone text,
  parent_name text,
  parent_phone text,
  grade text,
  address text,
  join_date date,
  created_at timestamptz default now()
);

create table registrations (
  id text primary key,
  student_id text references students(id) on delete cascade,
  class_id text references classes(id) on delete cascade,
  start_date date,
  status text default 'active',
  created_at timestamptz default now()
);

create table payments (
  id text primary key,
  student_id text references students(id) on delete cascade,
  class_id text references classes(id) on delete cascade,
  month int not null,
  year int not null,
  amount numeric default 0,
  paid_date date,
  status text default 'unpaid',
  created_at timestamptz default now()
);

create index idx_classes_teacher on classes(teacher_id);
create index idx_reg_student on registrations(student_id);
create index idx_reg_class on registrations(class_id);
create index idx_pay_student on payments(student_id);
create index idx_pay_class on payments(class_id);
create index idx_pay_month_year on payments(month, year);

alter table teachers enable row level security;
alter table classes enable row level security;
alter table students enable row level security;
alter table registrations enable row level security;
alter table payments enable row level security;

create policy "allow all teachers" on teachers for all using (true) with check (true);
create policy "allow all classes" on classes for all using (true) with check (true);
create policy "allow all students" on students for all using (true) with check (true);
create policy "allow all registrations" on registrations for all using (true) with check (true);
create policy "allow all payments" on payments for all using (true) with check (true);

alter publication supabase_realtime add table teachers;
alter publication supabase_realtime add table classes;
alter publication supabase_realtime add table students;
alter publication supabase_realtime add table registrations;
alter publication supabase_realtime add table payments;
