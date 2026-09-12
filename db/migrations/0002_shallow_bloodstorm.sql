CREATE TABLE `convites` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`perfil` enum('admin','cliente','revisor') NOT NULL DEFAULT 'cliente',
	`token` varchar(128) NOT NULL,
	`status` enum('pendente','aceito','revogado') NOT NULL DEFAULT 'pendente',
	`created_by_id` bigint unsigned NOT NULL,
	`expires_at` timestamp NOT NULL,
	`accepted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `convites_id` PRIMARY KEY(`id`),
	CONSTRAINT `convites_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `convites` ADD CONSTRAINT `convites_created_by_id_usuarios_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `usuarios`(`id`) ON DELETE no action ON UPDATE no action;