import XLSX from 'xlsx'

const filePath = 'C:/Users/stud/Desktop/ped/uploads/Графік ОП 2026-2027.xlsx'
const wb = XLSX.readFile(filePath)
console.log('SHEETS', wb.SheetNames)

const sheet = wb.Sheets['РПЗ_МЕТ']
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })

for (let i = 0; i < 20; i += 1) {
  const row = rows[i]
  if (Array.isArray(row)) {
    console.log('\nROW', i, 'LEN', row.length)
    console.log(row.map((v) => String(v ?? '').slice(0, 20)))
  }
}

console.log('\n--- IMPORTANT CELLS FROM ROW 5-10 ---')
for (let i = 5; i <= 10; i += 1) {
  const row = rows[i]
  if (Array.isArray(row)) {
    console.log('ROW', i, JSON.stringify(row.slice(0, 80)))
  }
}
