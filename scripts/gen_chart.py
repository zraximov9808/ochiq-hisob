"""Draft of the chart of accounts from the 1C export (samples/ref/chart.xlsx, not in git).

Writes scripts/chart-draft.tsv: code, kind, currency flag, Russian name, Uzbek name taken from the
previous chart when the code existed there (empty otherwise). Uzbek names are then completed by hand
in scripts/chart-uz.tsv and the chart is built with scripts/build_chart.py.
"""
import pathlib, re, sys, warnings
import openpyxl

warnings.filterwarnings('ignore')
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'samples' / 'ref' / 'chart.xlsx'
old = {}
text = (root / 'src' / 'engine' / 'chart.ts').read_text(encoding='utf-8')
for line in re.search(r'CHART_SOURCE = `(.*?)`', text, re.S).group(1).strip().splitlines():
    code, name = line.split('|')[:2]
    old[code.strip()] = name.strip()

ws = openpyxl.load_workbook(src).active
out = []
for r in range(3, ws.max_row + 1):
    code = str(ws.cell(r, 2).value or '').strip()
    if not code:
        continue
    ru = ' '.join(str(ws.cell(r, 3).value or '').split())
    cur = '+' if str(ws.cell(r, 4).value or '').strip() == '+' else ''
    kind = {'А': 'A', 'П': 'P', 'Т': 'T', 'КА': 'KA', 'З': 'Z', 'АП': 'AP'}.get(str(ws.cell(r, 6).value or '').strip(), '')
    out.append('\t'.join([code, kind, cur, ru, old.get(code, '')]))
(root / 'scripts' / 'chart-draft.tsv').write_text('\n'.join(out) + '\n', encoding='utf-8')
print(len(out), 'accounts;', sum(1 for l in out if l.split('\t')[4]), 'with an Uzbek name from the old chart')
