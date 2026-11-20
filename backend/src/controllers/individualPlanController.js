import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import pool from '../config/database.js'
import { getPlanData } from './planController.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const templatePath = path.resolve(__dirname, '../../templates/individual-study-plan-template.xlsx')

const sections = [
  { key: 'profile', start: 12, capacity: 9, insertAt: 21, styleRow: 12 },
  { key: 'general', start: 22, capacity: 1, insertAt: 23, styleRow: 22 },
  { key: 'special', start: 24, capacity: 3, insertAt: 27, styleRow: 24 },
  { key: 'elective', start: 28, capacity: 1, insertAt: 29, styleRow: 28 }
]

function isPresent(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function numberOrBlank(value) {
  if (!isPresent(value)) return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function isValidISODate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
}

function isEnabled(value) {
  return isPresent(value) && !['0', 'false', 'ні', 'no'].includes(String(value).trim().toLocaleLowerCase('uk-UA'))
}

function itemSection(item) {
  const section = String(item.section || '')
    .toLocaleLowerCase('uk-UA')
    .replace(/[\s_-]+/g, ' ')
    .trim()

  if (section === 'general' || /загальн[\p{L}]*\s+компетенц/u.test(section)) return 'general'
  if (section === 'special' || /спеціальн[\p{L}]*\s+компетенц/u.test(section)) return 'special'
  if (section === 'elective' || /вибірков[\p{L}]*\s+освітн[\p{L}]*\s+компонент/u.test(section)) return 'elective'
  if (section === 'profile' || /профільної\s+середньої\s+освіти|базові\s+предмети/.test(section)) return 'profile'

  const code = String(item.code || '').trim().toLocaleUpperCase('uk-UA')
  if (code.startsWith('ВК') || item.type === 'ВК') return 'elective'

  if (item.type === 'ОК' || /^ОК\s*\d+/.test(code)) return 'special'

  if (item.type === 'practice' || code.startsWith('PRACTICE_')) return 'special'
  return 'profile'
}

function semesterOrdinal(value) {
  const ordinals = {
    1: 'перший',
    2: 'другий',
    3: 'третій',
    4: 'четвертий',
    5: 'п’ятий',
    6: 'шостий',
    7: 'сьомий',
    8: 'восьмий',
    9: 'дев’ятий',
    10: 'десятий'
  }
  return ordinals[value] || `${value}-й`
}

function dateToUkrainian(value, label) {
  if (!isPresent(value)) return ''
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) throw new Error(`Поле «${label}» має бути датою.`)
  return `${match[3]}.${match[2]}.${match[1]}`
}

function formatTeacherName(value) {
  const parts = String(value || '')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''

  const initials = parts.slice(1).map(part => {
    if (/^\p{L}\.?$/u.test(part)) return `${part.replace(/\.$/, '')}.`
    return `${Array.from(part)[0]}.`
  })
  return `${parts[0]} ${initials.join('')}`
}

