CREATE TABLE `admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `admin_audit_created_idx` ON `admin_audit` (`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_admin_idx` ON `admin_audit` (`admin_id`);--> statement-breakpoint
CREATE TABLE `credit_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`admin_id` text,
	`amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `credit_history_user_idx` ON `credit_history` (`user_id`);--> statement-breakpoint
CREATE INDEX `credit_history_created_idx` ON `credit_history` (`created_at`);--> statement-breakpoint
CREATE TABLE `processor_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `render_options` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `force_password_change` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `plan` text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `monthly_credit_limit` integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `max_active_projects` integer DEFAULT 1 NOT NULL;