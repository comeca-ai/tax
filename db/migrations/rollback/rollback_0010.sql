-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ROLLBACK MANUAL DA MIGRAÇÃO 0010 (log_auditoria: FKs com SET NULL)       ║
-- ║                                                                          ║
-- ║  Devolve as FKs usuario_id/empresa_id ao ON DELETE NO ACTION original.    ║
-- ║  NÃO toca em linha alguma: log_auditoria é append-only, e as colunas      ║
-- ║  continuam anuláveis — linhas já zeradas pelo SET NULL ficam zeradas      ║
-- ║  (reverter a constraint não reconstitui referência; nem deve tentar).     ║
-- ║                                                                          ║
-- ║  Não exige voltar o código de imediato, mas o schema.ts passa a divergir: ║
-- ║  role isto junto com o revert do commit da 0010.                          ║
-- ║                                                                          ║
-- ║  NUNCA roda no boot: o docker-entrypoint.sh usa o glob                    ║
-- ║  `db/migrations/0*.sql`, não recursivo — nem o diretório nem o arquivo    ║
-- ║  começam com `0`. Mesmo raciocínio das rollback_0008/0009.                ║
-- ║                                                                          ║
-- ║  É re-executável: MySQL 8.0 não tem DROP FOREIGN KEY IF EXISTS, então     ║
-- ║  os DROPs saem por statement preparado guardado por information_schema.   ║
-- ║  Os ADD CONSTRAINT não são guardados: se a FK já estiver no estado        ║
-- ║  original, o ADD falha com ER_FK_DUP_NAME e interrompe — sinal correto    ║
-- ║  de que não há nada a reverter.                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- As FKs SET NULL saem ANTES de recriar as NO ACTION com o mesmo nome.
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
PREPARE st_fk_usuario FROM @sql_fk_usuario; EXECUTE st_fk_usuario; DEALLOCATE PREPARE st_fk_usuario;

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
PREPARE st_fk_empresa FROM @sql_fk_empresa; EXECUTE st_fk_empresa; DEALLOCATE PREPARE st_fk_empresa;

-- Estado original (pré-0010): NO ACTION nas duas pontas.
ALTER TABLE `log_auditoria` ADD CONSTRAINT `log_auditoria_usuario_id_usuarios_id_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `log_auditoria` ADD CONSTRAINT `log_auditoria_empresa_id_empresas_id_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE no action ON UPDATE no action;
