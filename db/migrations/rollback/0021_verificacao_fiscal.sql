-- Somente após backup e retorno ao código anterior: remove histórico desta funcionalidade.
-- Não remove notas, despesas, orçamento ou ledger manual/web NFE.io.
-- As reservas automáticas WhatsApp em fiscal_verificacoes exigem preservação no backup.
DROP TABLE IF EXISTS `fiscal_verificacoes`;
--> statement-breakpoint
DROP TABLE IF EXISTS `fiscal_documentos`;
--> statement-breakpoint
DROP TABLE IF EXISTS `fiscal_configuracao`;
--> statement-breakpoint
DROP INDEX `notas_fiscais_empresa_id_id_uq` ON `notas_fiscais`;
