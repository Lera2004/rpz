const fs = require('fs');
const XLSX = require('xlsx');
const path = 'uploads/Басок_Pednavantazhennia_blank_28_08_2025.xlsx';
const wb = XLSX.read(fs.readFileSync(path), { type: 'array', cellStyles: true, cellFormula: true });
const ws = wb.Sheets[wb.SheetNames[0]];

for (let r = 8; r <= 18; r += 1) {
  const rowText = [];
  for (let c = 0; c <= 24; c += 1) {
    const ref = XLSX.utils.encode_cell({ r: r - 1, c });
    const cell = ws[ref];
    rowText.push((cell && cell.v !== undefined ? String(cell.v) : '').slice(0, 20));
  }
  console.log('ROW', r, rowText.join(' | '));
}

console.log('--- alignment samples ---');
for (const ref of ['A13', 'A14', 'A15', 'B14', 'C14', 'F14', 'G14', 'H14', 'I14', 'J14', 'T14', 'U14', 'V14', 'W14', 'X14', 'Y14']) {
  const cell = ws[ref];
  console.log(ref, cell && cell.s ? JSON.stringify(cell.s.alignment) : 'NO');
}
