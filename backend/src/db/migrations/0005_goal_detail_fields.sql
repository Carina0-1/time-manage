--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "background" text;
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "success_criteria" text;
--> statement-breakpoint
ALTER TABLE "phases" ADD COLUMN "reason" text;
--> statement-breakpoint
ALTER TABLE "phases" ADD COLUMN "completion_criteria" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "expected_output" text;
