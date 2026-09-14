"""One paid provider request, only when explicitly enabled in protected CI."""
import os
import tempfile
from server import App

if os.environ.get('JAMPEIRO_LIVE_SMOKE_APPROVED') != 'true':
    raise SystemExit('Live smoke is not approved.')
if not (os.environ.get('OPENAI_API_KEY') or os.environ.get('OPEN_AI_KEY')):
    raise SystemExit('OpenAI credential not configured.')

with tempfile.TemporaryDirectory() as directory:
    app = App(data_dir=directory, ai_enabled=True)
    app.daily_limit = 1
    result = app.reply('Qual é o estado do WhatsApp com 360dialog na análise?', [])
    if result['mode'] != 'ai' or 'E10' not in [c['id'] for c in result['cards']]:
        raise SystemExit('Live provider validation failed; no response or credential logged.')
    print('OpenAI live smoke passed: curated E10 selection; one request; no deployment.')
