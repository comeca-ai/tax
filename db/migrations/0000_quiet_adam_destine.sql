CREATE TABLE `cnaes_secundarios` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`empresa_id` bigint unsigned NOT NULL,
	`cnae` varchar(10) NOT NULL,
	CONSTRAINT `cnaes_secundarios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `creditos_apurados` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`despesa_id` bigint unsigned NOT NULL,
	`tributo` enum('pis_cofins','icms','cbs','ibs','irpj_csll') NOT NULL,
	`tipo_beneficio` enum('credito','dedutibilidade') NOT NULL,
	`valor` double NOT NULL,
	`status` enum('apurado','em_revisao','confirmado','rejeitado') NOT NULL DEFAULT 'apurado',
	`memorial` text,
	`regra_versao` varchar(20) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `creditos_apurados_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `despesas` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`empresa_id` bigint unsigned NOT NULL,
	`nota_fiscal_id` bigint unsigned NOT NULL,
	`veiculo_id` bigint unsigned,
	`categoria` enum('combustivel','alimentacao','hospedagem','pedagio','uber','taxi') NOT NULL,
	`colaborador` varchar(255),
	`centro_custo` varchar(255),
	`motivo_deslocamento` text,
	`km_comercial` double NOT NULL DEFAULT 0,
	`km_nao_comercial` double NOT NULL DEFAULT 0,
	`litros` double,
	`valor_fiscal` double NOT NULL DEFAULT 0,
	`valor_reembolsavel` double NOT NULL DEFAULT 0,
	`confianca` enum('alta','media','baixa','vedado') NOT NULL DEFAULT 'baixa',
	`status` enum('pendente','em_revisao','aprovada','rejeitada') NOT NULL DEFAULT 'pendente',
	`memorial` text,
	`motivo_revisao` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `despesas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `empresas` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`usuario_id` bigint unsigned NOT NULL,
	`razao_social` varchar(255) NOT NULL,
	`cnpj` varchar(18) NOT NULL,
	`cnae_principal` varchar(10) NOT NULL,
	`regime_tributario` enum('lucro_real','lucro_presumido','simples_nacional') NOT NULL,
	`uf` varchar(2) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `empresas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidencias_documentais` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`despesa_id` bigint unsigned NOT NULL,
	`tipo` varchar(100) NOT NULL,
	`arquivo_nome` varchar(255) NOT NULL,
	`arquivo_mime` varchar(100),
	`arquivo_base64` text,
	`observacao` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidencias_documentais_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `log_auditoria` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`usuario_id` bigint unsigned,
	`empresa_id` bigint unsigned,
	`acao` varchar(100) NOT NULL,
	`entidade` varchar(100) NOT NULL,
	`entidade_id` bigint unsigned,
	`detalhes` text,
	`regra_versao` varchar(20),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `log_auditoria_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notas_fiscais` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`empresa_id` bigint unsigned NOT NULL,
	`cnpj_emitente` varchar(18),
	`cfop` varchar(10),
	`ncm` varchar(10),
	`cst` varchar(10),
	`valor` double,
	`data_fato_gerador` date,
	`arquivo_nome` varchar(255),
	`arquivo_mime` varchar(100),
	`arquivo_base64` text,
	`origem` enum('ocr','manual') NOT NULL DEFAULT 'manual',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notas_fiscais_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `regras_elegibilidade` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`cnae_padrao` varchar(12) NOT NULL,
	`categoria` enum('combustivel','alimentacao','hospedagem','pedagio','uber','taxi') NOT NULL,
	`tributo` enum('pis_cofins','icms','cbs','ibs','irpj_csll') NOT NULL,
	`tipo_beneficio` enum('credito','dedutibilidade') NOT NULL,
	`confianca` enum('alta','media','baixa','vedado') NOT NULL DEFAULT 'baixa',
	`aliquota` double,
	`base_legal` text,
	`vigencia_inicio` date NOT NULL,
	`vigencia_fim` date,
	`versao` varchar(20) NOT NULL DEFAULT '1.1',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `regras_elegibilidade_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`nome` varchar(255) NOT NULL,
	`senha_hash` varchar(255) NOT NULL,
	`perfil` enum('admin','cliente','revisor') NOT NULL DEFAULT 'cliente',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `usuarios_id` PRIMARY KEY(`id`),
	CONSTRAINT `usuarios_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `veiculos` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`empresa_id` bigint unsigned NOT NULL,
	`placa` varchar(10) NOT NULL,
	`renavam` varchar(20),
	`km_por_litro_declarado` double NOT NULL,
	`tarifa_reembolso_km` double NOT NULL DEFAULT 0,
	`descricao` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `veiculos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cnaes_secundarios` ADD CONSTRAINT `cnaes_secundarios_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creditos_apurados` ADD CONSTRAINT `creditos_apurados_despesa_id_despesas_id_fk` FOREIGN KEY (`despesa_id`) REFERENCES `despesas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `despesas` ADD CONSTRAINT `despesas_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `despesas` ADD CONSTRAINT `despesas_nota_fiscal_id_notas_fiscais_id_fk` FOREIGN KEY (`nota_fiscal_id`) REFERENCES `notas_fiscais`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `despesas` ADD CONSTRAINT `despesas_veiculo_id_veiculos_id_fk` FOREIGN KEY (`veiculo_id`) REFERENCES `veiculos`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `empresas` ADD CONSTRAINT `empresas_usuario_id_usuarios_id_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidencias_documentais` ADD CONSTRAINT `evidencias_documentais_despesa_id_despesas_id_fk` FOREIGN KEY (`despesa_id`) REFERENCES `despesas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `log_auditoria` ADD CONSTRAINT `log_auditoria_usuario_id_usuarios_id_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `log_auditoria` ADD CONSTRAINT `log_auditoria_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notas_fiscais` ADD CONSTRAINT `notas_fiscais_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `veiculos` ADD CONSTRAINT `veiculos_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE no action ON UPDATE no action;