DO $$ BEGIN
 ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_student_distribution_unique" UNIQUE("student_id","distribution_id");
EXCEPTION
 WHEN duplicate_object OR duplicate_table THEN null;
END $$;