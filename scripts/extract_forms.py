"""Form definitions from the official templates (samples/ref/*.xltx, not in git) → src/forms/defs.generated.ts.

Only structure is taken: titles, column headers, line codes and names, which cells are closed ("х"),
calculated (a number in the template) or typed in (empty), and the column formulas of the number row
("11=3+4+8+9-10"). Company header blocks, signatures and any filled-in values are skipped.
Texts are transliterated from Uzbek Cyrillic to Latin (plain apostrophes, normalised by the app).
"""
import json, pathlib, re, warnings
import openpyxl
from openpyxl.utils import get_column_letter

warnings.filterwarnings('ignore')
root = pathlib.Path(__file__).resolve().parent.parent
ref = root / 'samples' / 'ref'

SHEETS = [
    ('balans.xltx', 'list02', 'b1', 'balance'),
    ('balans.xltx', 'list03', 'b1-offbal', 'balance'),
    ('moliyaviy.xltx', 'list02', 'f2', 'income'),
    ('moliyaviy.xltx', 'list03', 'f2-budget', 'income'),
    ('foyda.xltx', 'list01', 'tax', 'tax'),
    ('foyda.xltx', 'list02', 'tax-1', 'tax'),
    ('foyda.xltx', 'list03', 'tax-2', 'tax'),
    ('foyda.xltx', 'list04', 'tax-2.1', 'tax'),
    ('foyda.xltx', 'list05', 'tax-2.1a', 'tax'),
    ('foyda.xltx', 'list06', 'tax-2.1b', 'tax'),
    ('foyda.xltx', 'list07', 'tax-3', 'tax'),
    ('foyda.xltx', 'list08', 'tax-4', 'tax'),
    ('foyda.xltx', 'list09', 'tax-5', 'tax'),
    ('foyda.xltx', 'list10', 'tax-6', 'tax'),
    ('foyda.xltx', 'list11', 'tax-7', 'tax'),
    ('foyda.xltx', 'list12', 'tax-8', 'tax'),
    ('foyda.xltx', 'list13', 'tax-9', 'tax'),
    ('foyda.xltx', 'list14', 'tax-10', 'tax'),
    ('foyda.xltx', 'list15', 'tax-11', 'tax'),
]

# ---- Uzbek Cyrillic → Latin -------------------------------------------------------------------
SIMPLE = {'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
          'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ш': 'sh', 'ч': 'ch', 'щ': 'sh', 'ы': 'i', 'э': 'e',
          'ю': 'yu', 'я': 'ya', 'ё': 'yo', 'ў': "o'", 'қ': 'q', 'ғ': "g'", 'ҳ': 'h', 'ъ': "'", 'ь': ''}
VOWELS = set('аеёиоуэюяўАЕЁИОУЭЮЯЎ')


def to_latin(s: str) -> str:
    out = []
    for i, ch in enumerate(s):
        low = ch.lower()
        prev = s[i - 1] if i else ' '
        if low == 'е':
            lat = 'ye' if (not prev.isalpha() or prev in VOWELS or prev.lower() in 'ъь') else 'e'
        elif low == 'ц':
            lat = 'ts' if prev in VOWELS else 's'
        elif low in SIMPLE:
            lat = SIMPLE[low]
        else:
            out.append(ch)
            continue
        if ch != low and lat:
            nxt = s[i + 1] if i + 1 < len(s) else ''
            lat = lat.upper() if (len(lat) > 1 and nxt.isupper()) else lat[0].upper() + lat[1:]
        out.append(lat)
    return re.sub(r'\s+', ' ', ''.join(out)).strip()


def text(v) -> str:
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return re.sub(r'\s+', ' ', str(v)).strip()


CODE = re.compile(r'^(0\d{2,5}|[1-9]\d{2})$')
SKIP = re.compile(r'^(раҳбар|бош бухгалтер|бош ҳисобчи|изоҳ|маълумот учун$)', re.I)


def merged_value(ws, r, c):
    for rng in ws.merged_cells.ranges:
        if rng.min_row <= r <= rng.max_row and rng.min_col <= c <= rng.max_col:
            return ws.cell(rng.min_row, rng.min_col).value
    return ws.cell(r, c).value


def parse_formula(label: str, codes: list):
    """Same-form sums and differences as a formula string ("020 + 050 + 051 - 052"):
    "(сатр. 010 - 011)", "(010-сатр — 020-сатр)", "(020-сатр ва 050 - 280-сатрлар йиғиндиси)",
    "(021-026-сатрлар йиғиндиси)", "(280 дан 470 сатргача 291 сатрдан ташқари)".
    References to other annexes, products, ratios and "excluding/of which" phrases return None (written by hand)."""
    m = re.findall(r'\(([^()]*сатр[^()]*)\)', label)
    if not m:
        return None
    part = m[-1]
    low = part.lower()
    if 'илова' in low or '×' in part or ' x ' in part or ' х ' in part or '/' in part or '%' in part or 'устун' in low:
        return None
    if 'ташқари' in low and 'гача' not in low:
        return None
    excl = re.findall(r'(\d{3,5})\s*сатрдан\s*ташқари', part)
    rng = re.search(r'(\d{3,5})(?:\s*-?\s*сатр)?\s*(?:-|–|—|дан)\s*(\d{3,5})\s*-?\s*сатр(?:лар|гача)', part)
    if rng and ('йиғинди' in low or 'гача' in low or 'сумма' in low):
        a, b = rng.group(1), rng.group(2)
        terms = re.findall(r'(\d{3,5})', part[:rng.start()])
        terms += [c for c in codes if a <= c <= b and len(c) == len(a) and c not in excl]
        return ' + '.join(terms) if terms else None
    out, sign = [], '+'
    for t in re.findall(r'([+\-–—]|ва|ёки|\d{3,5})', part):
        if t in ('+', 'ва', 'ёки'):
            sign = '+'
        elif t in ('-', '–', '—'):
            sign = '-'
        else:
            out.append(t if not out else f'{sign} {t}')
            sign = '+'
    return ' '.join(out) if len(out) > 1 else None


