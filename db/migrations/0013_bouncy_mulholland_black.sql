CREATE TABLE `whatsapp_inbox` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`provider` varchar(40) NOT NULL,
	`chave_idempotencia` varchar(64) NOT NULL,
	`tipo_evento` varchar(50) NOT NULL,
	`mensagem_id` varchar(128),
	`telefone` varchar(20),
	`payload` json NOT NULL,
	`status` varchar(30) NOT NULL DEFAULT 'pendente',
	`tentativas` int NOT NULL DEFAULT 0,
	`proxima_tentativa_at` timestamp,
	`processando_em` timestamp,
	`processado_em` timestamp,
	`ultimo_erro` varchar(500),
	`recebido_em` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_inbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_inbox_provider_chave_unique` UNIQUE(`provider`,`chave_idempotencia`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_outbox` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`provider` varchar(40) NOT NULL,
	`chave_idempotencia` varchar(64) NOT NULL,
	`empresa_id` bigint unsigned NOT NULL,
	`colaborador_id` bigint unsigned NOT NULL,
	`tipo_mensagem` varchar(50) NOT NULL,
	`template_nome` varchar(128),
	`telefone` varchar(20) NOT NULL,
	`payload` json NOT NULL,
	`status` varchar(30) NOT NULL DEFAULT 'pendente',
	`tentativas` int NOT NULL DEFAULT 0,
	`proxima_tentativa_at` timestamp,
	`processando_em` timestamp,
	`enviado_em` timestamp,
	`provider_mensagem_id` varchar(128),
	`ultimo_erro` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_outbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_outbox_provider_chave_unique` UNIQUE(`provider`,`chave_idempotencia`)
);
--> statement-breakpoint
ALTER TABLE `whatsapp_outbox` ADD CONSTRAINT `whatsapp_outbox_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_outbox` ADD CONSTRAINT `whatsapp_outbox_colaborador_id_colaboradores_id_fk` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_outbox` ADD CONSTRAINT `whatsapp_outbox_empresa_colaborador_fk` FOREIGN KEY (`empresa_id`,`colaborador_id`) REFERENCES `colaboradores`(`empresa_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `whatsapp_inbox_processamento_idx` ON `whatsapp_inbox` (`status`,`proxima_tentativa_at`);--> statement-breakpoint
CREATE INDEX `whatsapp_inbox_mensagem_idx` ON `whatsapp_inbox` (`provider`,`mensagem_id`);--> statement-breakpoint
CREATE INDEX `whatsapp_outbox_processamento_idx` ON `whatsapp_outbox` (`status`,`proxima_tentativa_at`);--> statement-breakpoint
CREATE INDEX `whatsapp_outbox_provider_mensagem_idx` ON `whatsapp_outbox` (`provider`,`provider_mensagem_id`);--> statement-breakpoint
CREATE INDEX `whatsapp_outbox_colaborador_idx` ON `whatsapp_outbox` (`empresa_id`,`colaborador_id`);