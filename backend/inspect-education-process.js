import XLSX from 'xlsx'

const path = 'C:/Users/stud/Desktop/ped/uploads/Графік ОП 2026-2027.xlsx'
const workbook = XLSX.readFile(path)
console.log('SHEETS:', workbook.SheetNames)

for (const name of workbook.SheetNames) {
  const sheet = workbook.Sheets[name]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
  console.log('\n--- SHEET ' + name + ' rows=' + rows.length + ' ---')
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    console.log(JSON.stringify(rows[i]))
  }
}
