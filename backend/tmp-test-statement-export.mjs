import fs from 'fs/promises'
import JSZip from 'jszip'
import { buildStatementDocument } from './src/controllers/statementController.js'

const students = Array.from({ length: 25 }, (_, index) => ({ applicant: `Тестов Студент ${index + 1}` }))
const buffer = await buildStatementDocument(students, {
  name: 'КН 24 1/9',
  specialty: 'F2 Інженерія програмного забезпечення'
})
const zip = await JSZip.loadAsync(buffer)
const xml = await zip.file('word/document.xml').async('string')
const tables = [...xml.matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g)].map((match) => match[0])
const studentTable = tables.find((table) => table.includes('ПІБ студента') && table.includes('Номер'))
tables.flatMap((table) => [...table.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map((match) => match[0]))
  .filter((cell) => cell.includes('Група'))
  .forEach((cell) => console.log('GROUP CELL', [...cell.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join(' | ')))
const rows = [...studentTable.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((match) => match[0])
const studentRows = rows.slice(2, 27)
const numbers = studentRows.map((row) => {
  const cells = [...row.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map((match) => match[0])
  if (/<w:numPr>[\s\S]*?<\/w:numPr>/.test(cells[0])) throw new Error('Automatic numbering remains')
  if (!/<w:jc w:val="left"\/>/.test(cells[0])) throw new Error('Number is not left-aligned')
  if (!/<w:noWrap\s*\/>/.test(cells[0])) throw new Error('Number cell can still wrap')
  return [...cells[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join('')
})
const expected = Array.from({ length: 25 }, (_, index) => String(index + 1))
if (JSON.stringify(numbers) !== JSON.stringify(expected)) throw new Error(`Bad numbers: ${numbers.join(',')}`)
if (!xml.includes('КН 24 1/9')) throw new Error('Group was not inserted')
if (!xml.includes('F2 Інженерія програмного забезпечення')) throw new Error('Specialty was not inserted')
console.log('Statement export OK:', numbers.join(', '))
