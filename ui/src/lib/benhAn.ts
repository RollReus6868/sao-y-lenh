// "B. PHẦN BỆNH ÁN" of OneMES's Thông tin bệnh án page: the layout (from a blank page,
// no patient data) and reading filled-in values out of a saved copy of that page.
import raw from '../../../src/benh-an-schema.json';
import type { BaField, BaSchema, BaValue, BaValues } from './types';

export const schema = raw as BaSchema;
export const allFields: BaField[] = schema.groups.flatMap((g) => g.fields);

export const isFilled = (v: BaValue | undefined) => (Array.isArray(v) ? v.length > 0 : typeof v === 'boolean' ? v : !!(v && String(v).trim()));
export const filledCount = (values: BaValues) => allFields.filter((f) => isFilled(values[f.id])).length;

/** Values of every field from the HTML of a saved Thông tin bệnh án page (Ctrl+S in Chrome). */
export function valuesFromHtml(html: string): { values: BaValues; found: number; filled: number } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const values: BaValues = {};
  let found = 0;
  for (const f of allFields) {
    if (f.kind === 'radio') {
      const rs = [...doc.querySelectorAll<HTMLInputElement>('input[type=radio]')].filter((r) => r.name === f.id);
      if (rs.length) found++;
      const c = rs.find((r) => r.hasAttribute('checked'));
      values[f.id] = c ? c.getAttribute('value') || '' : '';
      continue;
    }
    const el = doc.getElementById(f.id);
    if (!el) continue;
    found++;
    if (f.kind === 'check') values[f.id] = el.hasAttribute('checked');
    else if (f.kind === 'textarea') values[f.id] = el.textContent || '';
    else if (f.kind === 'multi' || f.kind === 'select') {
      const sel = [...(el as HTMLSelectElement).querySelectorAll('option')].filter((o) => o.hasAttribute('selected')).map((o) => o.getAttribute('value') || '');
      values[f.id] = f.kind === 'multi' ? sel.filter(Boolean) : sel[0] || '';
    } else values[f.id] = el.getAttribute('value') || '';
  }
  return { values, found, filled: filledCount(values) };
}

/** Reads a chosen file and turns it into template values; throws a readable error. */
export async function templateFromFile(file: File) {
  const html = await file.text();
  const r = valuesFromHtml(html);
  if (r.found < allFields.length / 2) throw new Error('File này không phải trang Thông tin bệnh án của OneMES (không thấy mục B. PHẦN BỆNH ÁN)');
  return { ...r, name: file.name.replace(/\.html?$/i, '') };
}
