ALTER TABLE "exam_distributions" ADD COLUMN "target_kind" text DEFAULT 'branch' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_distributions" ADD CONSTRAINT "exam_distributions_target_kind_check" CHECK ("target_kind" IN ('branch','class','students'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
UPDATE "exam_distributions" d SET "target_kind" = CASE
  WHEN d."class_id" IS NOT NULL THEN 'class'
  WHEN EXISTS (SELECT 1 FROM "distribution_students" ds WHERE ds."distribution_id" = d."id") THEN 'students'
  ELSE 'branch' END;
