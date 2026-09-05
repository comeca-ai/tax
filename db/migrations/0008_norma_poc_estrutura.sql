-- ORDEM AJUSTADA À MÃO (única edição pós-drizzle, deliberada):
-- o drizzle emite o CREATE INDEX por ÚLTIMO, mas as 4 FKs compostas
-- REFERENCES `colaboradores`(`empresa_id`,`id`) precisam dele ANTES.
-- Sem esta ordem o MySQL devolve ER_FK_NO_INDEX_PARENT (1822), que NÃO
-- está na allowlist do apply.ts -> o container não sobe. Medido.
-- Se você regerar esta migração, mova o CREATE INDEX para o topo de novo.
-- O teste migracoes.test.ts falha se a ordem se perder.
CREATE INDEX `colaboradores_empresa_id_id_idx` ON `colaboradores` (`empresa_id`,`id`);
--> statement-breakpoint
CREATE TABLE `delegacoes_decisao` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`empresa_id` bigint unsigned NOT NULL,
	`decidiu_colaborador_id` bigint unsigned,
	`em_nome_de_colaborador_id` bigint unsigned NOT NULL,
	`decidiu_usuario_id` bigint unsigned,
	`despesa_id` bigint unsigned,
	`motivo` text,
	`decidido_em` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `delegacoes_decisao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `empresas_config` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`empresa_id` bigint unsigned NOT NULL,
	`cnpj` varchar(18),
	`tem_vale_refeicao` boolean NOT NULL DEFAULT false,
	`tem_contrato_corporativo_app` boolean NOT NULL DEFAULT false,
	`tarifa_km` double,
	`analista_id` bigint unsigned,
	`aprovador_id` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `empresas_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `empresas_config_empresa_id_unique` UNIQUE(`empresa_id`)
);
--> statement-breakpoint
CREATE TABLE `veiculos_colaborador` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`colaborador_id` bigint unsigned NOT NULL,
	`placa` varchar(10) NOT NULL,
	`motorizacao` enum('combustao','hibrido','eletrico'),
	`uf_licenciamento` varchar(2),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `veiculos_colaborador_id` PRIMARY KEY(`id`),
	CONSTRAINT `veiculos_colaborador_colab_placa_unique` UNIQUE(`colaborador_id`,`placa`)
);
--> statement-breakpoint
ALTER TABLE `colaboradores` ADD `papel_fluxo` enum('solicitante','analista','aprovador') DEFAULT 'solicitante' NOT NULL;
--> statement-breakpoint
ALTER TABLE `colaboradores` ADD `equipe` enum('interna','externa') DEFAULT 'externa' NOT NULL;
--> statement-breakpoint
ALTER TABLE `delegacoes_decisao` ADD CONSTRAINT `delegacoes_decisao_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `delegacoes_decisao` ADD CONSTRAINT `delegacoes_decisao_decidiu_usuario_id_usuarios_id_fk` FOREIGN KEY (`decidiu_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `delegacoes_decisao` ADD CONSTRAINT `delegacoes_decisao_despesa_id_despesas_id_fk` FOREIGN KEY (`despesa_id`) REFERENCES `despesas`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `delegacoes_decisao` ADD CONSTRAINT `delegacoes_decisao_decidiu_mesma_empresa_fk` FOREIGN KEY (`empresa_id`,`decidiu_colaborador_id`) REFERENCES `colaboradores`(`empresa_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `delegacoes_decisao` ADD CONSTRAINT `delegacoes_decisao_em_nome_mesma_empresa_fk` FOREIGN KEY (`empresa_id`,`em_nome_de_colaborador_id`) REFERENCES `colaboradores`(`empresa_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `empresas_config` ADD CONSTRAINT `empresas_config_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `empresas_config` ADD CONSTRAINT `empresas_config_analista_mesma_empresa_fk` FOREIGN KEY (`empresa_id`,`analista_id`) REFERENCES `colaboradores`(`empresa_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `empresas_config` ADD CONSTRAINT `empresas_config_aprovador_mesma_empresa_fk` FOREIGN KEY (`empresa_id`,`aprovador_id`) REFERENCES `colaboradores`(`empresa_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `veiculos_colaborador` ADD CONSTRAINT `veiculos_colaborador_colaborador_id_colaboradores_id_fk` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores`(`id`) ON DELETE no action ON UPDATE no action;
