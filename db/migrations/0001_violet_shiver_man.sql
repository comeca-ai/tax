CREATE TABLE `politicas_reembolso` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`empresa_id` bigint unsigned NOT NULL,
	`arquivo_nome` varchar(255) NOT NULL,
	`arquivo_path` varchar(500),
	`texto_extraido` text,
	`regras` json NOT NULL,
	`status` enum('rascunho','ativa','inativa') NOT NULL DEFAULT 'rascunho',
	`versao` int NOT NULL DEFAULT 1,
	`confianca_extracao` enum('alta','media','baixa'),
	`campos_pendentes` json,
	`created_by_id` bigint unsigned NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `politicas_reembolso_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `despesas` ADD `politica_decisao` enum('aprovado','negado','revisao_humana');--> statement-breakpoint
ALTER TABLE `despesas` ADD `politica_motivo` text;--> statement-breakpoint
ALTER TABLE `despesas` ADD `politica_versao_aplicada` int;--> statement-breakpoint
ALTER TABLE `politicas_reembolso` ADD CONSTRAINT `politicas_reembolso_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `politicas_reembolso` ADD CONSTRAINT `politicas_reembolso_created_by_id_usuarios_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `usuarios`(`id`) ON DELETE no action ON UPDATE no action;