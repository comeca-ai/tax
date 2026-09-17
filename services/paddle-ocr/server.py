"""PaddleOCR como microserviço interno da política de reembolso.

Contrato: o app Node nunca importa Paddle; ele chama `POST /ocr` com o mesmo
`ArquivoPolitica` que já circula no parser (`arquivoNome`, `mimeType`,
`base64`) e recebe texto puro por página. Um único motor carregado na
subida, uma inferência por vez (uploads de política são raros; duas em
paralelo é risco de OOM em CPU).

Sem `PADDLE_OCR_TOKEN` a superfície `/ocr` fica fechada, como a API de
serviço do app (`/api/v1/*`). `/health` responde sempre, sem autenticação.
"""
import base64
import json
import os
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.environ.get("PADDLE_OCR_HOST", "127.0.0.1")
PORT = int(os.environ.get("PADDLE_OCR_PORT", "4190"))
TOKEN = os.environ.get("PADDLE_OCR_TOKEN", "")
LANG = os.environ.get("PADDLE_OCR_LANG", "pt")
DPI = int(os.environ.get("PADDLE_OCR_DPI", "200"))
MAX_BYTES = int(os.environ.get("PADDLE_OCR_MAX_BYTES", str(50 * 1024 * 1024)))
MAX_PAGINAS = int(os.environ.get("PADDLE_OCR_MAX_PAGINAS", "60"))


class DocumentoInvalido(Exception):
    """Entrada que o motor não consegue abrir; vira 422, nunca 500."""


class MotorPaddle:
    """Carrega os modelos uma vez e rasteriza PDF/imagem com PyMuPDF."""

    def __init__(self, lang=LANG, dpi=DPI):
        os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "1")
        import numpy  # noqa: F401 — falha cedo se o ambiente estiver incompleto
        import pymupdf
        from paddleocr import PaddleOCR
        import paddleocr

        self.pymupdf = pymupdf
        self.numpy = numpy
        self.lang = lang
        self.dpi = dpi
        self.nome = f"paddleocr {paddleocr.__version__}"
        # Orientação/desentortamento desligados: política é documento de
        # escritório, e cada módulo extra custa segundos por página em CPU.
        self.ocr = PaddleOCR(
            lang=lang,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            # Medido em 17/09/2026 (PI-004, página densa, 4 vCPU):
            #   3.3.1 + oneDNN → quebra ("ConvertPirAttribute2RuntimeAttribute not support")
            #   3.2.0 + oneDNN on + lado ≤ 960 → 12,7 s/pág, F1 0,983 (12× o baseline)
            # Por isso requirements.txt pina paddlepaddle==3.2.0.
            enable_mkldnn=True,
            # Rasterizar a 200 DPI preserva a leitura; a DETECÇÃO não precisa da
            # página inteira em 1654×2339 — limitar o lado maior a 960 px foi o
            # maior ganho de velocidade e ainda melhorou a precisão.
            text_det_limit_side_len=int(os.environ.get("PADDLE_OCR_DET_SIDE", "960")),
            text_det_limit_type="max",
            cpu_threads=int(os.environ.get("PADDLE_OCR_THREADS", str(os.cpu_count() or 2))),
        )

    def _linhas(self, resultado):
        for r in resultado:
            dados = r if isinstance(r, dict) else getattr(r, "json", {}).get("res", {})
            for linha in dados.get("rec_texts", []):
                if linha and linha.strip():
                    yield linha.strip()

    def ler(self, conteudo, mime_type, nome_arquivo):
        ehPdf = "pdf" in (mime_type or "").lower() or nome_arquivo.lower().endswith(".pdf")
        try:
            doc = self.pymupdf.open(stream=conteudo, filetype="pdf" if ehPdf else None)
        except Exception as erro:  # PyMuPDF levanta tipos variados
            raise DocumentoInvalido(f"não foi possível abrir o documento ({type(erro).__name__})")
        if doc.page_count == 0:
            raise DocumentoInvalido("documento sem páginas")
        if doc.page_count > MAX_PAGINAS:
            raise DocumentoInvalido(f"documento com {doc.page_count} páginas excede o limite de {MAX_PAGINAS}")
        paginas = []
        for indice, pagina in enumerate(doc):
            # Imagem já é raster: não reamostrar. PDF: rasterizar no DPI configurado.
            pix = pagina.get_pixmap(dpi=self.dpi) if ehPdf else pagina.get_pixmap()
            if pix.n not in (3, 4):
                pix = self.pymupdf.Pixmap(self.pymupdf.csRGB, pix)
            arr = self.numpy.frombuffer(pix.samples, dtype=self.numpy.uint8).reshape(pix.h, pix.w, pix.n)
            bgr = arr[:, :, :3][:, :, ::-1].copy()  # PaddleOCR espera BGR
            linhas = list(self._linhas(self.ocr.predict(bgr)))
            paginas.append({"pagina": indice + 1, "linhas": len(linhas), "texto": "\n".join(linhas)})
        return paginas


