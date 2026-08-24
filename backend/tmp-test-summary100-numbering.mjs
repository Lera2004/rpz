import JSZip from 'jszip'
import { buildReportDocument } from './src/controllers/statementController.js'

const firstNames = [
  'Кордій Олександра Олексіївна',
  'Кофан Андрій Андрійович',
  'Лебедева Єлизавета Артемівна',
  'Міцевич Вероніка Вадимівна',
  'Музальов Дмитро Олегович',
  'Пігур Сергій Олександрович',
  'Подольський Єгор Дмитрович',
  'Раскевич Світлана Євгеніївна',
  'Рячинський Артем Андрійович',
  'Сагайдак Артем Олександрович'
]
const names = [...firstNames, ...Array.from({ length: 15 }, (_, index) => `Тестовий Студент ${index + 11}`)]

const buffer = await buildReportDocument('summary100', names.map((applicant) => ({ applicant })), {
  name: 'РПЗ 25 1/9',
  specialty: 'F2 Інженерія програмного забезпечення',
  course: 1
})
const zip = await JSZip.loadAsync(buffer)
const xml = await zip.file('word/document.xml').async('string')
const table = [...xml.matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g)].map((match) => match[0]).find((value) => value.includes('ПІБ'))
if (!table.includes('<w:gridCol w:w="800"/>')) throw new Error('summary100 number column was not widened')
if (!table.includes('<w:gridCol w:w="3448"/>')) throw new Error('summary100 name column compensation is incorrect')
const rows = [...table.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((match) => match[0]).slice(3)
const cells = (row) => [...row.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map((match) => match[0])
const text = (cell) => [...cell.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join('')
const numbers = rows.map((row) => text(cells(row)[0]))
const studentNames = rows.map((row) => text(cells(row)[1]))
const expectedNumbers = names.map((_, index) => String(index + 1))
if (JSON.stringify(numbers) !== JSON.stringify(expectedNumbers)) throw new Error(`summary100 numbers: ${numbers.join(',')}`)
if (JSON.stringify(studentNames) !== JSON.stringify(names)) throw new Error('summary100 student order changed')
if (numbers.includes('0')) throw new Error('summary100 contains zero number')
for (const expectedNumber of ['9', '10', '11', '19', '20', '21', '25']) {
  if (numbers[Number(expectedNumber) - 1] !== expectedNumber) throw new Error(`summary100 number ${expectedNumber} is misplaced`)
}
if (rows.some((row) => !cells(row)[0].includes('<w:tcW w:w="800"'))) throw new Error('summary100 number cell width does not match the configured width')
if (rows.some((row) => /<w:t[^>]*>10<\/w:t>/.test(row) && row.includes('<w:br'))) throw new Error('summary100 number 10 contains a line break')
if (rows.some((row) => row.includes('<w:trHeight') || row.includes('<w:spacing'))) throw new Error('summary100 contains artificial row spacing')
if (rows.some((row) => cells(row).some((cell) => (cell.match(/<w:p(?:\s[^>]*)?>/g) || []).length !== 1))) throw new Error('summary100 contains extra cell paragraph')
console.log('summary100 numbering OK:', numbers.join(', '))
