CREATE INDEX IF NOT EXISTS "classes_branch_id_idx" ON "classes" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "distribution_students_distribution_id_student_id_idx" ON "distribution_students" USING btree ("distribution_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_attempts_exam_id_idx" ON "exam_attempts" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_distributions_branch_id_idx" ON "exam_distributions" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_distributions_exam_id_idx" ON "exam_distributions" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_classes_student_id_idx" ON "student_classes" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_branch_id_idx" ON "students" USING btree ("branch_id");