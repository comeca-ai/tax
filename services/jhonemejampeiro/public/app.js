const $ = (s) => document.querySelector(s);
const api = (path) => new URL(`./api/${path}`, location.href);
const messages = $('#messages');
let busy = false;
let initialized = false;

function element(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

function safeLink(label, url) {
  const parsed = new URL(url, location.href);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'oreembolsobot.app') throw new Error('Referência inválida.');
  const a = element('a', label);
  a.href = parsed.href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function showMessage(message) {
  $('#welcome').hidden = true;
  const article = element('article', undefined, `message ${message.role === 'user' ? 'user' : 'assistant'}`);
  article.append(element('div', message.role === 'user' ? 'VOCÊ' : 'JHONEMEJAMPEIRO', 'message-label'), element('p', message.text));
  for (const card of message.cards || []) {
    const section = element('section', undefined, 'answer-card');
    const heading = element('div', undefined, 'card-heading');
    heading.append(element('h3', `${card.id} · ${card.title}`), element('span', card.status, 'card-status'));
    section.append(heading, element('p', card.body), safeLink(`${card.source.label} ↗`, card.source.url));
    article.append(section);
  }
  if (message.note) article.append(element('p', message.note, 'answer-note'));
  messages.append(article);
}

function controls(enabled) {
  $('#question').disabled = !enabled;
  $('#send').disabled = !enabled;
  $('#clear').disabled = !enabled;
  document.querySelectorAll('[data-question]').forEach((b) => { b.disabled = !enabled; });
}

async function request(path, options = {}) {
  const response = await fetch(api(path), { credentials: 'same-origin', ...options,
    headers: { 'Content-Type': 'application/json', 'X-Jampeiro-Request': '1', ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir. Tente novamente.');
  return result;
}

function error(message) {
  $('#error').textContent = message;
  $('#error').hidden = !message;
}

async function boot() {
  controls(false);
  const state = await request('session');
  $('#mode').textContent = state.mode === 'ai' ? 'IA + evidências' : 'Busca nas evidências';
  document.querySelectorAll('.message').forEach((m) => m.remove());
  $('#welcome').hidden = state.messages.length > 0;
  state.messages.forEach(showMessage);
  initialized = true;
  controls(true);
  messages.scrollTop = messages.scrollHeight;
}

$('#chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = $('#question').value.trim();
  if (!question || busy || !initialized) return;
  busy = true;
  controls(false);
  error('');
  const thinking = element('div', 'Consultando a base de evidências…', 'thinking');
  thinking.setAttribute('role', 'status');
  messages.append(thinking);
  messages.scrollTop = messages.scrollHeight;
  try {
    const result = await request('chat', { method: 'POST', body: JSON.stringify({ message: question }) });
    result.messages.forEach(showMessage);
    $('#question').value = '';
  } catch (e) {
    error(e.message);
  } finally {
    thinking.remove();
    busy = false;
    controls(true);
    $('#question').focus();
    messages.scrollTop = messages.scrollHeight;
  }
});

$('#question').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $('#chat-form').requestSubmit();
  }
});

document.querySelectorAll('[data-question]').forEach((button) => {
  button.addEventListener('click', () => {
    $('#question').value = button.dataset.question;
    $('#chat-form').requestSubmit();
  });
});

$('#clear').addEventListener('click', async () => {
  if (busy || !confirm('Apagar definitivamente esta conversa do servidor?')) return;
  controls(false);
  error('');
  try {
    await request('session', { method: 'DELETE' });
    await boot();
  } catch (e) { error(e.message); controls(true); }
});

$('#close-dialog').addEventListener('click', () => $('#screen-dialog').close());

async function sources() {
  const response = await fetch('./knowledge.json');
  if (!response.ok) throw new Error('Fontes temporariamente indisponíveis.');
  const knowledge = await response.json();
  $('#report-link').href = safeLink('', knowledge.reportUrl).href;
  const links = [{ label: 'Relatório e matriz de evidências', url: knowledge.reportUrl }, ...knowledge.downloads];
  links.forEach((item) => $('#downloads').append(safeLink(`${item.label} ↗`, item.url)));
  const screenResponse = await fetch('./screens/manifest.json');
  if (!screenResponse.ok) { $('#screens').append(element('p', 'Capturas em preparação.')); return; }
  for (const screen of await screenResponse.json()) {
    if (!/^[a-z]+\.png$/.test(screen.image)) continue;
    const button = element('button', undefined, 'screen');
    const img = element('img');
    img.src = `./screens/${screen.image}`;
    img.alt = `${screen.title} com dados fictícios`;
    img.loading = 'lazy';
    button.append(img, element('span', screen.title));
    button.addEventListener('click', () => {
      $('#screen-title').textContent = screen.title;
      $('#screen-image').src = img.src;
      $('#screen-image').alt = img.alt;
      $('#screen-dialog').showModal();
    });
    $('#screens').append(button);
  }
}

controls(false);
Promise.all([boot(), sources()]).catch((e) => { error(e.message); if (!initialized) $('#mode').textContent = 'Sem conexão'; });
