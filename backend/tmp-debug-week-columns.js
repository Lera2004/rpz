import XLSX from 'xlsx';
import path from 'path';
const filePath = path.resolve('..','uploads','Графік ОП 2026-2027.xlsx');
const wb = XLSX.readFile(filePath);
const sheet = wb.Sheets['РПЗ_МЕТ'];
const rows = XLSX.utils.sheet_to_json(sheet,{header:1, raw:false, defval:''});
const headerRows = rows.slice(8, 13);
for (let i=0; i<headerRows.length; i++) {
  console.log('row', 9+i, JSON.stringify(headerRows[i]));
}
console.log('--- week row with indices ---');
const weekRow = rows[12] || [];
for (let c=3; c<60; c++) {
  if (weekRow[c] !== '' && weekRow[c] !== null && weekRow[c] !== undefined) {
    console.log('col', c, weekRow[c]);
  }
}
console.log('--- row 14 values with cols ---');
const row14 = rows[13] || [];
for (let c=3; c<60; c++) {
  if (row14[c] !== '' && row14[c] !== null && row14[c] !== undefined) {
    console.log('col', c, JSON.stringify(row14[c]));
  }
}
NODE