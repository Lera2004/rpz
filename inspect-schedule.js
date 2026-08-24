const XLSX = require('xlsx');
const path = 'C:/Users/stud/Desktop/ped/uploads/09.07.2026 РПЗ_2026-2027_25_06_2026.xls';
const wb = XLSX.readFile(path);
console.log('SHEETS:', wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  console.log('\n--- SHEET ' + name + ' rows=' + rows.length + ' ---');
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    console.log(JSON.stringify(rows[i]));
  }
}
