CREATE TABLE `resets_senha` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`token` varchar(128) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `resets_senha_id` PRIMARY KEY(`id`),
	CONSTRAINT `resets_senha_token_unique` UNIQUE(`token`)
);
