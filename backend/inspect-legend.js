import XLSX from 'xlsx'
import path from 'path'
const file = path.resolve('../uploads/Графік ОП 2026-2027.xlsx')
const wb = XLSX.readFile(file)
const sheet = wb.Sheets['РПЗ_МЕТ']
const cols = Array.from({ length: XLSX.utils.decode_col('BS') + 1 }, (_, i) => XLSX.utils.encode_col(i))
const rangeCols = cols.slice(XLSX.utils.decode_col('A'), XLSX.utils.decode_col('BT'))
for (let r = 24; r <= 30; r += 1) {
  const values = rangeCols.map(col => {
    const addr = `${col}${r}`
    const cell = sheet[addr]
    return `${addr}=${cell ? JSON.stringify(cell.v) : ''}`
  })
  console.log(`Row ${r}`)
  console.log(values.join(' | '))
}
console.log('Merges around legend')
const merges = sheet['!merges'] || []
merges.filter(m => m.s.r >= 23 && m.s.r <= 30).forEach(m => {
  const start = XLSX.utils.encode_cell(m.s)
  const end = XLSX.utils.encode_cell(m.e)
  const val = sheet[XLSX.utils.encode_cell(m.s)]?.v
  console.log(`${start}:${end} => ${JSON.stringify(val)}`)
})
