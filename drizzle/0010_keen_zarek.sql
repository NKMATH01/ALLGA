DO $$ BEGIN
 IF (SELECT count(*) FROM "ai_reports" WHERE "weak_areas" IS NOT NULL OR "recommendations" IS NOT NULL OR "expected_grade" IS NOT NULL) > 0
    OR (SELECT count(*) FROM "exams" WHERE "exam_file_url" IS NOT NULL) > 0 THEN
   RAISE EXCEPTION 'D-8 guard: dropping columns that still hold data';
 END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_attempts_distribution_id_idx" ON "exam_attempts" USING btree ("distribution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_parents_parent_id_idx" ON "student_parents" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "ai_reports" DROP COLUMN IF EXISTS "weak_areas";--> statement-breakpoint
ALTER TABLE "ai_reports" DROP COLUMN IF EXISTS "recommendations";--> statement-breakpoint
ALTER TABLE "ai_reports" DROP COLUMN IF EXISTS "expected_grade";--> statement-breakpoint
ALTER TABLE "exams" DROP COLUMN IF EXISTS "exam_file_url";