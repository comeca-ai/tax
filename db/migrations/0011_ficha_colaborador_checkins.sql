CREATE TABLE `checkins_campo` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`empresa_id` bigint unsigned NOT NULL,
	`colaborador_id` bigint unsigned NOT NULL,
	`registrado_em` timestamp NOT NULL DEFAULT (now()),
	`latitude` double NOT NULL,
	`longitude` double NOT NULL,
	`precisao` double,
	`origem` varchar(30) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `checkins_campo_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `colaboradores` ADD `tipo_documento` enum('cpf','cnpj');--> statement-breakpoint
ALTER TABLE `colaboradores` ADD `documento` varchar(14);--> statement-breakpoint
ALTER TABLE `colaboradores` ADD `cargo` varchar(100);--> statement-breakpoint
ALTER TABLE `colaboradores` ADD `nivel_aprovacao` int;--> statement-breakpoint
ALTER TABLE `colaboradores` ADD `status_vinculo` enum('ativo','desligado') DEFAULT 'ativo' NOT NULL;--> statement-breakpoint
ALTER TABLE `colaboradores` ADD `data_admissao` date;--> statement-breakpoint
ALTER TABLE `colaboradores` ADD CONSTRAINT `colaboradores_empresa_documento_unique` UNIQUE(`empresa_id`,`documento`);--> statement-breakpoint
ALTER TABLE `checkins_campo` ADD CONSTRAINT `checkins_campo_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checkins_campo` ADD CONSTRAINT `checkins_campo_colaborador_id_colaboradores_id_fk` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checkins_campo` ADD CONSTRAINT `checkins_campo_mesma_empresa_fk` FOREIGN KEY (`empresa_id`,`colaborador_id`) REFERENCES `colaboradores`(`empresa_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `checkins_campo_colab_tempo_idx` ON `checkins_campo` (`empresa_id`,`colaborador_id`,`registrado_em`);