function formatSemesterLine(templateText, { semester, startDate, endDate, weeks, examSession }) {
  let line = String(templateText)
    .replace(/#ПОЧАТОК#/gi, startDate)
    .replace(/#КІНЕЦЬ#/gi, endDate)
    .replace(/#ТИЖНІ#/gi, weeks)
    .replace(/Семестр\s+\S+/i, `Семестр ${semesterOrdinal(semester)}`)
    .replace(
      /з\s+\d{1,2}[./-]\d{1,2}[./-]\d{4}\s+до\s+\d{1,2}[./-]\d{1,2}[./-]\d{4}/i,
      `з ${startDate} до ${endDate}`
    )
    .replace(/Кількість тижнів\s+\d+/i, `Кількість тижнів${weeks ? ` ${weeks}` : ''}`)
    .replace(/Екзаменаційна сесія\s+.*$/i, `Екзаменаційна сесія ${examSession}`)

  return line.replace(/\s+/g, ' ').trim()
}

function copyRowStyle(sheet, destinationRow, sourceStyle) {
  const row = sheet.getRow(destinationRow)
  row.height = sourceStyle.height
  for (let column = 1; column <= 18; column += 1) {
    row.getCell(column).style = structuredClone(sourceStyle.cells[column - 1])
  }
}

function shiftRowNumber(rowNumber, insertions) {
  let shiftedRow = rowNumber
  for (const insertion of insertions) {
    if (insertion.at <= shiftedRow) shiftedRow += insertion.count
  }
  return shiftedRow
}

function shiftMergeRange(range, insertions) {
  const shiftCell = address => address.replace(/([A-Z]+)(\d+)/, (_match, column, row) =>
    `${column}${shiftRowNumber(Number(row), insertions)}`
  )
  const [start, end] = range.split(':')
  return end ? `${shiftCell(start)}:${shiftCell(end)}` : shiftCell(start)
}

function worksheetRowStyle(sheet, rowNumber) {
  const row = sheet.getRow(rowNumber)
  return {
    height: row.height,
    cells: Array.from({ length: 18 }, (_value, index) =>
      structuredClone(row.getCell(index + 1).style)
    )
  }
}

function appendSectionRows(sheet, groupedItems) {
  const sourceStyles = new Map(
    sections.map(section => [section.key, worksheetRowStyle(sheet, section.styleRow)])
  )
  const merges = [...sheet.model.merges]
  for (const merge of merges) sheet.unMergeCells(merge)

  const additionalRows = new Map(sections.map(section => [
    section.key,
    Math.max(0, groupedItems[section.key].length - section.capacity)
  ]))
  const insertions = []

  for (const section of [...sections].reverse()) {
    const count = additionalRows.get(section.key)
    if (!count) continue

    const at = section.insertAt
    sheet.spliceRows(at, 0, ...Array.from({ length: count }, () => []))
    for (let index = 0; index < count; index += 1) {
      copyRowStyle(sheet, at + index, sourceStyles.get(section.key))
    }

    insertions.push({ at, count })
  }

  for (const merge of merges) sheet.mergeCells(shiftMergeRange(merge, insertions))

  let rowsAbove = 0
  const rowStarts = new Map()
  for (const section of sections) {
    rowStarts.set(section.key, section.start + rowsAbove)
    rowsAbove += additionalRows.get(section.key)
  }

  return { rowStarts, additionalRows, insertions, totalAdded: rowsAbove }
}

function setDisciplineRow(sheet, rowNumber, number, item, semester) {
  const lectures = numberOrBlank(semester.lectures)
  const practical = numberOrBlank(semester.practical)
  const laboratory = numberOrBlank(semester.laboratory)
  const seminars = numberOrBlank(semester.seminars)
  const auditorium = [lectures, practical, laboratory, seminars]
    .some(value => value !== null)
    ? [lectures, practical, laboratory, seminars].reduce((sum, value) => sum + (value || 0), 0)
    : null

  const controlParts = [semester.controlType, semester.controlWorks].filter(isPresent)
  if (
    isEnabled(semester.differentialCredit) &&
    !controlParts.some(value => String(value).toLocaleLowerCase('uk-UA').includes('диференцій'))
  ) {
    controlParts.push('Диференційний залік')
  }
  if (
    isEnabled(semester.exams) &&
    !controlParts.some(value => String(value).toLocaleLowerCase('uk-UA').includes('екзам'))
  ) {
    controlParts.push('Екзамен')
  }
  const control = [...new Set(controlParts.map(value => String(value).trim()))].join(', ')

  const cells = {
    A: number,
    B: item.code || '',
    C: item.name || '',
    D: numberOrBlank(semester.credits),
    E: numberOrBlank(semester.totalHours),
    F: auditorium,
    G: lectures,
    H: practical,
    I: laboratory,
    J: seminars,
    K: numberOrBlank(semester.selfStudy),
    L: control,
    M: '',
    N: '',
    O: '',
    P: '',
    Q: formatTeacherName(item.teacher),
    R: ''
  }

  for (const [column, value] of Object.entries(cells)) {
    sheet.getCell(`${column}${rowNumber}`).value = value
  }
}

export async function createIndividualPlan({ group, student, planItems, semester, body }) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await fs.readFile(templatePath))
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('Аркуш шаблону індивідуального плану не знайдено.')

  const academicYear = String(body.academicYear || '').trim()
  if (!/^\d{4}\/\d{4}$/.test(academicYear)) {
    throw new Error('Вкажіть навчальний рік у форматі 2026/2027.')
  }

  const startDate = dateToUkrainian(body.startDate, 'Початок семестру')
  const endDate = dateToUkrainian(body.endDate, 'Завершення семестру')
  const weeks = isPresent(body.weeks) ? String(Number(body.weeks)) : ''
  if (weeks && (!Number.isInteger(Number(weeks)) || Number(weeks) <= 0)) {
    throw new Error('Кількість тижнів має бути додатним цілим числом.')
  }
  const examSession = String(body.examSession || '').trim() || 'не передбачено'
  const classTeacher = String(body.classTeacher || group.class_teacher_name || '').trim()
  if (!classTeacher) throw new Error('Укажіть класного керівника в картці групи.')
  const departmentHead = String(body.departmentHead || '').trim()
  if (!departmentHead) throw new Error('Укажіть завідувача відділення.')

  const groupedItems = Object.fromEntries(sections.map(section => [section.key, []]))
  for (const entry of planItems) groupedItems[itemSection(entry.item)].push(entry)
  const { rowStarts, insertions } = appendSectionRows(sheet, groupedItems)

  sheet.getCell(`A${shiftRowNumber(21, insertions)}`).value = 'Дисципліни, що формують загальні компетенції'
  sheet.getCell(`A${shiftRowNumber(23, insertions)}`).value = 'Дисципліни, що формують спеціальні компетенції'
  sheet.getCell(`A${shiftRowNumber(27, insertions)}`).value = 'Вибіркові освітні компоненти'
  sheet.getCell('A1').value = student.applicant
  sheet.getCell('A3').value = `Навчальний рік ${academicYear}`
  sheet.getCell('G3').value = group.name
  sheet.getCell('A4').value = formatSemesterLine(sheet.getCell('A4').text, {
    semester,
    startDate,
    endDate,
    weeks,
    examSession
  })

  let number = 0
  for (const section of sections) {
    const startRow = rowStarts.get(section.key)
    groupedItems[section.key].forEach((entry, index) => {
      number += 1
      setDisciplineRow(sheet, startRow + index, number, entry.item, entry.semester)
    })
  }

  const classTeacherRow = shiftRowNumber(30, insertions)
  sheet.getCell(`H${classTeacherRow}`).value = classTeacher
  sheet.getCell(`Q${classTeacherRow}`).value = departmentHead

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function createIndividualPlansArchive({ group, students, planItems, semester, body }) {
  const archive = new JSZip()
  const safeGroupName = String(group.name || `group-${group.id}`)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const folder = archive.folder(safeGroupName || `group-${group.id}`)

  for (const [index, student] of students.entries()) {
    const workbook = await createIndividualPlan({ group, student, planItems, semester, body })
    const studentName = String(student.applicant)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || `student-${student.id}`
    folder.file(`${String(index + 1).padStart(2, '0')} - ${studentName}.xlsx`, workbook)
  }

  const filename = `${safeGroupName || `group-${group.id}`} - індивідуальні плани - ${semester} семестр.zip`
  const buffer = await archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })

  return { buffer, filename }
}

