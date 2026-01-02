ALTER TABLE "exam_distributions" ADD COLUMN "parent_distribution_id" varchar(255);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_distributions" ADD CONSTRAINT "exam_distributions_parent_distribution_id_exam_distributions_id_fk" FOREIGN KEY ("parent_distribution_id") REFERENCES "public"."exam_distributions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
