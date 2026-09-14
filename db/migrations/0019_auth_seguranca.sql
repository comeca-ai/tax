CREATE TABLE IF NOT EXISTS `auth_rate_limits` (
  `chave` varchar(64) NOT NULL,
  `janela_inicio` bigint unsigned NOT NULL,
  `tentativas` int unsigned NOT NULL,
  PRIMARY KEY (`chave`),
  INDEX `auth_rate_limits_janela_idx` (`janela_inicio`)
) ENGINE=InnoDB;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_sessoes_revogadas` (
  `token_hash` varchar(64) NOT NULL,
  `expira_em` bigint unsigned NOT NULL,
  PRIMARY KEY (`token_hash`),
  INDEX `auth_sessoes_revogadas_expira_idx` (`expira_em`)
) ENGINE=InnoDB;
