# PaddleOCR como microserviço (CPU). Modelos baixados na build: a primeira
# requisição nunca espera download. Imagem grande por natureza (~2 GB).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=1

# Bibliotecas nativas que o OpenCV/Paddle carregam em runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 libgl1 \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --home-dir /home/paddle paddle
WORKDIR /srv/paddle-ocr

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=paddle:paddle server.py .

USER paddle
ENV HOME=/home/paddle
ARG PADDLE_OCR_LANG=pt
# Dentro da rede do compose o serviço precisa ouvir em todas as interfaces do
# container; a porta NÃO é publicada no host (ver docker-compose.yml).
ENV PADDLE_OCR_HOST=0.0.0.0 \
    PADDLE_OCR_PORT=4190 \
    PADDLE_OCR_LANG=${PADDLE_OCR_LANG}

# Warm-up: baixa e valida os modelos dentro da imagem, com a MESMA configuração
# do runtime (server.MotorPaddle é a única fonte de verdade dos parâmetros).
RUN python -c "import server; server.MotorPaddle()"

EXPOSE 4190

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:4190/health', timeout=4).status == 200 else 1)"

CMD ["python", "server.py"]
