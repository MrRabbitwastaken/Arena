#!/usr/bin/env python3
"""Tiny ES-module bundler for this project (no npm needed).

Follows relative imports from src/main.js, orders modules so dependencies come first,
wraps each in a function scope and inlines the result plus the stylesheet into one HTML file.
Supports the subset of syntax the project uses: named imports and `export` on declarations.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMPORT_RE = re.compile(r"^import\s*\{([^}]*)\}\s*from\s*'([^']+)';\s*$", re.M)
EXPORT_RE = re.compile(r"^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z_$][\w$]*)", re.M)


def load(path, seen, order):
    path = os.path.normpath(path)
    if path in seen:
        return
    seen.add(path)
    src = open(path, encoding='utf-8').read()
    for _, spec in IMPORT_RE.findall(src):
        load(os.path.join(os.path.dirname(path), spec), seen, order)
    order.append(path)


def transform(path, ids):
    src = open(path, encoding='utf-8').read()
    def imp(m):
        names = []
        for part in m.group(1).split(','):
            part = part.strip()
            if not part:
                continue
            if ' as ' in part:
                a, b = [x.strip() for x in part.split(' as ')]
                names.append(f'{a}: {b}')
            else:
                names.append(part)
        target = os.path.normpath(os.path.join(os.path.dirname(path), m.group(2)))
        return f"const {{ {', '.join(names)} }} = __m[{ids[target]}];"
    src = IMPORT_RE.sub(imp, src)
    exports = [m.group(2) for m in EXPORT_RE.finditer(src)]
    src = re.sub(r"^export\s+", '', src, flags=re.M)
    if re.search(r"^\s*(import|export)\b", src, re.M):
        sys.exit(f'unsupported module syntax in {path}')
    rel = os.path.relpath(path, ROOT)
    return f"// ---- {rel}\n__m[{ids[path]}] = (function () {{\n{src}\nreturn {{ {', '.join(exports)} }};\n}})();\n"


def main():
    order, seen = [], set()
    load(os.path.join(ROOT, 'src', 'main.js'), seen, order)
    ids = {p: i for i, p in enumerate(order)}
    body = ''.join(transform(p, ids) for p in order)
    js = "(function () {\n'use strict';\nconst __m = [];\n" + body + "})();\n"
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    open(os.path.join(ROOT, 'dist', 'app.js'), 'w', encoding='utf-8').write(js)
    css = open(os.path.join(ROOT, 'src', 'styles', 'main.css'), encoding='utf-8').read()
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    html = re.sub(r'<link rel="stylesheet" href="src/styles/main.css"><!--STYLE-->', lambda _: f'<style>\n{css}</style>', html)
    html = re.sub(r'<script type="module" src="src/main.js"></script><!--SCRIPT-->', lambda _: f'<script>\n{js}</script>', html)
    open(os.path.join(ROOT, 'dist', 'medieval-arena.html'), 'w', encoding='utf-8').write(html)
    print(f'{len(order)} modules, {len(js)//1024} KB js, {len(html)//1024} KB html')


if __name__ == '__main__':
    main()
