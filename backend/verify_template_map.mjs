import fs from 'fs/promises'
import path from 'path'
import XLSX from 'xlsx'

const templatePath = path.resolve('uploads/Басок_Pednavantazhennia_blank_28_08_2025.xlsx')
const fileBuffer = await fs.readFile(templatePath)
const workbook = XLSX.read(fileBuffer, { type: 'array', cellStyles: true, cellFormula: true })
const sheet = workbook.Sheets['Басок']

const coords = []
for (let row = 1; row <= 40; row += 1) {
  for (let col = 0; col < 25; col += 1) {
    const ref = XLSX.utils.encode_cell({ r: row - 1, c: col })
    const cell = sheet[ref]
    if (cell && (cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== '')) {
      coords.push({ ref, value: cell.v })
    }
  }
}

const interesting = ['K5', 'F9', 'A15', 'B15', 'C15', 'D15', 'E15', 'F15', 'G15', 'H15', 'I15', 'J15', 'K15', 'L15', 'M15', 'N15', 'O15', 'P15', 'Q15', 'R15', 'S15', 'T15', 'U15', 'V15', 'W15', 'X15', 'Y15', 'A35', 'Y35']
for (const ref of interesting) {
  const cell = sheet[ref]
  console.log(ref + ':' + JSON.stringify(cell ? cell.v : null))
}

console.log('---A15:Y35---')
for (let row = 15; row <= 35; row += 1) {
  const values = []
  for (let col = 0; col < 25; col += 1) {
    const ref = XLSX.utils.encode_cell({ r: row - 1, c: col })
    const cell = sheet[ref]
    values.push(cell ? String(cell.v ?? '') : '')
  }
  console.log(row, values.slice(0, 25).join(' | '))
}
