#!/usr/bin/env python3
# Adds translations to the locale catalogs (src/core/locales/{es,gl,fr,de}.ts)
# without regenerating them: keys already present are left untouched.
#
# Usage: python3 scripts/i18n/apply-translations.py <es-gl file> <fr-de file>
#   <es-gl file>: one entry per line, `English key ||| Spanish ||| Galician`
#   <fr-de file>: one entry per line, `English key ||| French ||| German`
# Relative paths are resolved against scripts/i18n/sources/ first, then the
# current directory. French text gets non-breaking spaces before : ; ! ? and
# inside « ». Runs are serialized with a file lock.
import os, re, sys
if os.name == 'nt':
  import msvcrt
else:
  import fcntl

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SOURCES = os.path.join(ROOT, 'scripts', 'i18n', 'sources')
LOCALES = os.path.join(ROOT, 'src', 'core', 'locales')
NB, NNB = '\u00a0', '\u202f'

def french(s):
  s = re.sub(r' :(?=\s|$)', NB + ':', s)
  s = re.sub(r' ([;!?])', NNB + r'\1', s)
  return s.replace('« ', '«' + NB).replace(' »', NB + '»')

def quote(s):
  return "'" + s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n') + "'"

def resolve(name):
  for path in (os.path.join(SOURCES, name), name):
    if os.path.exists(path): return path
  sys.exit(f'not found: {name}')

def read(name):
  rows = []
  for line in open(resolve(name), encoding='utf8'):
    line = line.rstrip('\n')
    if not line.strip(): continue
    parts = line.split(' ||| ')
    if len(parts) != 3: sys.exit(f'{name}: expected 3 columns: {line}')
    rows.append(parts)
  return rows

if len(sys.argv) != 3: sys.exit(__doc__ or 'usage: apply-translations.py <es-gl file> <fr-de file>')
lock = open(os.path.join(ROOT, 'node_modules', '.i18n.lock') if os.path.isdir(os.path.join(ROOT, 'node_modules')) else os.path.join(SOURCES, '.lock'), 'w')
if os.name == 'nt':
  lock.write('0')
  lock.flush()
  lock.seek(0)
  msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
else:
  fcntl.flock(lock, fcntl.LOCK_EX)
for name, langs in ((sys.argv[1], ('es', 'gl')), (sys.argv[2], ('fr', 'de'))):
  rows = read(name)
  for i, lang in enumerate(langs):
    path = os.path.join(LOCALES, f'{lang}.ts')
    src = open(path, encoding='utf8').read()
    add = []
    for row in rows:
      if (quote(row[0]) + ':') in src: continue
      value = french(row[i + 1]) if lang == 'fr' else row[i + 1]
      add.append(f'  {quote(row[0])}: {quote(value)},')
    end = src.rindex('\n}\n')
    src = src[:end] + ('\n' + '\n'.join(add) if add else '') + src[end:]
    open(path, 'w', encoding='utf8').write(src)
    print(lang, 'added', len(add))
