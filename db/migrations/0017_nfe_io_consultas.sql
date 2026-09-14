CREATE TABLE `nfe_io_orcamentos` (
  `id` varchar(64) NOT NULL PRIMARY KEY,
  `limite` int unsigned NOT NULL DEFAULT 0,
  `usadas` int unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `nfe_io_consultas` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `orcamento_id` varchar(64) NOT NULL,
  `empresa_id` bigint unsigned NOT NULL,
  `nota_fiscal_id` bigint unsigned NOT NULL,
  `usuario_id` bigint unsigned NOT NULL,
  `chave_hash` varchar(64) NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'reservada',
  `resultado` json,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `concluida_em` timestamp NULL,
  INDEX `nfe_io_consultas_orcamento_idx` (`orcamento_id`),
  CONSTRAINT `nfe_io_consultas_orcamento_fk` FOREIGN KEY (`orcamento_id`) REFERENCES `nfe_io_orcamentos` (`id`),
  CONSTRAINT `nfe_io_consultas_empresa_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
  CONSTRAINT `nfe_io_consultas_nota_fk` FOREIGN KEY (`nota_fiscal_id`) REFERENCES `notas_fiscais` (`id`),
  CONSTRAINT `nfe_io_consultas_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
);
