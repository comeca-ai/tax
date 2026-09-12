-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ROLLBACK MANUAL DA MIGRAÇÃO 0009 (delegação × despesa, mesma empresa)    ║
-- ║                                                                          ║
-- ║  Barato e sem risco de dado: a 0009 não cria nem remove coluna alguma,    ║
-- ║  só acrescenta um índice e uma FK. Desfazer devolve exatamente o estado   ║
-- ║  da 0008 — inclusive o furo multi-tenant que ela fechou. Só role isto se  ║
-- ║  a FK estiver barrando gravação legítima.                                 ║
-- ║                                                                          ║
-- ║  Não exige voltar o código: nenhum arquivo em src/ ou api/ lê a FK.       ║
-- ║                                                                          ║
-- ║  NUNCA roda no boot: o docker-entrypoint.sh usa o glob                    ║
-- ║  `db/migrations/0*.sql`, não recursivo — nem o diretório nem o arquivo    ║
-- ║  começam com `0`. Mesmo raciocínio da rollback_0008.                      ║
-- ║                                                                          ║
-- ║  É re-executável: MySQL 8.0 não tem DROP FOREIGN KEY IF EXISTS nem        ║
-- ║  DROP INDEX IF EXISTS, então ambos saem por statement preparado guardado  ║
-- ║  por information_schema. Rodar duas vezes é seguro.                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- A FK sai ANTES do índice: enquanto ela existir, o InnoDB recusa remover o
-- índice que a serve (ER_DROP_INDEX_FK, 1553).
SET @sql_fk := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = DATABASE()
              AND table_name = 'delegacoes_decisao'
              AND constraint_name = 'delegacoes_decisao_despesa_mesma_empresa_fk'),
    'ALTER TABLE `delegacoes_decisao` DROP FOREIGN KEY `delegacoes_decisao_despesa_mesma_empresa_fk`',
    'DO 0'
  )
);
PREPARE st FROM @sql_fk; EXECUTE st; DEALLOCATE PREPARE st;

-- O índice existe só para servir de alvo à FK composta. A FK simples
-- `despesas_empresa_id_empresas_id_fk` continua servida pelo índice próprio
-- de `empresa_id`, então remover este composto não a deixa órfã.
SET @sql_idx := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = 'despesas'
              AND index_name = 'despesas_empresa_id_id_idx'),
    'DROP INDEX `despesas_empresa_id_id_idx` ON `despesas`',
    'DO 0'
  )
);
PREPARE st FROM @sql_idx; EXECUTE st; DEALLOCATE PREPARE st;
