"""Testes do contrato HTTP com motor falso: rodam sem Paddle instalado.

`python3 -m unittest -v` nesta pasta.
"""
import base64
import json
import threading
import unittest
import urllib.error
import urllib.request

import server


class MotorFalso:
    nome = "motor-falso 0"
    lang = "pt"
    dpi = 200

    def __init__(self):
        self.chamadas = []

    def ler(self, conteudo, mime_type, nome_arquivo):
        self.chamadas.append((len(conteudo), mime_type, nome_arquivo))
        if conteudo == b"ilegivel":
            raise server.DocumentoInvalido("nao abre")
        if conteudo == b"explode":
            raise RuntimeError("segredo interno que nao pode vazar")
        return [
            {"pagina": 1, "linhas": 2, "texto": "Alimentação: teto R$ 55/dia\nHospedagem: R$ 300"},
            {"pagina": 2, "linhas": 1, "texto": "Combustível: por km rodado"},
        ]


class ServidorDeTeste:
    def __init__(self, token):
        self.motor = MotorFalso()
        self.servidor = server.servir(server.App(self.motor, token=token), host="127.0.0.1", port=0)
        self.thread = threading.Thread(target=self.servidor.serve_forever, daemon=True)
        self.thread.start()
        self.base = "http://127.0.0.1:%d" % self.servidor.server_address[1]

    def fechar(self):
        self.servidor.shutdown()
        self.servidor.server_close()

    def post(self, caminho, corpo, token=None, bruto=None):
        dados = bruto if bruto is not None else json.dumps(corpo).encode()
        pedido = urllib.request.Request(self.base + caminho, data=dados, method="POST")
        pedido.add_header("Content-Type", "application/json")
        if token:
            pedido.add_header("Authorization", "Bearer " + token)
        try:
            with urllib.request.urlopen(pedido, timeout=5) as resposta:
                return resposta.status, json.loads(resposta.read())
        except urllib.error.HTTPError as erro:
            return erro.code, json.loads(erro.read())

    def get(self, caminho):
        try:
            with urllib.request.urlopen(self.base + caminho, timeout=5) as resposta:
                return resposta.status, json.loads(resposta.read())
        except urllib.error.HTTPError as erro:
            return erro.code, json.loads(erro.read())


TOKEN = "t" * 40
DOC = {"arquivoNome": "politica.pdf", "mimeType": "application/pdf",
       "base64": base64.b64encode(b"%PDF-1.4 conteudo").decode()}


class ContratoHttp(unittest.TestCase):
    def setUp(self):
        self.s = ServidorDeTeste(TOKEN)

    def tearDown(self):
        self.s.fechar()

    def test_health_nao_exige_token(self):
        status, corpo = self.s.get("/health")
        self.assertEqual(status, 200)
        self.assertTrue(corpo["ok"])
        self.assertTrue(corpo["token_configurado"])
        self.assertEqual(corpo["motor"], "motor-falso 0")

    def test_ocr_sem_token_401_e_nao_chama_motor(self):
        status, corpo = self.s.post("/ocr", DOC)
        self.assertEqual(status, 401)
        self.assertEqual(corpo["error"], "nao_autorizado")
        self.assertEqual(self.s.motor.chamadas, [])

    def test_ocr_token_errado_401(self):
        status, _ = self.s.post("/ocr", DOC, token="x" * 40)
        self.assertEqual(status, 401)
        self.assertEqual(self.s.motor.chamadas, [])

    def test_ocr_ok_devolve_texto_por_pagina(self):
        status, corpo = self.s.post("/ocr", DOC, token=TOKEN)
        self.assertEqual(status, 200)
        self.assertEqual(len(corpo["paginas"]), 2)
        self.assertIn("Alimentação: teto R$ 55/dia", corpo["texto"])
        self.assertIn("Combustível", corpo["texto"])
        self.assertEqual(corpo["motor"], "motor-falso 0")
        self.assertIn("segundos", corpo)
        self.assertEqual(self.s.motor.chamadas[0][1:], ("application/pdf", "politica.pdf"))

    def test_campos_faltando_400(self):
        status, corpo = self.s.post("/ocr", {"arquivoNome": "x.pdf"}, token=TOKEN)
        self.assertEqual(status, 400)
        self.assertEqual(corpo["error"], "entrada_invalida")

    def test_base64_invalido_400(self):
        status, corpo = self.s.post("/ocr", {**DOC, "base64": "n@o-e-base64!"}, token=TOKEN)
        self.assertEqual(status, 400)
        self.assertEqual(corpo["error"], "entrada_invalida")

    def test_json_invalido_400(self):
        status, corpo = self.s.post("/ocr", None, token=TOKEN, bruto=b"{nao json")
        self.assertEqual(status, 400)
        self.assertEqual(corpo["error"], "json_invalido")

    def test_documento_ilegivel_422(self):
        doc = {**DOC, "base64": base64.b64encode(b"ilegivel").decode()}
        status, corpo = self.s.post("/ocr", doc, token=TOKEN)
        self.assertEqual(status, 422)
        self.assertEqual(corpo["error"], "documento_ilegivel")

    def test_falha_do_motor_500_sem_vazar_detalhe(self):
        doc = {**DOC, "base64": base64.b64encode(b"explode").decode()}
        status, corpo = self.s.post("/ocr", doc, token=TOKEN)
        self.assertEqual(status, 500)
        self.assertEqual(corpo, {"error": "falha_no_motor"})

    def test_rota_desconhecida_404(self):
        self.assertEqual(self.s.get("/outra")[0], 404)
        self.assertEqual(self.s.post("/outra", DOC, token=TOKEN)[0], 404)


class ServicoFechado(unittest.TestCase):
    def test_sem_token_configurado_ocr_503(self):
        s = ServidorDeTeste(token="")
        try:
            status, corpo = s.post("/ocr", DOC, token="qualquer")
            self.assertEqual(status, 503)
            self.assertEqual(corpo["error"], "servico_fechado")
            self.assertEqual(s.motor.chamadas, [])
            self.assertFalse(s.get("/health")[1]["token_configurado"])
        finally:
            s.fechar()


if __name__ == "__main__":
    unittest.main()
