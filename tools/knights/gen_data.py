# -*- coding: utf-8 -*-
"""Build js/game/knightsData.js from the teacher's guidelines document (scratchpad/knights/guidelines.txt, produced by
frac/docx_text.py): scenario paragraphs, quotes, the 12 hints of every exercise (3 per stage), the final conclusion and the
illustration description are parsed from the document text; the logical structure (variables, sentences, columns) is the
hand-written STRUCT below, and is cross-checked against the document's own truth tables by the verification step."""
import re, io, json, sys
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

import os
HERE0 = os.path.dirname(os.path.abspath(__file__))
# usage: py -3 gen_data.py <guidelines.txt> [output knightsData.js]
#   guidelines.txt = the teacher's guidelines document as extracted text (it is not kept in the repository)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE0, 'guidelines.txt')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE0, '..', '..', 'js', 'game', 'knightsData.js')

ISO = re.compile('[\u2066-\u2069]')
lines = io.open(SRC, encoding='utf-8').read().split('\n')


def clean(s):
    return ISO.sub('', s).strip()


# ---- split the document into exercises and stages
exs = []
cur = None
stage = None
for ln in lines:
    c = clean(ln)
    m = re.match(r'^תרגיל (\d) — (.+)$', c)
    if m and 'סולם' not in c:
        cur = {'n': int(m.group(1)), 'title': m.group(2), 'stages': {}, 'head': [], 'tail': []}
        exs.append(cur)
        stage = None
        continue
    if cur is None:
        continue
    m = re.match(r'^שלב (\d) — (.+)$', c)
    if m:
        stage = int(m.group(1))
        cur['stages'][stage] = {'title': m.group(2), 'lines': []}
        continue
    if stage and c.startswith('טבלת האמת המלאה'):
        stage = 'tail'
        continue
    if stage == 'tail':
        cur['tail'].append(ln)
    elif stage:
        cur['stages'][stage]['lines'].append(ln)
    else:
        cur['head'].append(ln)


def keep_isolates(s):
    return s.strip(' ¦').strip()


def fix_bidi(s):
    """The document wraps LTR runs in isolates (LRI..PDI) but sometimes swallows a bracket or hyphen whose partner stays outside:
    '(x=אמת)' arrives as LRI '(x' PDI '=אמת)' and 'ל-x' as 'ל' LRI '-x' PDI, which the browser renders as 'x)=אמת)' and '-xל'.
    Move a leading '-' / unpaired '(' and an unpaired trailing ')' outside the isolate."""
    def one(m):
        c = m.group(1)
        pre = post = ''
        if c.startswith('-'):
            pre += '-'
            c = c[1:]
        if c.startswith('(') and ')' not in c:
            pre += '('
            c = c[1:]
        if c.endswith(')') and '(' not in c:
            post = ')'
            c = c[:-1]
        return pre + ('⁦' + c + '⁩' if c else '') + post
    return re.sub('⁦([^⁦⁩]*)⁩', one, s)


def wrap_equations(s):
    """'Sk = שקר(¬y) ∧ אמת(¬k) = שקר' is one left-to-right equation. The document isolates fragments of it, which scrambles the order
    in an RTL paragraph; re-wrap every '<S..> = ... ' equation (up to ';' or '.') as a single isolate."""
    def one(m):
        body = re.sub('[\u2066\u2069]', '', m.group(0)).strip()
        # every Hebrew word (אמת / שקר) is its own isolate, otherwise "שקר ∧ שקר = שקר" (Hebrew separated only by symbols) is laid
        # out right-to-left as a block inside the left-to-right equation and reads in the wrong order
        body = re.sub('[\u05d0-\u05ea]+', lambda w: '\u2066' + w.group(0) + '\u2069', body)
        # each equation is its own block (.kn-eq in the panel CSS): on a phone it scrolls sideways instead of wrapping in the middle
        return '<span class="kn-eq">\u2066' + body + '\u2069</span>'
    out, n = re.subn('\u2066S[A-Za-z0-9]*\u2069 = [^;.]*?[;.](?=\\s|$)', one, s)
    assert n == 2, ('wrap_equations expected two equations per hint', n, s[:60])
    return out


def emphasis(s):
    return fix_bidi(re.sub(r'\*([^*]+)\*', r'<em>\1</em>', s))


