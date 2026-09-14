-- Executar somente após exportar os novos campos e reverter a aplicação.
-- Remove vínculos novos: requer autorização operacional e backup verificável.
ALTER TABLE `veiculos` DROP FOREIGN KEY `veiculos_pessoa_empresa_fk`;
ALTER TABLE `veiculos` DROP INDEX `veiculos_pessoa_placa_unique`;
ALTER TABLE `veiculos` DROP COLUMN `uf_licenciamento`, DROP COLUMN `motorizacao`, DROP COLUMN `colaborador_id`;
