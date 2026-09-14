-- Reversão operacional: encerre tráfego e reverta o código antes de executar.
-- Remove apenas contadores efêmeros e denylist; não altera usuários ou despesas.
DROP TABLE IF EXISTS `auth_sessoes_revogadas`;
DROP TABLE IF EXISTS `auth_rate_limits`;
