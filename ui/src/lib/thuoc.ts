import type { AddItem } from './types';

// Same defaults as src/store.js: what the user enters by hand in Kê Tây y/VTYT.
export const DEFAULT_THUOC: AddItem[] = [
  { id: 'con-xoa-bop', label: 'Cồn xoa bóp', kho: 'KCPSX', ten: 'CỒN XOA BÓP', tim: 'cồn xoa', sl: '1', cachDung: 'Mỗi lần dùng 5ml, xoa bóp các chỗ đau 4 lần/ngày', loai: 'KÊ LĨNH' },
  { id: 'cao-thong-mach', label: 'Cao thông mạch', kho: 'KCPSX', ten: 'CAO THÔNG MẠCH', tim: 'cao thông', sl: '1', cachDung: 'Uống 20ml/lần * 2 lần/ngày * 3 ngày (sáng, chiều) sau ăn', loai: 'KÊ LĨNH' },
];
