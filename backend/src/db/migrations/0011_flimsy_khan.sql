CREATE TABLE IF NOT EXISTS "dimension_option_states" (
	"id" text PRIMARY KEY NOT NULL,
	"option_id" text NOT NULL,
	"state_id" text NOT NULL,
	"user_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dimension_states" (
	"id" text PRIMARY KEY NOT NULL,
	"dimension_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dimension_option_states" ADD CONSTRAINT "dimension_option_states_option_id_dimension_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."dimension_options"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dimension_option_states" ADD CONSTRAINT "dimension_option_states_state_id_dimension_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."dimension_states"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dimension_option_states" ADD CONSTRAINT "dimension_option_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dimension_states" ADD CONSTRAINT "dimension_states_dimension_id_dimensions_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."dimensions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dimension_states" ADD CONSTRAINT "dimension_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
