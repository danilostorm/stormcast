CREATE TABLE `ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key_encrypted` text,
	`api_key_hint` text,
	`analysis_model` text DEFAULT '' NOT NULL,
	`transcription_model` text DEFAULT '' NOT NULL,
	`supports_analysis` integer DEFAULT true NOT NULL,
	`supports_transcription` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`built_in` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
