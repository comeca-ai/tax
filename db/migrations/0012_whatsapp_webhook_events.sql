CREATE TABLE `whatsapp_webhook_events` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`tipo_evento` varchar(50) NOT NULL,
	`status_entrega` varchar(50),
	`mensagem_id` varchar(128),
	`telefone` varchar(20),
	`canal_telefone` varchar(20),
	`payload` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_webhook_events_id` PRIMARY KEY(`id`)
);
