"""Create an allowlisted, deterministic review artifact; never bundle private data."""
import hashlib
import io
import json
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
version = json.loads((ROOT/'public'/'knowledge.json').read_text())['version']
files = [ROOT/'server.py', ROOT/'README.md', *sorted((ROOT/'public').rglob('*')), *sorted((ROOT/'deploy').glob('*'))]
files = [p for p in files if p.is_file()]
for path in files:
    relative = path.relative_to(ROOT)
    if path.is_symlink() or any(part.startswith('.') for part in relative.parts):
        raise SystemExit('Unexpected release file.')
manifest = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
out = ROOT/'release'
out.mkdir(exist_ok=True)
archive = out/f'jhonemejampeiro-{version}.tar'
with tarfile.open(archive, 'w', format=tarfile.USTAR_FORMAT) as tar:
    for path in files:
        content = path.read_bytes()
        entry = tarfile.TarInfo(str(path.relative_to(ROOT)))
        entry.size, entry.mode, entry.mtime = len(content), 0o644, 0
        tar.addfile(entry, io.BytesIO(content))
    content = (json.dumps(manifest, sort_keys=True, indent=2)+'\n').encode()
    entry = tarfile.TarInfo('SHA256SUMS.json')
    entry.size, entry.mode, entry.mtime = len(content), 0o644, 0
    tar.addfile(entry, io.BytesIO(content))
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(out/'SHA256SUMS').write_text(f'{digest}  {archive.name}\n')
print(f'{digest}  {archive.name}; {len(files)} allowlisted files')