class App:
    def __init__(self, motor, token=TOKEN):
        self.motor = motor
        self.token = token
        self.lock = threading.Lock()
        self.iniciado = time.time()

    def autorizado(self, cabecalho):
        if not self.token:
            return False
        esperado = f"Bearer {self.token}"
        return bool(cabecalho) and secrets.compare_digest(cabecalho, esperado)

    def health(self):
        return {
            "ok": True,
            "motor": getattr(self.motor, "nome", "desconhecido"),
            "lang": getattr(self.motor, "lang", None),
            "dpi": getattr(self.motor, "dpi", None),
            "token_configurado": bool(self.token),
            "uptime_s": round(time.time() - self.iniciado),
        }

    def ocr(self, corpo):
        nome = corpo.get("arquivoNome")
        mime = corpo.get("mimeType")
        b64 = corpo.get("base64")
        if not isinstance(nome, str) or not isinstance(mime, str) or not isinstance(b64, str) or not b64:
            raise ValueError("campos obrigatórios: arquivoNome, mimeType, base64 (strings)")
        try:
            conteudo = base64.b64decode(b64, validate=True)
        except Exception:
            raise ValueError("base64 inválido")
        if len(conteudo) > MAX_BYTES:
            raise OverflowError(f"documento com {len(conteudo)} bytes excede {MAX_BYTES}")
        inicio = time.time()
        # Uma inferência por vez: o modelo em CPU não ganha nada com paralelismo
        # e duas rasterizações grandes ao mesmo tempo estouram memória.
        with self.lock:
            paginas = self.motor.ler(conteudo, mime, nome)
        texto = "\n\n".join(p["texto"] for p in paginas if p["texto"]).strip()
        return {
            "texto": texto,
            "paginas": paginas,
            "segundos": round(time.time() - inicio, 2),
            "motor": getattr(self.motor, "nome", "desconhecido"),
            "lang": getattr(self.motor, "lang", None),
            "dpi": getattr(self.motor, "dpi", None),
        }


class Handler(BaseHTTPRequestHandler):
    server_version = "paddle-ocr/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, formato, *args):  # sem log de corpo, sem log de token
        sys.stderr.write("%s %s\n" % (self.address_string(), formato % args))

    def _json(self, status, payload):
        corpo = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, self.server.app.health())
        return self._json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/ocr":
            return self._json(404, {"error": "not_found"})
        app = self.server.app
        if not app.token:
            return self._json(503, {"error": "servico_fechado", "detalhe": "PADDLE_OCR_TOKEN não configurado"})
        if not app.autorizado(self.headers.get("Authorization")):
            return self._json(401, {"error": "nao_autorizado"})
        try:
            tamanho = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self._json(400, {"error": "content_length_invalido"})
        # base64 infla ~4/3; o limite do corpo acompanha o limite do documento.
        if tamanho <= 0 or tamanho > MAX_BYTES * 4 // 3 + 4096:
            return self._json(413, {"error": "corpo_grande_demais"})
        try:
            corpo = json.loads(self.rfile.read(tamanho).decode("utf-8"))
            if not isinstance(corpo, dict):
                raise ValueError("corpo deve ser um objeto JSON")
        except (ValueError, UnicodeDecodeError) as erro:
            return self._json(400, {"error": "json_invalido", "detalhe": str(erro)[:200]})
        try:
            return self._json(200, app.ocr(corpo))
        except ValueError as erro:
            return self._json(400, {"error": "entrada_invalida", "detalhe": str(erro)[:200]})
        except OverflowError as erro:
            return self._json(413, {"error": "documento_grande_demais", "detalhe": str(erro)[:200]})
        except DocumentoInvalido as erro:
            return self._json(422, {"error": "documento_ilegivel", "detalhe": str(erro)[:200]})
        except Exception as erro:  # motor falhou: não vazar traceback ao cliente
            sys.stderr.write("erro no motor: %s: %s\n" % (type(erro).__name__, str(erro)[:300]))
            return self._json(500, {"error": "falha_no_motor"})


def servir(app, host=HOST, port=PORT):
    servidor = ThreadingHTTPServer((host, port), Handler)
    servidor.app = app
    return servidor


if __name__ == "__main__":
    if not TOKEN:
        sys.stderr.write("aviso: PADDLE_OCR_TOKEN ausente — /ocr responderá 503 até ser configurado\n")
    inicio = time.time()
    motor = MotorPaddle()
    sys.stderr.write("motor pronto em %.1fs (%s, lang=%s, dpi=%d)\n" % (time.time() - inicio, motor.nome, LANG, DPI))
    servidor = servir(App(motor))
    sys.stderr.write("paddle-ocr ouvindo em http://%s:%d\n" % (HOST, PORT))
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
