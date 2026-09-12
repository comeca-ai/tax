-- DROP DAS FKs AJUSTADO À MÃO (edição pós-drizzle, deliberada):
-- o drizzle emite `DROP FOREIGN KEY` pelado, mas o docker-entrypoint.sh roda
-- TODAS as migrações em TODO boot. Na 2ª passada o DROP de uma FK que já não
-- existe devolve ER_CANT_DROP_FIELD_OR_KEY (1091), que NÃO está na allowlist
-- do apply.ts -> o container não sobe. Por isso os dois DROPs saem por
-- statement preparado guardado por information_schema (mesmo padrão dos
-- rollback/): SET / PREPARE / EXECUTE / DEALLOCATE são statements simples,
-- um por breakpoint, e re-executar é seguro. Os ADD CONSTRAINT ficam como o
-- drizzle gerou — repetir FK existente dá ER_FK_DUP_NAME, tolerado.
-- Se você regerar esta migração, refaça a guarda dos DROPs.
-- O teste migracoes.test.ts falha se a guarda se perder.
SET @sql_fk_usuario := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = DATABASE()
              AND table_name = 'log_auditoria'
              AND constraint_name = 'log_auditoria_usuario_id_usuarios_id_fk'),
    'ALTER TABLE `log_auditoria` DROP FOREIGN KEY `log_auditoria_usuario_id_usuarios_id_fk`',
    'DO 0'
  )
);
--> statement-breakpoint
PREPARE st_fk_usuario FROM @sql_fk_usuario;
--> statement-breakpoint
EXECUTE st_fk_usuario;
--> statement-breakpoint
DEALLOCATE PREPARE st_fk_usuario;
--> statement-breakpoint
SET @sql_fk_empresa := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = DATABASE()
              AND table_name = 'log_auditoria'
              AND constraint_name = 'log_auditoria_empresa_id_empresas_id_fk'),
    'ALTER TABLE `log_auditoria` DROP FOREIGN KEY `log_auditoria_empresa_id_empresas_id_fk`',
    'DO 0'
  )
);
--> statement-breakpoint
PREPARE st_fk_empresa FROM @sql_fk_empresa;
--> statement-breakpoint
EXECUTE st_fk_empresa;
--> statement-breakpoint
DEALLOCATE PREPARE st_fk_empresa;
--> statement-breakpoint
ALTER TABLE `log_auditoria` ADD CONSTRAINT `log_auditoria_usuario_id_usuarios_id_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `log_auditoria` ADD CONSTRAINT `log_auditoria_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE set null ON UPDATE no action;
