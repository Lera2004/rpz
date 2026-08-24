import XLSX from 'xlsx'

const path = 'C:/Users/stud/Desktop/ped/uploads/Графік ОП 2026-2027.xlsx'
const workbook = XLSX.readFile(path)
const sheet = workbook.Sheets['РПЗ_МЕТ']
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })

for (let i = 0; i < rows.length; i += 1) {
  const row = rows[i]
  if (i >= 10 && i <= 18) {
    console.log('ROW', i, JSON.stringify(row))
  }
}

console.log('--- column indexes for row 12 ---')
const r = rows[12]
for (let c = 0; c < r.length; c += 1) {
  const val = r[c]
  if (val !== '' && val !== null && val !== undefined) {
    console.log(c, JSON.stringify(val))
  }
}
