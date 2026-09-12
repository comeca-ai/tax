-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ROLLBACK MANUAL DA MIGRAÇÃO 0013 (fila durável WhatsApp)                 ║
-- ║                                                                          ║
-- ║ Esta migração é aditiva. NÃO use este arquivo como rollback rotineiro:   ║
-- ║ ele apaga itens pendentes e a trilha de processamento da POC.            ║
-- ║                                                                          ║
-- ║ Só é permitido após: (1) parar o worker futuro, (2) confirmar que não há ║
-- ║ item pendente/processando ou exportar a evidência necessária e (3) voltar║
-- ║ o código que lê as tabelas. Não executar em produção sem backup e        ║
-- ║ aprovação registrada.                                                    ║
-- ║                                                                          ║
-- ║ O arquivo não roda no boot: ele está neste diretório e não corresponde   ║
-- ║ ao glob de migrações.                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP TABLE IF EXISTS `whatsapp_outbox`;
DROP TABLE IF EXISTS `whatsapp_inbox`;
