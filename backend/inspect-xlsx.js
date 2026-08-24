import XLSX from 'xlsx'
import path from 'path'

const file = path.resolve('../uploads/Графік ОП 2026-2027.xlsx')
const wb = XLSX.readFile(file)
const sheet = wb.Sheets['РПЗ_МЕТ']

const cols = Array.from({ length: 55 - 4 + 1 }, (_, i) => XLSX.utils.encode_col(3 + i))
const display = (row, cols) => {
  console.log(cols.map(col => {
    const addr = `${col}${row}`
    const cell = sheet[addr]
    return `${addr}=${cell ? JSON.stringify(cell.v) : ''}`
  }).join(' | '))
}

console.log('Row 9')
display(9, cols.slice(0, 30))
console.log('Row 9 cont')
display(9, cols.slice(30))
console.log('Row 10')
display(10, cols.slice(0, 30))
console.log('Row 10 cont')
display(10, cols.slice(30))
console.log('Row 11')
display(11, cols.slice(0, 30))
console.log('Row 11 cont')
display(11, cols.slice(30))
console.log('Row 12')
display(12, cols.slice(0, 30))
console.log('Row 12 cont')
display(12, cols.slice(30))
console.log('Row 13')
display(13, cols.slice(0, 30))
console.log('Row 13 cont')
display(13, cols.slice(30))
console.log('Merges count', (sheet['!merges'] || []).length)
console.log((sheet['!merges'] || []).map(m => {
  const start = XLSX.utils.encode_cell(m.s)
  const end = XLSX.utils.encode_cell(m.e)
  const val = sheet[XLSX.utils.encode_cell(m.s)]?.v
  return `${start}:${end} => ${JSON.stringify(val)}`
}).join('\n'))

console.log('Group rows C14-C22')
for (let r = 14; r <= 22; r += 1) {
  const addr = `C${r}`
  const cell = sheet[addr]
  console.log(`${addr}=${cell ? JSON.stringify(cell.v) : ''}`)
}
