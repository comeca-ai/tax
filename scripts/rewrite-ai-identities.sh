#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_PATH="$REPO_ROOT/scripts/ai-identities.json"

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Arquivo de configuração não encontrado: $CONFIG_PATH" >&2
  exit 1
fi

TARGET_NAME="${TARGET_NAME:-Emerick}"
TARGET_EMAIL="${TARGET_EMAIL:-}"
DRY_RUN="${DRY_RUN:-true}"

if [[ -z "$TARGET_EMAIL" ]]; then
  TARGET_EMAIL="$(python3 - "$CONFIG_PATH" <<'PY'
import json
import sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    config = json.load(f)
print(config.get('target', {}).get('email', '').strip())
PY
)"
fi

if [[ -z "$TARGET_EMAIL" ]]; then
  echo "TARGET_EMAIL não pode ser vazio." >&2
  exit 1
fi


git_repo() {
  local repo_dir="$1"
  shift
  if [[ -f "$repo_dir/config" ]] && grep -Eq '^[[:space:]]*bare[[:space:]]*=[[:space:]]*true[[:space:]]*$' "$repo_dir/config"; then
    git -c safe.bareRepository=all -C "$repo_dir" "$@"
  else
    git -C "$repo_dir" "$@"
  fi
}

audit_repo() {
  local repo_dir="$1"
  local audit_py
  audit_py="$(mktemp)"
  cat > "$audit_py" <<'PY'
import json
import os
import re
import sys

config = json.load(open(os.environ['CONFIG_PATH'], encoding='utf-8'))
name_patterns = [re.compile(p, re.IGNORECASE) for p in config.get('name_patterns', [])]
email_patterns = [re.compile(p, re.IGNORECASE) for p in config.get('email_patterns', [])]

protect_humans = {'jhon', 'jhoneme', 'comeca-ai'}
protect_pairs = {
    ('dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com'),
    ('github-actions[bot]', '41898282+github-actions[bot]@users.noreply.github.com'),
    ('web-flow', 'noreply@github.com'),
    ('github', 'noreply@github.com'),
}

def is_protected(name, email):
    n = (name or '').strip().lower()
    e = (email or '').strip().lower()
    if n in protect_humans:
        return True
    if (n, e) in protect_pairs:
        return True
    if n in {'web-flow', 'github'} and e == 'noreply@github.com':
        return True
    return False

def matches_ai(name, email):
    if is_protected(name, email):
        return False
    return any(r.search(name or '') for r in name_patterns) or any(r.search(email or '') for r in email_patterns)

records = [chunk for chunk in sys.stdin.read().split('\x1e') if chunk.strip()]
affected_commits = 0
identities = set()

for record in records:
    lines = record.splitlines()
    while lines and not lines[0].strip():
        lines.pop(0)
    if len(lines) < 5:
        continue

    author_name, author_email = lines[1], lines[2]
    committer_name, committer_email = lines[3], lines[4]
    body_lines = lines[5:]

    commit_affected = False

    if matches_ai(author_name, author_email):
        identities.add((author_name.strip(), author_email.strip()))
        commit_affected = True
    if matches_ai(committer_name, committer_email):
        identities.add((committer_name.strip(), committer_email.strip()))
        commit_affected = True

    for line in body_lines:
        m = re.match(r'^Co-authored-by:\s*(.*?)\s*<(.*?)>\s*$', line, re.IGNORECASE)
        if m and matches_ai(m.group(1), m.group(2)):
            identities.add((m.group(1).strip(), m.group(2).strip()))
            commit_affected = True

    if commit_affected:
        affected_commits += 1

print(f"AFFECTED_COMMITS={affected_commits}")
for name, email in sorted(identities, key=lambda x: (x[0].lower(), x[1].lower())):
    print(f"IDENTITY={name} <{email}>")
PY

  git_repo "$repo_dir" log --format='%H%n%an%n%ae%n%cn%n%ce%n%B%x1e' | CONFIG_PATH="$CONFIG_PATH" python3 "$audit_py"
  rm -f "$audit_py"
}

build_mailmap() {
  local repo_dir="$1"
  local mailmap_path="$2"
  local mailmap_py
  mailmap_py="$(mktemp)"
  cat > "$mailmap_py" <<'PY'
import json
import os
import re
import sys

mailmap_path = sys.argv[1]
config = json.load(open(os.environ['CONFIG_PATH'], encoding='utf-8'))
target_name = os.environ['TARGET_NAME'].strip()
target_email = os.environ['TARGET_EMAIL'].strip()
name_patterns = [re.compile(p, re.IGNORECASE) for p in config.get('name_patterns', [])]
email_patterns = [re.compile(p, re.IGNORECASE) for p in config.get('email_patterns', [])]

protect_humans = {'jhon', 'jhoneme', 'comeca-ai'}
protect_pairs = {
    ('dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com'),
    ('github-actions[bot]', '41898282+github-actions[bot]@users.noreply.github.com'),
    ('web-flow', 'noreply@github.com'),
    ('github', 'noreply@github.com'),
}

def is_protected(name, email):
    n = (name or '').strip().lower()
    e = (email or '').strip().lower()
    if n in protect_humans:
        return True
    if (n, e) in protect_pairs:
        return True
    if n in {'web-flow', 'github'} and e == 'noreply@github.com':
        return True
    return False

def matches_ai(name, email):
    if is_protected(name, email):
        return False
    return any(r.search(name or '') for r in name_patterns) or any(r.search(email or '') for r in email_patterns)

entries = set()
for raw in sys.stdin:
    line = raw.rstrip('\n')
    if not line or '\t' not in line:
        continue
    name, email = line.split('\t', 1)
    name = name.strip()
    email = email.strip()
    if email and matches_ai(name, email):
        entries.add((name, email))

with open(mailmap_path, 'w', encoding='utf-8') as f:
    for name, email in sorted(entries, key=lambda x: (x[0].lower(), x[1].lower())):
        f.write(f"{target_name} <{target_email}> {name} <{email}>\n")
PY

  git_repo "$repo_dir" log --format='%an%x09%ae%n%cn%x09%ce' | \
    CONFIG_PATH="$CONFIG_PATH" TARGET_NAME="$TARGET_NAME" TARGET_EMAIL="$TARGET_EMAIL" python3 "$mailmap_py" "$mailmap_path"
  rm -f "$mailmap_py"
}

