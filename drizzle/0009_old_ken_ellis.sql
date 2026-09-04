ALTER TABLE "ai_reports" ADD COLUMN "status" text DEFAULT 'processing' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_reports" ADD COLUMN "failure_reason" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_status_check" CHECK ("status" IN ('processing','completed','failed'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
UPDATE "ai_reports" SET "status" = 'completed' WHERE "html_content" IS NOT NULL;
