CREATE TABLE `colaboradores` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`empresa_id` bigint unsigned NOT NULL,
	`usuario_id` bigint unsigned,
	`nome` varchar(255) NOT NULL,
	`email` varchar(255),
	`telefone` varchar(20),
	`matricula` varchar(50),
	`centro_custo` varchar(100),
	`status_ativacao` enum('pendente','confirmado','divergencia') NOT NULL DEFAULT 'pendente',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `colaboradores_id` PRIMARY KEY(`id`),
	CONSTRAINT `colaboradores_empresa_telefone_unique` UNIQUE(`empresa_id`,`telefone`)
);
--> statement-breakpoint
CREATE TABLE `declaracoes_perfil` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`colaborador_id` bigint unsigned NOT NULL,
	`categoria` enum('combustivel','alimentacao','hospedagem','pedagio','uber','taxi') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `declaracoes_perfil_id` PRIMARY KEY(`id`),
	CONSTRAINT `declaracoes_perfil_colab_categoria_unique` UNIQUE(`colaborador_id`,`categoria`)
);
--> statement-breakpoint
CREATE TABLE `sessoes_conversa` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`telefone` varchar(20) NOT NULL,
	`colaborador_id` bigint unsigned,
	`estado` varchar(40) NOT NULL DEFAULT 'inicio',
	`contexto` json,
	`ultima_interacao_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sessoes_conversa_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessoes_conversa_telefone_unique` UNIQUE(`telefone`)
);
--> statement-breakpoint
ALTER TABLE `colaboradores` ADD CONSTRAINT `colaboradores_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `colaboradores` ADD CONSTRAINT `colaboradores_usuario_id_usuarios_id_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `declaracoes_perfil` ADD CONSTRAINT `declaracoes_perfil_colaborador_id_colaboradores_id_fk` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessoes_conversa` ADD CONSTRAINT `sessoes_conversa_colaborador_id_colaboradores_id_fk` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores`(`id`) ON DELETE no action ON UPDATE no action;