run_rewrite() {
  local repo_dir="$1"
  local audit_before audit_after
  local mailmap_file callback_file

  audit_before="$(audit_repo "$repo_dir")"
  echo "$audit_before"

  mailmap_file="$(mktemp)"
  callback_file="$(mktemp)"
  build_mailmap "$repo_dir" "$mailmap_file"

  cat > "$callback_file" <<'PY'
import json
import os
import re

config = json.load(open(os.environ['CONFIG_PATH'], encoding='utf-8'))
TARGET_NAME = os.environ['TARGET_NAME'].strip()
TARGET_EMAIL = os.environ['TARGET_EMAIL'].strip()
name_patterns = [re.compile(p, re.IGNORECASE) for p in config.get('name_patterns', [])]
email_patterns = [re.compile(p, re.IGNORECASE) for p in config.get('email_patterns', [])]

protect_humans = {'jhon', 'jhoneme', 'comeca-ai'}
protect_pairs = {
    ('dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com'),
    ('github-actions[bot]', '41898282+github-actions[bot]@users.noreply.github.com'),
    ('web-flow', 'noreply@github.com'),
    ('github', 'noreply@github.com'),
}

def is_protected(name, email):
    n = (name or '').strip().lower()
    e = (email or '').strip().lower()
    if n in protect_humans:
        return True
    if (n, e) in protect_pairs:
        return True
    if n in {'web-flow', 'github'} and e == 'noreply@github.com':
        return True
    return False

def matches_ai(name, email):
    if is_protected(name, email):
        return False
    return any(r.search(name or '') for r in name_patterns) or any(r.search(email or '') for r in email_patterns)

def normalize(line):
    return re.sub(r'\s+', ' ', line.strip()).lower()

text = message.decode('utf-8', errors='replace')
lines = text.splitlines(keepends=True)
seen_co_authored = set()
rewritten = []

for line in lines:
    stripped = line.rstrip('\r\n')
    suffix = line[len(stripped):]

    co = re.match(r'^\s*Co-authored-by:\s*(.*?)\s*<(.*?)>\s*$', stripped, re.IGNORECASE)
    if co:
        name = co.group(1).strip()
        email = co.group(2).strip()
        if matches_ai(name, email):
            canonical = f'Co-authored-by: {TARGET_NAME} <{TARGET_EMAIL}>'
        else:
            canonical = f'Co-authored-by: {name} <{email}>'
        key = normalize(canonical)
        if key in seen_co_authored:
            continue
        seen_co_authored.add(key)
        rewritten.append(canonical + suffix)
        continue

    signed = re.match(r'^\s*Signed-off-by:\s*(.*?)\s*<(.*?)>\s*$', stripped, re.IGNORECASE)
    if signed:
        name = signed.group(1).strip()
        email = signed.group(2).strip()
        if name.lower() == 'dependabot[bot]':
            rewritten.append(line)
            continue
        if matches_ai(name, email):
            continue
        rewritten.append(line)
        continue

    rewritten.append(line)

return ''.join(rewritten).encode('utf-8')
PY

  CONFIG_PATH="$CONFIG_PATH" TARGET_NAME="$TARGET_NAME" TARGET_EMAIL="$TARGET_EMAIL" \
    git_repo "$repo_dir" filter-repo --force --mailmap "$mailmap_file" --message-callback "$(cat "$callback_file")"

  audit_after="$(audit_repo "$repo_dir")"
  echo "$audit_after"

  local before_count after_count
  before_count="$(printf '%s\n' "$audit_before" | awk -F= '/^AFFECTED_COMMITS=/{print $2; exit}')"
  after_count="$(printf '%s\n' "$audit_after" | awk -F= '/^AFFECTED_COMMITS=/{print $2; exit}')"
  echo "Resumo de commits afetados (antes -> depois): ${before_count:-0} -> ${after_count:-0}"

  rm -f "$mailmap_file" "$callback_file"
}

if [[ "${DRY_RUN,,}" == "true" ]]; then
  tmp_dir="$(mktemp -d /tmp/rewrite-ai-identities.XXXXXX)"
  mirror_dir="$tmp_dir/repo.git"
  trap 'rm -rf "$tmp_dir"' EXIT

  git clone --mirror "$REPO_ROOT" "$mirror_dir" >/dev/null 2>&1
  run_rewrite "$mirror_dir"
  echo "DRY_RUN=true: nenhuma alteração aplicada ao repositório de trabalho."
else
  run_rewrite "$REPO_ROOT"
fi
