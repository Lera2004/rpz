import fs from 'fs'
import XLSX from 'xlsx'

const file = 'C:/Users/stud/Desktop/ped/uploads/Басок_Pednavantazhennia_blank_28_08_2025.xlsx'
const wb = XLSX.read(fs.readFileSync(file), { type: 'array', cellStyles: true, cellFormula: true })
const ws = wb.Sheets['Басок']

for (let row = 12; row <= 16; row += 1) {
  const values = []
  for (let col = 0; col < 25; col += 1) {
    const ref = XLSX.utils.encode_cell({ r: row - 1, c: col })
    const val = ws[ref]?.v
    values.push(val ?? '')
  }
  console.log('ROW', row, values)
}
