CREATE TABLE `clips` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`hook` text NOT NULL,
	`caption` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`score` integer NOT NULL,
	`file_name` text NOT NULL,
	`poster_file_name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clips_project_idx` ON `clips` (`project_id`);--> statement-breakpoint
CREATE INDEX `clips_user_idx` ON `clips` (`user_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`source_url` text NOT NULL,
	`source_platform` text DEFAULT 'YouTube' NOT NULL,
	`source_video_id` text NOT NULL,
	`source_duration_seconds` integer DEFAULT 0 NOT NULL,
	`requested_analysis_minutes` integer NOT NULL,
	`analysis_seconds` integer DEFAULT 0 NOT NULL,
	`requested_clip_seconds` integer DEFAULT 60 NOT NULL,
	`format` text DEFAULT '9:16' NOT NULL,
	`framing` text DEFAULT 'fit' NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`caption_style` text DEFAULT 'impact' NOT NULL,
	`thumbnail_url` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text DEFAULT 'Aguardando processador' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`credits_charged` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_user_idx` ON `projects` (`user_id`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE INDEX `projects_created_idx` ON `projects` (`created_at`);