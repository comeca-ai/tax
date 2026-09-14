CREATE TABLE `poc_configuracao` (
  `empresa_id` bigint unsigned NOT NULL PRIMARY KEY,
  `configuracao` json NOT NULL,
  `historico` json NOT NULL,
  CONSTRAINT `poc_configuracao_empresa_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`)
);
--> statement-breakpoint
CREATE TABLE `poc_campo` (
  `colaborador_id` bigint unsigned NOT NULL PRIMARY KEY,
  `empresa_id` bigint unsigned NOT NULL,
  `estado` json NOT NULL,
  `atualizado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `poc_campo_empresa_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
  CONSTRAINT `poc_campo_colaborador_tenant_fk` FOREIGN KEY (`empresa_id`, `colaborador_id`) REFERENCES `colaboradores` (`empresa_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `poc_documentos` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `empresa_id` bigint unsigned NOT NULL,
  `colaborador_id` bigint unsigned NOT NULL,
  `chave` varchar(44),
  `hash` varchar(64) NOT NULL,
  UNIQUE KEY `poc_documentos_chave_uq` (`empresa_id`, `chave`),
  UNIQUE KEY `poc_documentos_hash_uq` (`empresa_id`, `hash`),
  CONSTRAINT `poc_documentos_colaborador_tenant_fk` FOREIGN KEY (`empresa_id`, `colaborador_id`) REFERENCES `colaboradores` (`empresa_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `poc_pagamentos` (
  `despesa_id` bigint unsigned NOT NULL PRIMARY KEY,
  `empresa_id` bigint unsigned NOT NULL,
  `usuario_id` bigint unsigned NOT NULL,
  `referencia` varchar(128) NOT NULL,
  `pago_em` timestamp NOT NULL,
  `registrado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `poc_pagamentos_despesa_tenant_fk` FOREIGN KEY (`empresa_id`, `despesa_id`) REFERENCES `despesas` (`empresa_id`, `id`),
  CONSTRAINT `poc_pagamentos_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
);