def hints_of(stage_lines):
    txt = ' '.join(stage_lines)
    i = txt.find('רמזים (משתחררים אחד-אחד):')
    h = txt[i + len('רמזים (משתחררים אחד-אחד):'):]
    parts = re.split(r'¦\s*\u2066?\d\u2069?\.\s*', h)
    parts = [emphasis(keep_isolates(p)) for p in parts if p.strip(' ¦')]
    assert len(parts) == 3, (len(parts), txt[:80])
    return parts


def after(label, block):
    """Text after a labelled line inside the exercise head: 'התרחיש: ¦ a ¦ b ...' -> [a, b ...]."""
    for ln in block:
        if clean(ln).startswith(label):
            body = ln.split(':', 1)[1] if ':' in ln else ln
            return [keep_isolates(p) for p in body.split('¦') if keep_isolates(p)]
    return []


data = []
for e in exs:
    head = e['head']
    scen = after('התרחיש', head)
    illus = after('תיאור לאיור/אנימציה', head)
    level_txt = next((clean(l) for l in head if clean(l).startswith('רמת')), '')
    # quotes: items that start with a double quote (after cleaning)
    quotes = [clean(p).strip('"').strip() for p in scen if clean(p).startswith('"')]
    # the class term is "תנאי העקביות" (the document says "חוק העקביות")
    paragraphs = [emphasis(p).replace('מחוק העקביות', 'מתנאי העקביות') for p in scen if not clean(p).startswith('"')]
    concl = ''
    for ln in e['tail']:
        if clean(ln).startswith('מסקנה סופית'):
            concl = emphasis(keep_isolates(ln.split(':', 1)[1]))
    data.append({
        'n': e['n'], 'title': e['title'], 'levelText': level_txt,
        'paragraphs': paragraphs, 'quotes': quotes, 'illustration': [clean(x) for x in illus],
        'hints': {str(k): hints_of(st['lines']) for k, st in sorted(e['stages'].items())},
        'stageTitles': {str(k): clean(st['title']) for k, st in sorted(e['stages'].items())},
        'conclusion': concl,
    })

# ---- hand-written logical structure (from the document's "משתנים" blocks)
# person variables have a Hebrew column name; fact variables are lamps. 'say': the sentences (speaker variable, connective,
# two literals [variable, negated]); 'columns': the determination column name(s) in the table.
STRUCT = {
    1: dict(people=[dict(v='x', name='ו׳', gender='m')], facts=[dict(v='L', lamp=4, label='נורית 4', says='נורית 4 דולקת')],
            vars=['x', 'L'], sentences=[dict(speaker='x', op='and', lits=[['x', 1], ['L', 0]])], scene='panel'),
    2: dict(people=[dict(v='x', name='ז׳', gender='f')], facts=[dict(v='L', lamp=11, label='נורית 11', says='נורית 11 דולקת')],
            vars=['x', 'L'], sentences=[dict(speaker='x', op='or', lits=[['x', 1], ['L', 1]])], scene='panel'),
    3: dict(people=[dict(v='a', name='ח׳', gender='m'), dict(v='g', name='ט׳', gender='m')], facts=[],
            vars=['a', 'g'], sentences=[dict(speaker='a', op='or', lits=[['a', 1], ['g', 1]])], scene='relay'),
    4: dict(people=[dict(v='y', name='י׳', gender='f'), dict(v='k', name='כ׳', gender='m')], facts=[],
            vars=['y', 'k'], sentences=[dict(speaker='y', op='and', lits=[['y', 0], ['k', 1]]),
                                        dict(speaker='k', op='and', lits=[['y', 1], ['k', 1]])], scene='duel'),
    5: dict(people=[dict(v='l', name='ל׳', gender='m'), dict(v='m', name='מ׳', gender='f')], facts=[dict(v='L6', lamp=6, label='נורית 6', says='נורית 6 דולקת')],
            vars=['l', 'm', 'L6'], sentences=[dict(speaker='l', op='and', lits=[['L6', 1], ['m', 1]]),
                                              dict(speaker='m', op='or', lits=[['m', 1], ['L6', 0]])], scene='panel2'),
    6: dict(people=[dict(v='n', name='נ׳', gender='m'), dict(v='s', name='ס׳', gender='f')], facts=[dict(v='L9', lamp=9, label='נורית 9', says='נורית 9 דולקת')],
            vars=['n', 's', 'L9'], sentences=[dict(speaker='n', op='and', lits=[['n', 1], ['L9', 0]]),
                                              dict(speaker='s', op='or', lits=[['s', 1], ['n', 1]])], scene='shift'),
}
# the document's own answer key (row number of the single consistent row, 1-based) and the document's final assignment
KEY = {1: 4, 2: 2, 3: 2, 4: 2, 5: 5, 6: 6}
RULE = {
    1: 'השורה עקבית (✓) אם ורק אם {x = S} (הערך המונח זהה לקביעה שחושבה)',
    2: 'השורה עקבית (✓) אם ורק אם {x = S}',
    3: 'השורה עקבית (✓) אם ורק אם {a = S} — ורק {a}, לא {g}!',
    4: 'השורה עקבית (✓) רק אם גם {y = Sy} וגם {k = Sk} בו־זמנית — שני התנאים חייבים להתקיים יחד',
    5: 'השורה עקבית (✓) רק אם גם {l = Sl} וגם {m = Sm} בו־זמנית, מתוך כל 8 השורות',
    6: 'השורה עקבית (✓) רק אם גם {n = Sn} וגם {s = Ss} בו־זמנית, מתוך כל 8 השורות',
}

