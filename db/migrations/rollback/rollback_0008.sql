-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ROLLBACK MANUAL DA MIGRAÇÃO 0008 (Norma PoC — estrutura)                 ║
-- ║                                                                          ║
-- ║  ⚠ ANTES DE RODAR: VOLTE O CÓDIGO PARA d939843 (v1.8.0) E SUBA O APP.    ║
-- ║                                                                          ║
-- ║  O drizzle emite lista EXPLÍCITA de colunas. Com o código da 0008 no ar,  ║
-- ║  remover `papel_fluxo`/`equipe` quebra na hora:                           ║
-- ║    · api/routers/colaboradores.ts (listar)      → ER_BAD_FIELD_ERROR      ║
-- ║    · api/modules/reembolso/agente/index.ts:38   → ER_BAD_FIELD_ERROR,     ║
-- ║      e este é ENGOLIDO pelo catch de processarMensagemRecebida, que       ║
-- ║      devolve 200 no webhook: todo colaborador que mandar mensagem no      ║
-- ║      WhatsApp cai num buraco silencioso, sem erro visível.                ║
-- ║                                                                          ║
-- ║  Ordem correta de rollback: (1) backup do banco, (2) deploy do código     ║
-- ║  d939843, (3) este script. Nunca (3) antes de (2).                        ║
-- ║                                                                          ║
-- ║  NUNCA roda no boot: o docker-entrypoint.sh usa o glob                    ║
-- ║  `db/migrations/0*.sql`, não recursivo — nem o diretório nem o arquivo    ║
-- ║  começam com `0`. Verificado.                                             ║
-- ║                                                                          ║
-- ║  É re-executável: MySQL 8.0 não suporta DROP COLUMN IF EXISTS (testado    ║
-- ║  em 8.0.46 → ER_PARSE_ERROR), então as colunas saem por statement         ║
-- ║  preparado, guardado por information_schema. Rodar duas vezes é seguro.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- As três tabelas são folhas (ninguém as referencia), então a ordem entre elas
-- é indiferente — o IF EXISTS é que garante a re-execução.
DROP TABLE IF EXISTS `delegacoes_decisao`;
DROP TABLE IF EXISTS `empresas_config`;
DROP TABLE IF EXISTS `veiculos_colaborador`;

-- O índice existe só para servir de alvo às FKs compostas; sai depois das
-- tabelas que o referenciam. Também guardado, para permitir re-execução.
SET @sql_idx := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = 'colaboradores'
              AND index_name = 'colaboradores_empresa_id_id_idx'),
    'DROP INDEX `colaboradores_empresa_id_id_idx` ON `colaboradores`',
    'DO 0'
  )
);
PREPARE st FROM @sql_idx; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql_equipe := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'colaboradores'
              AND column_name = 'equipe'),
    'ALTER TABLE `colaboradores` DROP COLUMN `equipe`',
    'DO 0'
  )
);
PREPARE st FROM @sql_equipe; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql_papel := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'colaboradores'
              AND column_name = 'papel_fluxo'),
    'ALTER TABLE `colaboradores` DROP COLUMN `papel_fluxo`',
    'DO 0'
  )
);
PREPARE st FROM @sql_papel; EXECUTE st; DEALLOCATE PREPARE st;
