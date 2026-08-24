import fs from 'fs/promises'
import JSZip from 'jszip'
import { buildReportDocument } from './src/controllers/statementController.js'
const students = Array.from({ length: 27 }, (_, index) => ({ applicant: `Студент ${index + 1}` }))
const buffer = await buildReportDocument('summary100', students, { name: 'Тест', specialty: 'F2', course: 1 })
const zip = await JSZip.loadAsync(buffer)
const xml = await zip.file('word/document.xml').async('string')
const table = [...xml.matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g)].map((match) => match[0]).find((value) => value.includes('ПІБ'))
console.log('GRID', table.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0])
const rows = [...table.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((match) => match[0]).slice(3)
const cells = (row) => [...row.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map((match) => match[0])
const text = (cell) => [...cell.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join('')
for (const index of [0, 8, 9, 10, 18, 19, 26]) {
  const cell = cells(rows[index])[0]
  console.log(index + 1, JSON.stringify(text(cell)), cell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0], cell.match(/<w:p>[\s\S]*?<\/w:p>/)?.[0])
}
