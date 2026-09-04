DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_classes" ADD CONSTRAINT "student_classes_student_class_unique" UNIQUE("student_id","class_id");
EXCEPTION
 WHEN duplicate_object OR duplicate_table THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_student_parent_unique" UNIQUE("student_id","parent_id");
EXCEPTION
 WHEN duplicate_object OR duplicate_table THEN null;
END $$;
