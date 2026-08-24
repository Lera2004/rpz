import JSZip from 'jszip'
import { buildReportDocument } from './src/controllers/statementController.js'

const configs = [
  ['grade12', 1, 1, 2],
  ['summary', 2, 2, 1],
  ['summary100', 4, 3, 1],
  ['summary24', 2, 2, 1],
  ['okr', 3, 1, 2]
]

for (const count of [10, 19, 24, 29, 30]) {
  const students = Array.from({ length: count }, (_, index) => ({ applicant: index === 10 ? 'Іванченко Анастасія Олександрівна' : `Студент ${index + 1}` }))

  for (const [type, course, headerRows, tableCount] of configs) {
  const buffer = await buildReportDocument(type, students, {
    name: `РПЗ 25 ${course}/9`,
    specialty: 'F2 Інженерія програмного забезпечення',
    course
  })
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('word/document.xml').async('string')
  const tables = [...xml.matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g)].map((match) => match[0])
  if (tables.length !== tableCount) throw new Error(`${type}: expected ${tableCount} tables, got ${tables.length}`)
  const mainTable = tables[0]
  const rows = [...mainTable.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((match) => match[0])
  if (rows.length !== headerRows + students.length) throw new Error(`${type}: unexpected row count ${rows.length}`)
  const cells = (row) => [...row.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map((match) => match[0])
  const text = (cell) => [...cell.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join('')
  const numbers = rows.slice(headerRows).map((row) => text(cells(row)[0]))
  const expected = students.map((_, index) => String(index + 1))
  if (JSON.stringify(numbers) !== JSON.stringify(expected)) throw new Error(`${type}: bad numbers ${numbers.join(',')}`)
  if (rows.slice(headerRows).some((row) => row.includes('<w:trHeight') || row.includes('<w:spacing'))) throw new Error(`${type}: student row contains artificial height or spacing`)
  if (rows.slice(headerRows).some((row) => cells(row).some((cell) => (cell.match(/<w:p(?:\s[^>]*)?>/g) || []).length !== 1))) throw new Error(`${type}: student cell has extra paragraph`)
  if (!xml.includes(`РПЗ 25 ${course}/9`) || !xml.includes('F2 Інженерія програмного забезпечення')) throw new Error(`${type}: group header was not replaced`)
  if (type === 'okr' && !xml.includes('АРКУШ ПЕРЕСКЛАДАННЯ')) throw new Error('okr: resit sheet was removed')
    console.log(`${type} (${count}): ${numbers[0]}...${numbers[numbers.length - 1]}, ${rows.length} main rows`)
  }
}