for d in data:
    d.update(STRUCT[d['n']])
    d['keyRow'] = KEY[d['n']]

# hints, stage titles and the stage-4 rule are written for the method the teacher explained in class (deck "צדיקים ונוכלים"):
# the consistency condition is an "if and only if" sentence. See hints_iff.py next to this script.
import importlib.util, os
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('hints_iff', os.path.join(HERE, 'hints_iff.py'))
hints_iff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hints_iff)
for d in data:
    d['hints'] = hints_iff.build_hints(d)
    d['stageTitles'] = hints_iff.build_titles(d)
    d['rule'] = hints_iff.build_rule(d)
    sol = [i for i, r in enumerate(hints_iff.rows_of(d)) if all(r[sn['speaker']] == hints_iff.eval_sent(r, sn) for sn in d['sentences'])]
    assert sol == [d['keyRow'] - 1], ('the solution row must be unique and equal the document key', d['n'], sol)
    assert sol[0] != 0, 'row 1 is used for the worked examples in the hints, it must not be the solution'

js = io.StringIO()
js.write('''// ==========================================================================
// knightsData.js - נתוני ששת התרגילים של "צדיקים ונוכלים" (פסוקים לוגיים, לוח הבקרה והטכנאים).
// נוצר בסקריפט (scratchpad/knights/gen_data.py) מתוך מסמך ההנחיות של המורה: התרחישים, הציטוטים, 12 הרמזים של כל תרגיל
// (3 לכל שלב), המסקנות ותיאורי האיורים נשלפו מהמסמך כלשונם. המבנה הלוגי (משתנים, משפטים, עמודות) נכתב ידנית
// לפי בלוקי "משתנים" שבמסמך, ואומת מול טבלאות האמת במסמך (keyRow = השורה העקבית היחידה לפי המסמך).
//   people: הדוברים/הטכנאים (v = המשתנה "אמין", name = השם בטבלה)   facts: עובדות חיצוניות (נורית; v = "דולקת")
//   vars: סדר המשתנים בטבלה (קובע את סדר השורות: אמת לפני שקר)
//   sentences: [{speaker, op: 'and'|'or', lits: [[משתנה, שלילה 1/0], [משתנה, שלילה 1/0]], col}]
//   stageTitles[שלב]: כותרות השלבים   rule: כלל הבדיקה של שלב 4 ({..} = נוסחה משמאל לימין)
//   הרמזים, הכותרות והכלל נכתבו לפי השיטה שהמורה לימד בכיתה (מצגת "צדיקים ונוכלים"): תנאי העקביות הוא פסוק "אם ורק אם"  x ⟺ (הפסוק)  (hints_iff.py)
//   hints[שלב][0..2]: הרמזים כלשונם (עם בקרות כיווניות של Unicode סביב נוסחאות - הדפדפן מציג אותן נכון)
// ==========================================================================
export const EXERCISES = ''')
js.write(json.dumps(data, ensure_ascii=False, indent=2))
js.write(';\n')
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js.getvalue())
print('written', len(js.getvalue()), 'chars;', len(data), 'exercises;', sum(len(v) for d in data for v in d['hints'].values()), 'hints')
for d in data:
    print(d['n'], d['title'], '| quotes:', d['quotes'], '| concl:', d['conclusion'][:60])