export async function downloadIndividualPlans(req, res) {
  try {
    const groupId = Number(req.params.groupId)
    const semester = Number(req.body.semester)
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({ message: 'Некоректний ідентифікатор групи.' })
    }
    if (!Number.isInteger(semester) || semester <= 0) {
      return res.status(400).json({ message: 'Оберіть семестр індивідуального плану.' })
    }
    if (!/^\d{4}\/\d{4}$/.test(String(req.body.academicYear || '').trim())) {
      return res.status(400).json({ message: 'Вкажіть навчальний рік у форматі 2026/2027.' })
    }
    const hasStartDate = isPresent(req.body.startDate)
    const hasEndDate = isPresent(req.body.endDate)
    if (!hasStartDate || !hasEndDate) {
      return res.status(400).json({ message: 'Вкажіть початок і завершення семестру.' })
    }
    if ((hasStartDate && !isValidISODate(req.body.startDate)) || (hasEndDate && !isValidISODate(req.body.endDate))) {
      return res.status(400).json({ message: 'Дати семестру мають бути коректними.' })
    }
    if (hasStartDate && req.body.startDate > req.body.endDate) {
      return res.status(400).json({ message: 'Дата початку семестру не може бути пізніше дати завершення.' })
    }
    if (
      isPresent(req.body.weeks) &&
      (!Number.isInteger(Number(req.body.weeks)) || Number(req.body.weeks) <= 0)
    ) {
      return res.status(400).json({ message: 'Кількість тижнів має бути додатним цілим числом.' })
    }

    const [groups] = await pool.query(
      `SELECT sg.id, sg.name, sg.specialty, sg.course, t.full_name AS class_teacher_name
       FROM student_groups sg
       LEFT JOIN teachers t ON t.id = sg.class_teacher_id
       WHERE sg.id = ?
       LIMIT 1`,
      [groupId]
    )
    if (!groups.length) return res.status(404).json({ message: 'Групу не знайдено.' })

    const [studentRows] = await pool.query(
      `SELECT id, applicant, inp_number, specialty
       FROM group_applicants
       WHERE group_id = ? AND TRIM(IFNULL(applicant, '')) <> ''
       ORDER BY applicant, id`,
      [groupId]
    )
    const students = []
    const seenStudents = new Set()
    for (const student of studentRows) {
      const identity = student.inp_number
        ? `inp:${String(student.inp_number).trim().toLocaleLowerCase('uk-UA')}`
        : `name:${String(student.applicant).trim().replace(/\s+/g, ' ').toLocaleLowerCase('uk-UA')}|${String(student.specialty || groups[0].specialty || '').trim().toLocaleLowerCase('uk-UA')}`
      if (seenStudents.has(identity)) continue
      seenStudents.add(identity)
      students.push(student)
    }
    if (!students.length) {
      return res.status(400).json({ message: 'У цій групі немає студентів для створення індивідуальних планів.' })
    }

    const plans = await getPlanData({ group: groups[0].name, course: groups[0].course })
    const plan = plans.find(value => value.group === groups[0].name)
    if (!plan) return res.status(404).json({ message: 'Для цієї групи немає імпортованого робочого плану.' })

    const planItems = []
    for (const [planIndex, item] of plan.items.entries()) {
      const itemSemester = (item.semesters || []).find(value => Number(value.semester) === semester)
      if (itemSemester) planItems.push({ item, semester: itemSemester, planIndex })
    }
    if (!planItems.length) {
      return res.status(422).json({ message: `У робочому плані для ${semester}-го семестру немає дисциплін.` })
    }

    if (!String(req.body.classTeacher || groups[0].class_teacher_name || '').trim()) {
      return res.status(422).json({ message: 'Укажіть класного керівника в картці групи або в полі форми.' })
    }
    if (!String(req.body.departmentHead || '').trim()) {
      return res.status(422).json({ message: 'Укажіть завідувача відділення.' })
    }

    const { buffer, filename } = await createIndividualPlansArchive({
      group: groups[0],
      students,
      planItems,
      semester,
      body: req.body
    })

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(buffer)
  } catch (error) {
    console.error('ПОМИЛКА СТВОРЕННЯ АРХІВУ ІНДИВІДУАЛЬНИХ ПЛАНІВ:', error)
    res.status(500).json({ message: error.message || 'Не вдалося створити архів індивідуальних планів.' })
  }
}
