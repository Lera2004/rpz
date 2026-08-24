import JSZip from 'jszip'
import { buildStatementDocument } from './src/controllers/statementController.js'

const namesForTest = [
	'Беляєв Артем Богданович',
	'Беляєв Дмитро Віталійович',
	'Борохта Владислав Сергійович',
	'Гончаров Олександр Романович',
	'Горюнов Артем Максимович',
	'Доценко Віктор Іванович',
	"Жежулов Денис В'ячеславович",
	'Жолудь Сергій Вадимович',
	'Козик Дмитро Сергійович',
	'Кулак Юрій Васильович',
	'Левченко Данило Сергійович',
	'Лобан Максим Андрійович',
	'Мамедов Тимур Аміронович',
	'Михайличенко Карина Аліконівна',
	'Полівода Олег Тарасович',
	'Попов Максим Ігорович',
	'Студент Сімнадцятий Тестовий',
	'Студент Вісімнадцятий Тестовий',
	'Останній Студент Тестовий'
]
const students = namesForTest.map((applicant) => ({ applicant }))
const buffer = await buildStatementDocument(students, {
	name: 'КН 24 1/9',
	specialty: 'F2 Інженерія програмного забезпечення'
})
const zip = await JSZip.loadAsync(buffer)
const xml = await zip.file('word/document.xml').async('string')
const tables = [...xml.matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g)].map((match) => match[0])
const table = tables.find((value) => value.includes('ПІБ студента') && value.includes('Номер'))
const rows = [...table.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((match) => match[0])
if (rows.length !== namesForTest.length + 2) throw new Error(`Unexpected table row count: ${rows.length}`)
const studentRows = rows.slice(2)
const getCells = (row) => [...row.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map((match) => match[0])
const getText = (value) => [...value.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join('')

const numbers = studentRows.map((row) => getText(getCells(row)[0]))
const names = studentRows.map((row) => getText(getCells(row)[1]))
const expected = Array.from({ length: namesForTest.length }, (_, index) => String(index + 1))
if (JSON.stringify(numbers) !== JSON.stringify(expected)) throw new Error(`Bad numbers: ${numbers.join(',')}`)
if (names.some((name) => !name)) throw new Error('A student row has an empty name cell')
if (getCells(studentRows[0])[0].includes('<w:pStyle') || getCells(studentRows[0])[0].includes('<w:ind')) throw new Error('Number cell retains list paragraph indentation')
if (studentRows.some((row) => row.includes('<w:trHeight') || row.includes('<w:spacing') || row.includes('<w:br'))) throw new Error('Student rows contain layout expansion properties')
if (studentRows.some((row) => getCells(row).some((cell) => (cell.match(/<w:p(?:\s[^>]*)?>/g) || []).length !== 1))) throw new Error('A student cell does not contain exactly one paragraph')
if (new Set(studentRows.map((row) => row.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, '<w:t>TEXT</w:t>'))).size !== 1) {
	throw new Error('Student rows do not share one XML structure')
}
console.log('Statement export OK:', numbers.join(', '))
