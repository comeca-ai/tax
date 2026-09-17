# paddle-ocr

OCR self-hosted da **política de reembolso**, como microserviço. O app Node
nunca importa Paddle: chama `POST /ocr` por HTTP interno, com token, e recebe
texto por página. Escopo desta versão: só política (`api/modules/reembolso/policy/ocr.ts`).
Comprovantes (`api/modules/fiscal/ocr/`, D-014) ficam para uma etapa própria.

Motor: [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) 3.7 (Apache 2.0),
PaddlePaddle **3.2.0** CPU (pinado — ver limites), PyMuPDF para rasterizar PDF. Um motor carregado na
subida, **uma inferência por vez** (uploads de política são raros; duas em
paralelo em CPU é risco de OOM).

## Onde ele entra

```
upload da política
  ① pdf-parse (texto nativo, grátis)        PDF com camada de texto
  ② POST /ocr neste serviço                 escaneado / foto      ← aqui
  ③ OCR pago do provedor (Mistral OCR)      só se ② estiver fora
  → estruturação por LLM (Mistral chat → OpenAI → heurístico)
```

Sem `POLICY_OCR_URL` no app, ② não existe e o fluxo é o anterior.

## Contrato

`GET /health` — sem autenticação.

```json
{ "ok": true, "motor": "paddleocr 3.7.0", "lang": "pt", "dpi": 200, "token_configurado": true, "uptime_s": 120 }
```

`POST /ocr` — `Authorization: Bearer <PADDLE_OCR_TOKEN>`. Corpo: o mesmo
`ArquivoPolitica` do parser.

```json
{ "arquivoNome": "politica.pdf", "mimeType": "application/pdf", "base64": "..." }
```

Resposta `200`:

```json
{ "texto": "…", "paginas": [{ "pagina": 1, "linhas": 42, "texto": "…" }], "segundos": 18.4, "motor": "paddleocr 3.7.0", "lang": "pt", "dpi": 200 }
```

| Status | Quando |
|---|---|
| `401 nao_autorizado` | token ausente/errado — o motor não é chamado |
| `503 servico_fechado` | `PADDLE_OCR_TOKEN` não configurado — superfície fechada, como `/api/v1/*` do app |
| `400 entrada_invalida` / `json_invalido` | campos faltando, base64 inválido |
| `413` | documento acima de `PADDLE_OCR_MAX_BYTES` (50 MB, igual ao app) |
| `422 documento_ilegivel` | PyMuPDF não abre, 0 páginas, ou acima de `PADDLE_OCR_MAX_PAGINAS` |
| `500 falha_no_motor` | erro interno; detalhe só no log do serviço, nunca ao cliente |

O app trata qualquer não-`200` ou texto vazio como "serviço indisponível" e
segue para ③, com aviso nomeando o motivo.

## Configuração

Ver `.env.example`. `PADDLE_OCR_TOKEN` é obrigatório e é o mesmo valor de
`POLICY_OCR_TOKEN` no app (`openssl rand -hex 32`). `PADDLE_OCR_THREADS`
(default: núcleos disponíveis) e `PADDLE_OCR_DPI` (200) são os botões de
desempenho.

## Executar localmente

Python 3.12 (PaddlePaddle ainda não publica wheel para 3.13):

```sh
python3.12 -m venv venv && venv/bin/pip install -r requirements.txt
PADDLE_OCR_TOKEN=$(openssl rand -hex 32) venv/bin/python server.py
```

A primeira subida baixa os modelos para `~/.paddlex/official_models`.

## Validação

```sh
python3 -m unittest -v          # 11 testes do contrato HTTP, motor falso, sem Paddle
python3 -m py_compile server.py
```

Os testes não instalam nem chamam o Paddle: cobrem autenticação, superfície
fechada, validação de entrada, códigos de erro e o não-vazamento de detalhes
internos.

## Publicação

**systemd (homologação/produção atuais):** `deploy/paddle-ocr.service`.
Código em `/opt/paddle-ocr/current`, venv em `/opt/paddle-ocr/venv`, segredo em
`/etc/paddle-ocr/runtime.env` (só `PADDLE_OCR_TOKEN`), modelos em
`/var/lib/paddle-ocr` (StateDirectory). `ExecStartPre` baixa/valida os modelos
antes de abrir a porta — a primeira requisição nunca espera download. Ouve em
`127.0.0.1:4191`; o app aponta `POLICY_OCR_URL=http://127.0.0.1:4191`.

**Docker (stack compose):** perfil opt-in, imagem ~2 GB.

```sh
docker compose --profile ocr up -d --build
# .env do app: POLICY_OCR_URL=http://paddle-ocr:4191  POLICY_OCR_TOKEN=<mesmo token>
```

Segue `docs/POLITICA-DE-RELEASE-E-DEPLOY.md`: PR, CI, homologação, tag.
Rollback do app não depende deste serviço — basta remover `POLICY_OCR_URL`.

## Desempenho medido (17/09/2026, PI-004 real rasterizado a 200 DPI, 4 vCPU)

| Configuração | s/página | F1 tokens | CER |
|---|---|---|---|
| 3.3.1, oneDNN off (baseline) | 148 | 0,976 | 0,011 |
| 3.2.0, oneDNN on | 32 | 0,976 | 0,011 |
| **3.2.0, oneDNN on, detecção ≤ 960 px (adotado)** | **12,7** | **0,983** | **0,010** |
| modelos *mobile* | 27 | 0,834 | 0,026 — rejeitado |

Documento completo (6 páginas): CER 0,5 %, F1 0,98 contra o texto nativo.
Pico de memória observado: 3,5 GB (por isso `MemoryMax=4G`).

## Limites conhecidos

- **PaddlePaddle pinado em 3.2.0**: no 3.3.1 o oneDNN quebra na inferência
  (`ConvertPirAttribute2RuntimeAttribute not support`) e, desligado, fica 12×
  mais lento. Reavaliar ao atualizar `requirements.txt`, refazendo a tabela acima.
- Ponto fraco: foto de celular torta/mal iluminada. Documento de escritório
  escaneado é o caso forte. Se fotos ruins chegarem, ③ segura.
- ~13 s por página em CPU: adequado para upload de política (raro, admin),
  não para OCR por despesa.
