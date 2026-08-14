-- CreateTable
CREATE TABLE "terms" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "term_number" INTEGER NOT NULL,
    "name" VARCHAR(50),
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "mid_term_start" DATE,
    "mid_term_end" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_calendar_days" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "term_id" TEXT,
    "date" DATE NOT NULL,
    "day_type" VARCHAR(30) NOT NULL,
    "event_name" VARCHAR(100),
    "timetable_type" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_calendar_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "level" INTEGER NOT NULL,
    "cbc_stage" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streams" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "grade_id" TEXT NOT NULL,
    "name" VARCHAR(10) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 40,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "tsc_number" VARCHAR(20),
    "employment_type" VARCHAR(20) NOT NULL DEFAULT 'bom',
    "specialisation" VARCHAR(200),
    "is_class_teacher" BOOLEAN NOT NULL DEFAULT false,
    "class_teacher_stream_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "nemis_number" VARCHAR(20) NOT NULL,
    "admission_number" VARCHAR(20),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE,
    "gender" VARCHAR(10),
    "stream_id" TEXT NOT NULL,
    "enrollment_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_boarding" BOOLEAN NOT NULL DEFAULT false,
    "photo_url" TEXT,
    "medical_notes" TEXT,
    "transition_score" DECIMAL(5,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "leaving_date" DATE,
    "leaving_reason" VARCHAR(50),
    "leaving_certificate_ref" VARCHAR(50),
    "previous_school" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "relationship" VARCHAR(30),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "can_pickup" BOOLEAN NOT NULL DEFAULT true,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "has_restricted_access" BOOLEAN NOT NULL DEFAULT false,
    "access_restriction_note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deactivated_at" TIMESTAMP(3),
    "deactivated_by" TEXT,
    "deactivation_reason" VARCHAR(50),
    "previous_phones" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_areas" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20),
    "cbc_stage" VARCHAR(20),
    "is_jss_area" BOOLEAN NOT NULL DEFAULT false,
    "color" VARCHAR(7),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strands" (
    "id" TEXT NOT NULL,
    "learning_area_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "strands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_strands" (
    "id" TEXT NOT NULL,
    "strand_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sub_strands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_periods" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "is_break" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "stream_id" TEXT NOT NULL,
    "learning_area_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "room" VARCHAR(50),
    "is_double_lesson" BOOLEAN NOT NULL DEFAULT false,
    "second_period_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_qr_tokens" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "token" VARCHAR(100) NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classroom_qr_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_attendance" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "slot_id" TEXT,
    "date" DATE NOT NULL,
    "checked_in_at" TIMESTAMP(3),
    "checked_out_at" TIMESTAMP(3),
    "check_in_lat" DECIMAL(10,8),
    "check_in_lng" DECIMAL(11,8),
    "geofence_passed" BOOLEAN NOT NULL DEFAULT false,
    "qr_scanned" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "minutes_late" INTEGER,
    "absence_reason" VARCHAR(50),
    "lesson_notes" TEXT,
    "substitute_teacher_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_daily_attendance" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "arrived_at" TIMESTAMP(3),
    "departed_at" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'absent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_daily_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_lesson_attendance" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "slot_id" TEXT,
    "date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "absence_reason" VARCHAR(50),
    "marked_by" TEXT NOT NULL,
    "parent_notified" BOOLEAN NOT NULL DEFAULT false,
    "notification_held" BOOLEAN NOT NULL DEFAULT false,
    "notification_job_id" VARCHAR(100),
    "notification_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_lesson_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "school_id" TEXT,
    "actor_id" TEXT,
    "action" VARCHAR(100) NOT NULL,
    "table_name" VARCHAR(50) NOT NULL,
    "record_id" UUID,
    "old_data" JSONB,
    "new_data" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_terms_school" ON "terms"("school_id");

-- CreateIndex
CREATE INDEX "idx_calendar_days" ON "school_calendar_days"("school_id", "date", "day_type");

-- CreateIndex
CREATE UNIQUE INDEX "idx_calendar_day_unique" ON "school_calendar_days"("school_id", "date");

-- CreateIndex
CREATE INDEX "idx_grades_school" ON "grades"("school_id");

-- CreateIndex
CREATE INDEX "idx_streams_school" ON "streams"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_stream_grade_name" ON "streams"("grade_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_user_id_key" ON "teachers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_tsc_number_key" ON "teachers"("tsc_number");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_class_teacher_stream_id_key" ON "teachers"("class_teacher_stream_id");

-- CreateIndex
CREATE INDEX "idx_teachers_school" ON "teachers"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_nemis_number_key" ON "students"("nemis_number");

-- CreateIndex
CREATE INDEX "idx_students_school" ON "students"("school_id");

-- CreateIndex
CREATE INDEX "idx_students_stream" ON "students"("stream_id");

-- CreateIndex
CREATE INDEX "idx_students_nemis" ON "students"("nemis_number");

-- CreateIndex
CREATE INDEX "idx_students_status" ON "students"("school_id", "status");

-- CreateIndex
CREATE INDEX "idx_guardians_student" ON "guardians"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_guardian_unique" ON "guardians"("user_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_learning_areas_school" ON "learning_areas"("school_id");

-- CreateIndex
CREATE INDEX "idx_strands_learning_area" ON "strands"("learning_area_id");

-- CreateIndex
CREATE INDEX "idx_sub_strands_strand" ON "sub_strands"("strand_id");

-- CreateIndex
CREATE INDEX "idx_timetable_periods_school" ON "timetable_periods"("school_id");

-- CreateIndex
CREATE INDEX "idx_slots_teacher" ON "timetable_slots"("teacher_id", "term_id");

-- CreateIndex
CREATE INDEX "idx_slots_stream" ON "timetable_slots"("stream_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_slots_teacher_unique" ON "timetable_slots"("teacher_id", "period_id", "day_of_week", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_slots_stream_unique" ON "timetable_slots"("stream_id", "period_id", "day_of_week", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "classroom_qr_tokens_token_key" ON "classroom_qr_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_qr_tokens_school" ON "classroom_qr_tokens"("school_id");

-- CreateIndex
CREATE INDEX "idx_qr_tokens_slot" ON "classroom_qr_tokens"("slot_id");

-- CreateIndex
CREATE INDEX "idx_teacher_att_date" ON "teacher_attendance"("teacher_id", "date");

-- CreateIndex
CREATE INDEX "idx_teacher_att_status" ON "teacher_attendance"("school_id", "date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "idx_teacher_att_unique" ON "teacher_attendance"("teacher_id", "slot_id", "date");

-- CreateIndex
CREATE INDEX "idx_student_daily_att_student" ON "student_daily_attendance"("student_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "idx_student_daily_att_unique" ON "student_daily_attendance"("student_id", "date");

-- CreateIndex
CREATE INDEX "idx_student_lesson_att_date" ON "student_lesson_attendance"("student_id", "date");

-- CreateIndex
CREATE INDEX "idx_student_lesson_att_slot" ON "student_lesson_attendance"("slot_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "idx_student_lesson_att_unique" ON "student_lesson_attendance"("student_id", "slot_id", "date");

-- CreateIndex
CREATE INDEX "idx_audit_record" ON "audit_logs"("table_name", "record_id");

-- CreateIndex
CREATE INDEX "idx_audit_actor" ON "audit_logs"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_calendar_days" ADD CONSTRAINT "school_calendar_days_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_calendar_days" ADD CONSTRAINT "school_calendar_days_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streams" ADD CONSTRAINT "streams_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streams" ADD CONSTRAINT "streams_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_class_teacher_stream_id_fkey" FOREIGN KEY ("class_teacher_stream_id") REFERENCES "streams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_areas" ADD CONSTRAINT "learning_areas_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strands" ADD CONSTRAINT "strands_learning_area_id_fkey" FOREIGN KEY ("learning_area_id") REFERENCES "learning_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_strands" ADD CONSTRAINT "sub_strands_strand_id_fkey" FOREIGN KEY ("strand_id") REFERENCES "strands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_learning_area_id_fkey" FOREIGN KEY ("learning_area_id") REFERENCES "learning_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "timetable_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_second_period_id_fkey" FOREIGN KEY ("second_period_id") REFERENCES "timetable_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_qr_tokens" ADD CONSTRAINT "classroom_qr_tokens_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_qr_tokens" ADD CONSTRAINT "classroom_qr_tokens_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "timetable_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "timetable_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_substitute_teacher_id_fkey" FOREIGN KEY ("substitute_teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_daily_attendance" ADD CONSTRAINT "student_daily_attendance_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_daily_attendance" ADD CONSTRAINT "student_daily_attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_lesson_attendance" ADD CONSTRAINT "student_lesson_attendance_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_lesson_attendance" ADD CONSTRAINT "student_lesson_attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_lesson_attendance" ADD CONSTRAINT "student_lesson_attendance_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "timetable_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
