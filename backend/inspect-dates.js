import XLSX from 'xlsx'

const path = 'C:/Users/stud/Desktop/ped/uploads/Графік ОП 2026-2027.xlsx'
const workbook = XLSX.readFile(path)
const sheet = workbook.Sheets['РПЗ_МЕТ']
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })

console.log('TOTAL ROWS', rows.length)
for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
  console.log('ROW', i, JSON.stringify(rows[i]))
}

console.log('\nMONTH ROW 5')
console.log(JSON.stringify(rows[5]))
console.log('\nMONTH ROW 6')
console.log(JSON.stringify(rows[6]))
console.log('\nMONTH ROW 7')
console.log(JSON.stringify(rows[7]))

console.log('\nEXAMPLE ROW 12')
console.log(JSON.stringify(rows[12]))
