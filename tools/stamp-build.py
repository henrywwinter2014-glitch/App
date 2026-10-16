# Stamp the build onto index.html and onto every local script and stylesheet it loads, so a
# browser that cached an older file fetches the new one instead of reusing it.
import re, sys
build = sys.argv[1]
path = sys.argv[2] if len(sys.argv) > 2 else 'index.html'
s = open(path, encoding='utf-8').read()
s = s.replace('<meta name="build" content="dev">', '<meta name="build" content="%s">' % build)
s = re.sub(r'(<(?:script|link)[^>]*\b(?:src|href)=")(?!https?:|//|data:)([^"?#]+)"',
           lambda m: '%s%s?v=%s"' % (m.group(1), m.group(2), build), s)
open(path, 'w', encoding='utf-8').write(s)
print('stamped %s as %s' % (path, build))
