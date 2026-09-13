ALTER TABLE `notas_fiscais` ADD `arquivo_storage_provider` varchar(30);--> statement-breakpoint
ALTER TABLE `notas_fiscais` ADD `arquivo_storage_key` varchar(500);--> statement-breakpoint
ALTER TABLE `notas_fiscais` ADD `arquivo_checksum` varchar(64);--> statement-breakpoint
ALTER TABLE `notas_fiscais` ADD `arquivo_tamanho_bytes` int;--> statement-breakpoint
ALTER TABLE `whatsapp_inbox` ADD `empresa_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `whatsapp_inbox` ADD `colaborador_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `whatsapp_inbox` ADD `despesa_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `whatsapp_inbox` ADD CONSTRAINT `whatsapp_inbox_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_inbox` ADD CONSTRAINT `whatsapp_inbox_colaborador_id_colaboradores_id_fk` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_inbox` ADD CONSTRAINT `whatsapp_inbox_despesa_id_despesas_id_fk` FOREIGN KEY (`despesa_id`) REFERENCES `despesas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_inbox` ADD CONSTRAINT `whatsapp_inbox_empresa_colaborador_fk` FOREIGN KEY (`empresa_id`,`colaborador_id`) REFERENCES `colaboradores`(`empresa_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `whatsapp_inbox_despesa_idx` ON `whatsapp_inbox` (`despesa_id`);