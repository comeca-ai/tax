ALTER TABLE `despesas` MODIFY COLUMN `categoria` enum('combustivel','alimentacao','hospedagem','pedagio','uber','taxi');--> statement-breakpoint
ALTER TABLE `notas_fiscais` ADD `categoria_sugerida` varchar(20);--> statement-breakpoint
ALTER TABLE `notas_fiscais` ADD `litros` double;