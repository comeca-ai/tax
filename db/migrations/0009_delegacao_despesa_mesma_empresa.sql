-- ORDEM AJUSTADA À MÃO (mesma armadilha da 0008, deliberada):
-- o drizzle emite o CREATE INDEX por ÚLTIMO, mas a FK composta
-- REFERENCES `despesas`(`empresa_id`,`id`) precisa dele ANTES.
-- Sem esta ordem o MySQL devolve ER_FK_NO_INDEX_PARENT (1822), que NÃO
-- está na allowlist do apply.ts -> o container não sobe. Medido na 0008.
-- Se você regerar esta migração, mova o CREATE INDEX para o topo de novo.
-- O teste migracoes.test.ts falha se a ordem se perder.
--
-- Fecha o furo que a 0008 deixou: `despesa_id` era FK SIMPLES, então uma
-- delegação da empresa 1 podia apontar despesa da empresa 2 (gravado com dado
-- real no QA de 27/08). A FK composta amarra a terceira ponta da delegação.
-- Puramente ADITIVA: nada é dropado. A FK simples
-- `delegacoes_decisao_despesa_id_despesas_id_fk` permanece — dropá-la exigiria
-- DROP FOREIGN KEY, que na 2ª passada do boot devolve ER_CANT_DROP_FIELD_OR_KEY
-- (1091), fora da allowlist do apply.ts. Redundante e barata; sair dela é
-- assunto de uma migração futura com janela própria.
CREATE INDEX `despesas_empresa_id_id_idx` ON `despesas` (`empresa_id`,`id`);
--> statement-breakpoint
ALTER TABLE `delegacoes_decisao` ADD CONSTRAINT `delegacoes_decisao_despesa_mesma_empresa_fk` FOREIGN KEY (`empresa_id`,`despesa_id`) REFERENCES `despesas`(`empresa_id`,`id`) ON DELETE no action ON UPDATE no action;
