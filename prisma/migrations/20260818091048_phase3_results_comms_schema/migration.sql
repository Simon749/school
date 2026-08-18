-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "lockedById" TEXT,
ADD COLUMN     "reviewedById" TEXT;

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "marks_obtained" DECIMAL(5,2),
    "teacher_comment" TEXT,
    "submitted_at" TIMESTAMP(3),
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubric_scores" (
    "id" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "sub_strand_id" TEXT NOT NULL,
    "score" VARCHAR(5) NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rubric_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_reports" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "stream_id" TEXT NOT NULL,
    "class_teacher_comment" TEXT,
    "principal_comment" TEXT,
    "overall_score" DECIMAL(5,2),
    "position" INTEGER,
    "out_of" INTEGER,
    "total_lessons" INTEGER,
    "lessons_attended" INTEGER,
    "conduct" VARCHAR(30),
    "generated_at" TIMESTAMP(3),
    "pdf_url" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "term_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_artefacts" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "learning_area_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "artefact_type" VARCHAR(30) NOT NULL,
    "file_url" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_artefacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_assessment_results_student" ON "assessment_results"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_assessment_result_unique" ON "assessment_results"("assessment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_rubric_score_unique" ON "rubric_scores"("result_id", "sub_strand_id");

-- CreateIndex
CREATE INDEX "idx_term_reports_school_term" ON "term_reports"("school_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_term_report_unique" ON "term_reports"("student_id", "term_id");

-- CreateIndex
CREATE INDEX "idx_portfolio_artefacts_student_term" ON "portfolio_artefacts"("student_id", "term_id");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_scores" ADD CONSTRAINT "rubric_scores_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "assessment_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_scores" ADD CONSTRAINT "rubric_scores_sub_strand_id_fkey" FOREIGN KEY ("sub_strand_id") REFERENCES "sub_strands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_reports" ADD CONSTRAINT "term_reports_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_reports" ADD CONSTRAINT "term_reports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_reports" ADD CONSTRAINT "term_reports_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_reports" ADD CONSTRAINT "term_reports_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_artefacts" ADD CONSTRAINT "portfolio_artefacts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_artefacts" ADD CONSTRAINT "portfolio_artefacts_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_artefacts" ADD CONSTRAINT "portfolio_artefacts_learning_area_id_fkey" FOREIGN KEY ("learning_area_id") REFERENCES "learning_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_artefacts" ADD CONSTRAINT "portfolio_artefacts_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
