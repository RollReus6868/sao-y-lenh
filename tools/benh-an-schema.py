"""Build src/benh-an-schema.json (the layout of "B. PHẦN BỆNH ÁN") from a saved
OneMES "Thông tin bệnh án" page. Only labels, ids and choices are kept, never values.
part 1 is saved by SaveTtChung (Thông tin chung), part 2 by SaveTtChuyenKhoa.
Usage: python3 tools/benh-an-schema.py 5-thong-tin-benh-an.html src/benh-an-schema.json
"""
import json
import re
import sys

from bs4 import BeautifulSoup, NavigableString

# Thông tin chung from Tuần hoàn down is left out: Khoa Nội B never fills these
# (asked 2026-10-10). The tool neither shows nor writes them.
SKIP = {
    'txtKhamTuanHoan', 'txtKhamHoHap', 'txtKhamTieuHoa', 'txtKhamThanTietNieu', 'txtKhamThanKinh',
    'txtKhamCoXuongKhop', 'txtKhamCotSongThatLung', 'txtKhamTaiMuiHong', 'txtKhamRangHamMat', 'txtKhamMat',
    'txtKhamNoiTiet', 'txtKhamDinhDuong', 'txtKhamCoQuanKhac', 'txtMoTaCoQuanBenhLy', 'txtCanLamSang',
    'txtTomTatBenhAn', 'txtTienLuong', 'txtPpDieuTri',
}


def clean(t):
    t = re.sub(r'\s+', ' ', t or '').strip()
    return re.sub(r'^[.\s]+|[:\s]+$', '', t).strip()


def label_of(el):
    td = el.find_parent('td')
    if td is not None:
        l = td.find(class_='leftLabel')
        if l:
            return clean(l.get_text(' '))
    fg = el.find_parent('div', class_='form-group')
    if fg is not None:
        b = fg.find('b')
        if b:
            return clean(b.get_text(' '))
        nxt = el.find_next_sibling('span')
        if el.get('type') == 'checkbox' and nxt:
            return clean(nxt.get_text(' '))
        txt = ''.join(x for x in fg.contents if isinstance(x, NavigableString))
        return clean(txt)
    return ''


def main(src, out):
    html = open(src, encoding='utf-8', errors='ignore').read()
    b = html.find('B. PHẦN BỆNH ÁN')
    c = html.find('C. TỔNG KẾT BỆNH ÁN')
    if b < 0 or c < 0:
        sys.exit('không thấy mục B. PHẦN BỆNH ÁN')
    soup = BeautifulSoup(html[html.rfind('<h3', 0, b):c], 'lxml')
    groups = []
    group = None
    seen = set()

    def new_group(title, level):
        nonlocal group
        group = {'title': title, 'level': level, 'fields': []}
        groups.append(group)

    for el in soup.find_all(['a', 'legend', 'input', 'select', 'textarea']):
        if el.name == 'a':
            t = clean(el.get_text(' '))
            if re.match(r'^[IV]+\. ', t) and 'font-weight' in (el.get('style') or ''):
                new_group(t, 1)
            continue
        if el.name == 'legend':
            new_group(clean(el.get_text(' ')), 2)
            continue
        typ = (el.get('type') or '').lower()
        key = el.get('id') or el.get('name')
        if not key or typ in ('submit', 'button', 'search', 'hidden') or key in seen:
            continue
        if el.name == 'select' and 'select2-hidden-accessible' in (el.get('class') or []):
            continue  # ICD pickers fed by a search service; left as they are
        if group is None:
            new_group('', 1)
        f = {'id': key, 'label': label_of(el)}
        form = el.find_parent('form')
        act = (form.get('action') or '') if form is not None else ''
        group.setdefault('part', 2 if 'SaveTtChuyenKhoa' in act else 1)
        if el.name == 'textarea':
            f['kind'] = 'textarea'
        elif el.name == 'select':
            opts = [{'value': o.get('value'), 'label': clean(o.get_text(' '))} for o in el.find_all('option')]
            opts = [o for o in opts if o['value'] not in (None, '') or o['label']]
            f['kind'] = 'multi' if el.has_attr('multiple') else 'select'
            f['options'] = opts
        elif typ == 'checkbox':
            f['kind'] = 'check'
        elif typ == 'radio':
            name = el.get('name')
            f['id'] = name
            f['kind'] = 'radio'
            f['options'] = []
            for r in soup.find_all('input', attrs={'type': 'radio', 'name': name}):
                sp = r.find_next_sibling('span')
                f['options'].append({'value': r.get('value') or '', 'label': clean(sp.get_text(' ')) if sp else ''})
            f['options'] = [o for o in f['options'] if o['label']]
        elif typ == 'number':
            f['kind'] = 'number'
        else:
            f['kind'] = 'text'
            if 'datetimepicker' in (el.get('class') or []):
                f['format'] = 'HH:mm dd/MM/yyyy'
        seen.add(f['id'])
        group['fields'].append(f)
    for g in groups:
        g['fields'] = [f for f in g['fields'] if f['id'] not in SKIP]
    groups = [g for g in groups if g['fields']]
    json.dump({'source': 'OneMES Thông tin bệnh án, mục B. PHẦN BỆNH ÁN', 'groups': groups}, open(out, 'w'), ensure_ascii=False, indent=1)
    print(sum(len(g['fields']) for g in groups), 'fields in', len(groups), 'groups')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
