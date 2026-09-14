ALTER TABLE `veiculos` ADD COLUMN `colaborador_id` bigint unsigned NULL;
--> statement-breakpoint
ALTER TABLE `veiculos` ADD COLUMN `motorizacao` enum('combustao','hibrido','eletrico') NULL;
--> statement-breakpoint
ALTER TABLE `veiculos` ADD COLUMN `uf_licenciamento` varchar(2) NULL;
--> statement-breakpoint
ALTER TABLE `veiculos` ADD UNIQUE INDEX `veiculos_pessoa_placa_unique` (`colaborador_id`, `placa`);
--> statement-breakpoint
ALTER TABLE `veiculos` ADD CONSTRAINT `veiculos_pessoa_empresa_fk` FOREIGN KEY (`empresa_id`, `colaborador_id`) REFERENCES `colaboradores` (`empresa_id`, `id`);