def extract(file, sheet, fid, group):
    ws = openpyxl.load_workbook(ref / file)[sheet]
    # number row: B=1, C=2
    num_row = next((r for r in range(1, 40) if text(ws.cell(r, 2).value) == '1' and text(ws.cell(r, 3).value) == '2'), None)
    head_row = next(r for r in range(1, 40) if 'сатр коди' in ' '.join(text(c.value).lower() for c in ws[r]))
    code_col = next(c.column for c in ws[head_row] if 'сатр коди' in text(c.value).lower())
    label_col = 2
    first = (num_row or head_row) + 1
    # value columns
    if num_row:
        cols = [c.column for c in ws[num_row] if c.column > code_col and text(c.value)]
    else:
        cols = [c.column for c in ws[head_row] if c.column > code_col and text(c.value)]
    columns, col_formulas = [], {}
    for c in cols:
        num = text(ws.cell(num_row, c).value) if num_row else str(len(columns) + 3)
        parts = []
        for r in range(head_row, (num_row or head_row + 1)):
            v = text(merged_value(ws, r, c))
            if v and v not in parts and not v.startswith('СТИР'):
                parts.append(v)
        label = ' / '.join(to_latin(p) for p in parts) or to_latin(text(ws.cell(head_row, c).value))
        cid = num.split('=')[0]
        if '=' in num:
            col_formulas[cid] = num.split('=', 1)[1].replace('+', ' + ').replace('-', ' - ')
        columns.append({'id': cid, 'num': cid, 'label': label, 'letter': get_column_letter(c)})
    # title: texts above the header (not "СТИР", not numbers)
    title_parts = []
    for r in range(1, head_row):
        for c in ws[r]:
            t = text(c.value)
            if t and not t.startswith('lc=') and 'СТИР' not in t and 'Ҳужжат тури' not in t and not re.fullmatch(r'[\d.]+', t) and 'Ўлчов бирлиги' not in t and t != '.':
                if c.column == label_col or len(title_parts) < 2:
                    title_parts.append(t)
    lines, codes = [], []
    for r in range(first, ws.max_row + 1):
        label = text(merged_value(ws, r, label_col))
        code = text(ws.cell(r, code_col).value)
        if label and SKIP.match(label):
            if label.lower().startswith(('раҳбар', 'бош', 'изоҳ')):
                break
        if CODE.match(code):
            cells = {}
            for col in columns:
                v = ws[f"{col['letter']}{r}"].value
                t = text(v).lower()
                cells[col['id']] = 'x' if t in ('x', 'х') else ('calc' if isinstance(v, (int, float)) or (t and re.fullmatch(r'-?[\d.]+', t)) else 'input')
            codes.append(code)
            # a bare number in the label column is something a filer typed (an activity code), not a line name
            lines.append({'code': code, 'label': '' if re.fullmatch(r'[\d.]+', label) else label, 'cells': cells, 'kind': 'line'})
        elif label and not re.fullmatch(r'[\d.]+', label):
            lines.append({'label': label, 'kind': 'header'})
    for l in lines:
        if l.get('code'):
            f = parse_formula(l['label'], codes)
            if f:
                l['formula'] = f
        l['label'] = to_latin(l['label'])
    for col in columns:
        del col['letter']
    title = to_latin(' — '.join(title_parts[:2]))
    return {'id': fid, 'group': group, 'title': title, 'columns': columns, 'colFormulas': col_formulas, 'lines': lines}


def main():
    forms = [extract(*s) for s in SHEETS]
    body = json.dumps({f['id']: f for f in forms}, ensure_ascii=False, indent=1)
    (root / 'src' / 'forms' / 'defs.generated.ts').write_text(
        '/* Generated by scripts/extract_forms.py from the official templates — do not edit by hand. */\n'
        "import type { RawFormDef } from './types';\n\n"
        f'export const GENERATED: Record<string, RawFormDef> = {body};\n',
        encoding='utf-8', newline='\n')
    for f in forms:
        print(f["id"], len(f['columns']), 'cols', sum(1 for l in f['lines'] if l.get('code')), 'lines', sum(1 for l in f['lines'] if l.get('formula')), 'totals', '|', f['title'][:70])


if __name__ == '__main__':
    main()
