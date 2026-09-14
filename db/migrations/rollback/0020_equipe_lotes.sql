-- Parar tráfego e reverter o código antes de executar. Fazer backup dos lotes e vínculos.
DROP TABLE IF EXISTS `equipe_lotes`;
ALTER TABLE `colaboradores` DROP FOREIGN KEY `colaboradores_superior_tenant_fk`;
ALTER TABLE `colaboradores` DROP COLUMN `superior_direto_id`, DROP COLUMN `tipo_vinculo`;
