CREATE UNIQUE INDEX `notas_fiscais_empresa_id_id_uq` ON `notas_fiscais` (`empresa_id`, `id`);
--> statement-breakpoint
CREATE TABLE `fiscal_configuracao` (
 `empresa_id` bigint unsigned NOT NULL PRIMARY KEY,
 `habilitada` boolean NOT NULL DEFAULT false,
 `versao` int unsigned NOT NULL DEFAULT 0,
 `alterada_por` bigint unsigned NOT NULL,
 `alterada_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT `fiscal_configuracao_empresa_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
 CONSTRAINT `fiscal_configuracao_usuario_fk` FOREIGN KEY (`alterada_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB;
--> statement-breakpoint
CREATE TABLE `fiscal_documentos` (
 `nota_fiscal_id` bigint unsigned NOT NULL PRIMARY KEY,
 `empresa_id` bigint unsigned NOT NULL,
 `usuario_id` bigint unsigned NULL,
 `colaborador_id` bigint unsigned NULL,
 `chave` varchar(44) NULL,
 `chave_estado` varchar(16) NOT NULL,
 `hash` varchar(64) NOT NULL,
 `criada_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `fiscal_documentos_nota_tenant_fk` FOREIGN KEY (`empresa_id`, `nota_fiscal_id`) REFERENCES `notas_fiscais` (`empresa_id`, `id`),
 CONSTRAINT `fiscal_documentos_empresa_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
 CONSTRAINT `fiscal_documentos_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
 CONSTRAINT `fiscal_documentos_colaborador_tenant_fk` FOREIGN KEY (`empresa_id`, `colaborador_id`) REFERENCES `colaboradores` (`empresa_id`, `id`)
) ENGINE=InnoDB;
--> statement-breakpoint
CREATE TABLE `fiscal_verificacoes` (
 `nota_fiscal_id` bigint unsigned NOT NULL PRIMARY KEY,
 `empresa_id` bigint unsigned NOT NULL,
 `usuario_id` bigint unsigned NULL,
 `colaborador_id` bigint unsigned NULL,
 `orcamento_id` varchar(64) NULL,
 `id` varchar(36) NOT NULL,
 `resultado` json NOT NULL,
 `criada_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `concluida_em` timestamp NULL,
 CONSTRAINT `fiscal_verificacoes_nota_tenant_fk` FOREIGN KEY (`empresa_id`, `nota_fiscal_id`) REFERENCES `notas_fiscais` (`empresa_id`, `id`),
 CONSTRAINT `fiscal_verificacoes_empresa_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
 CONSTRAINT `fiscal_verificacoes_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
 CONSTRAINT `fiscal_verificacoes_colaborador_tenant_fk` FOREIGN KEY (`empresa_id`, `colaborador_id`) REFERENCES `colaboradores` (`empresa_id`, `id`),
 CONSTRAINT `fiscal_verificacoes_orcamento_fk` FOREIGN KEY (`orcamento_id`) REFERENCES `nfe_io_orcamentos` (`id`)
) ENGINE=InnoDB;
