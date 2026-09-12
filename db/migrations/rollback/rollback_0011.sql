-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ROLLBACK MANUAL DA MIGRAÇÃO 0011 (ficha do colaborador + check-ins)      ║
-- ║                                                                          ║
-- ║  Desfaz: tabela checkins_campo (3 FKs + índice + tabela) e as 6 colunas  ║
-- ║  novas de colaboradores (tipo_documento, documento, cargo,               ║
-- ║  nivel_aprovacao, status_vinculo, data_admissao) + o unique              ║
-- ║  (empresa_id, documento).                                                 ║
-- ║                                                                          ║
-- ║  ⚠ DESTRUIÇÃO DE DADO: derrubar a tabela e as colunas APAGA check-ins   ║
-- ║  e dados de ficha já gravados. Só role isto com o dono sabendo — e de    ║
-- ║  preferência antes de qualquer uso real (janela logo após o deploy).     ║
-- ║                                                                          ║
-- ║  Exige voltar o código junto: o schema.ts passa a divergir sem as        ║
-- ║  colunas/tabela — role junto com o revert do commit da 0011.             ║
-- ║                                                                          ║
-- ║  NUNCA roda no boot: o docker-entrypoint.sh usa o glob                   ║
-- ║  `db/migrations/0*.sql`, não recursivo. Mesmo raciocínio das 0008–0010.  ║
-- ║                                                                          ║
-- ║  É re-executável: MySQL 8.0 não tem DROP ... IF EXISTS para FK, índice   ║
-- ║  e coluna, então tudo sai por statement preparado guardado por           ║
-- ║  information_schema. Rodar duas vezes é seguro.                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 1) FKs da checkins_campo (a composta primeiro, mas a ordem entre elas tanto
--    faz; o que importa é saírem ANTES da tabela e do índice).
SET @sql_fk1 := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = DATABASE()
              AND table_name = 'checkins_campo'
              AND constraint_name = 'checkins_campo_mesma_empresa_fk'),
    'ALTER TABLE `checkins_campo` DROP FOREIGN KEY `checkins_campo_mesma_empresa_fk`',
    'DO 0'
  )
);
PREPARE st1 FROM @sql_fk1; EXECUTE st1; DEALLOCATE PREPARE st1;

SET @sql_fk2 := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = DATABASE()
              AND table_name = 'checkins_campo'
              AND constraint_name = 'checkins_campo_colaborador_id_colaboradores_id_fk'),
    'ALTER TABLE `checkins_campo` DROP FOREIGN KEY `checkins_campo_colaborador_id_colaboradores_id_fk`',
    'DO 0'
  )
);
PREPARE st2 FROM @sql_fk2; EXECUTE st2; DEALLOCATE PREPARE st2;

SET @sql_fk3 := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = DATABASE()
              AND table_name = 'checkins_campo'
              AND constraint_name = 'checkins_campo_empresa_id_empresas_id_fk'),
    'ALTER TABLE `checkins_campo` DROP FOREIGN KEY `checkins_campo_empresa_id_empresas_id_fk`',
    'DO 0'
  )
);
PREPARE st3 FROM @sql_fk3; EXECUTE st3; DEALLOCATE PREPARE st3;

-- 2) A tabela (DROP TABLE IF EXISTS é nativo — não precisa de guarda).
DROP TABLE IF EXISTS `checkins_campo`;

-- 3) O unique (empresa_id, documento) de colaboradores sai ANTES da coluna
--    documento (o InnoDB recusa remover coluna que serve índice).
SET @sql_uq := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = 'colaboradores'
              AND index_name = 'colaboradores_empresa_documento_unique'),
    'ALTER TABLE `colaboradores` DROP INDEX `colaboradores_empresa_documento_unique`',
    'DO 0'
  )
);
PREPARE st4 FROM @sql_uq; EXECUTE st4; DEALLOCATE PREPARE st4;

-- 4) As 6 colunas, cada uma guardada (re-execução segura).
SET @sql_c1 := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'colaboradores' AND column_name = 'tipo_documento'),  'ALTER TABLE `colaboradores` DROP COLUMN `tipo_documento`',  'DO 0'));
PREPARE sc1 FROM @sql_c1; EXECUTE sc1; DEALLOCATE PREPARE sc1;
SET @sql_c2 := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'colaboradores' AND column_name = 'documento'),       'ALTER TABLE `colaboradores` DROP COLUMN `documento`',       'DO 0'));
PREPARE sc2 FROM @sql_c2; EXECUTE sc2; DEALLOCATE PREPARE sc2;
SET @sql_c3 := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'colaboradores' AND column_name = 'cargo'),           'ALTER TABLE `colaboradores` DROP COLUMN `cargo`',           'DO 0'));
PREPARE sc3 FROM @sql_c3; EXECUTE sc3; DEALLOCATE PREPARE sc3;
SET @sql_c4 := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'colaboradores' AND column_name = 'nivel_aprovacao'), 'ALTER TABLE `colaboradores` DROP COLUMN `nivel_aprovacao`', 'DO 0'));
PREPARE sc4 FROM @sql_c4; EXECUTE sc4; DEALLOCATE PREPARE sc4;
SET @sql_c5 := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'colaboradores' AND column_name = 'status_vinculo'),  'ALTER TABLE `colaboradores` DROP COLUMN `status_vinculo`',  'DO 0'));
PREPARE sc5 FROM @sql_c5; EXECUTE sc5; DEALLOCATE PREPARE sc5;
SET @sql_c6 := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'colaboradores' AND column_name = 'data_admissao'),   'ALTER TABLE `colaboradores` DROP COLUMN `data_admissao`',   'DO 0'));
PREPARE sc6 FROM @sql_c6; EXECUTE sc6; DEALLOCATE PREPARE sc6;
