CREATE INDEX `despesas_empresa_created_at_idx` ON `despesas` (`empresa_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `log_auditoria_metricas_idx` ON `log_auditoria` (`empresa_id`, `entidade`, `acao`, `entidade_id`);
