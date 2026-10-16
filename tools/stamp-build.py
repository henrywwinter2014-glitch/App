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
# The worker names its caches after the build, so a deploy installs fresh ones and drops the
# old, and it stamps the files it precaches to match what the page asks for.
try:
    sw = open('sw.js', encoding='utf-8').read()
    sw = sw.replace("const BUILD = 'dev';", "const BUILD = '%s';" % build, 1)
    open('sw.js', 'w', encoding='utf-8').write(sw)
    print('stamped sw.js as %s' % build)
except FileNotFoundError:
    pass
print('stamped %s as %s' % (path, build))
