import XLSX from 'xlsx';
import path from 'path';
const filePath = path.resolve('..','uploads','Графік ОП 2026-2027.xlsx');
const wb = XLSX.readFile(filePath);
const sheetName = wb.SheetNames.includes('РПЗ_МЕТ') ? 'РПЗ_МЕТ' : wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet,{ header:1, raw:false, defval:'' });
console.log('sheet', sheetName, 'row count', rows.length);
for (let i=0; i<20; i++) {
  console.log('ROW', i+1, JSON.stringify(rows[i]));
}
console.log('--- merges ---');
console.log(JSON.stringify(sheet['!merges'], null, 2));
console.log('--- first 70 columns row 9-13 ---');
for (let i=8; i<13; i++) {
  console.log('ROW', i+1, JSON.stringify(rows[i]));
}
