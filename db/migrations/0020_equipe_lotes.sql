ALTER TABLE `colaboradores` ADD COLUMN `tipo_vinculo` enum('CLT','MEI','PJ') NULL;
--> statement-breakpoint
ALTER TABLE `colaboradores` ADD COLUMN `superior_direto_id` bigint unsigned NULL;
--> statement-breakpoint
ALTER TABLE `colaboradores` ADD CONSTRAINT `colaboradores_superior_tenant_fk` FOREIGN KEY (`empresa_id`, `superior_direto_id`) REFERENCES `colaboradores` (`empresa_id`, `id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `equipe_lotes` (
 `id` bigint unsigned NOT NULL AUTO_INCREMENT,
 `empresa_id` bigint unsigned NOT NULL,
 `usuario_id` bigint unsigned NOT NULL,
 `chave` varchar(64) NOT NULL,
 `pessoas` json NOT NULL,
 `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 UNIQUE KEY `equipe_lotes_empresa_chave_unique` (`empresa_id`, `chave`),
 CONSTRAINT `equipe_lotes_empresa_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
 CONSTRAINT `equipe_lotes_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB;
