CREATE TABLE IF NOT EXISTS "distribution_students" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"distribution_id" varchar(255) NOT NULL,
	"student_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "distribution_students" ADD CONSTRAINT "distribution_students_distribution_id_exam_distributions_id_fk" FOREIGN KEY ("distribution_id") REFERENCES "public"."exam_distributions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "distribution_students" ADD CONSTRAINT "distribution_students_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
