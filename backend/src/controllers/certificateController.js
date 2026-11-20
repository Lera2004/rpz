import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import XLSX from 'xlsx'
import pool from '../config/database.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const templatePath = path.resolve(__dirname, '../../templates/certificate-template.xlsx')

const normalizeIdentityPart = value => String(value || '')
  .normalize('NFC')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('uk-UA')

function parseImportedData(value, applicantId) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (error) {
    console.error(`Не вдалося прочитати дані картки студента ${applicantId}:`, error)
    throw new Error(`Не вдалося прочитати картку студента з ID ${applicantId}.`)
  }
}

function getImportedData(student) {
  return parseImportedData(student.imported_data, student.id)
}

function getStudentFields(student) {
  const data = getImportedData(student)
  const studentFields = data.student_fields && typeof data.student_fields === 'object'
    ? data.student_fields
    : {}
  return { ...studentFields, ...data }
}

function applicantIdentityKeys(student) {
  const fields = getStudentFields(student)
  const name = normalizeIdentityPart(student.applicant || fields.applicant || fields['Здобувач'])
  const specialty = normalizeIdentityPart(student.specialty || fields.specialty || fields['Спеціальність'])
  const inpNumber = normalizeIdentityPart(student.inp_number || fields.inp_number || fields['Номер ІНП'])
  const keys = []

  if (inpNumber) keys.push(`inp:${inpNumber}`)
  if (name) keys.push(`name:${name}|${specialty}`)
  if (!keys.length) keys.push(`id:${student.id}`)
  return keys
}

function dataCompleteness(student) {
  const fields = getStudentFields(student)
  return Object.values(fields).filter(value =>
    value !== null && value !== undefined && String(value).trim() !== ''
  ).length
}

function mergeImportedValues(fallback, preferred) {
  const merged = { ...fallback, ...preferred }

  for (const [key, value] of Object.entries(preferred)) {
    const hasPreferredValue = value !== null && value !== undefined &&
      (typeof value !== 'string' || value.trim() !== '')
    const fallbackValue = fallback[key]
    const hasFallbackValue = fallbackValue !== null && fallbackValue !== undefined &&
      (typeof fallbackValue !== 'string' || fallbackValue.trim() !== '')

    if (!hasPreferredValue && hasFallbackValue) merged[key] = fallbackValue
  }

  return merged
}

function mergeStudents(existing, incoming) {
  const preferred = dataCompleteness(incoming) > dataCompleteness(existing) ? incoming : existing
  const other = preferred === existing ? incoming : existing
  const preferredData = getImportedData(preferred)
  const otherData = getImportedData(other)
  const importedData = mergeImportedValues(otherData, preferredData)
  importedData.student_fields = mergeImportedValues(
    otherData.student_fields || {},
    preferredData.student_fields || {}
  )

  return {
    ...other,
    ...preferred,
    imported_data: importedData
  }
}

function deduplicateStudents(rows) {
  const students = []
  const indexByIdentity = new Map()
  const identitiesByIndex = []

  for (const row of rows) {
    const keys = applicantIdentityKeys(row)
    const existingIndex = keys
      .map(key => indexByIdentity.get(key))
      .find(index => index !== undefined)

    if (existingIndex === undefined) {
      const index = students.push(row) - 1
      identitiesByIndex[index] = keys
      for (const key of keys) indexByIdentity.set(key, index)
      continue
    }

    students[existingIndex] = mergeStudents(students[existingIndex], row)
    for (const key of identitiesByIndex[existingIndex]) indexByIdentity.delete(key)
    identitiesByIndex[existingIndex] = [...new Set([
      ...keys,
      ...applicantIdentityKeys(students[existingIndex])
    ])]
    for (const key of identitiesByIndex[existingIndex]) indexByIdentity.set(key, existingIndex)
  }

  return students
}

function normalizeFieldName(value) {
  return String(value || '')
    .normalize('NFC')
    .toLocaleLowerCase('uk-UA')
    .replace(/[\s._-]+/g, '')
}

function findImportedValue(student, candidates) {
  const fields = getStudentFields(student)
  const normalizedCandidates = candidates.map(normalizeFieldName)

  for (const [key, value] of Object.entries(fields)) {
    if (
      normalizedCandidates.includes(normalizeFieldName(key)) &&
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ''
    ) {
      return value
    }
  }

  return null
}

function findImportedStudyDate(student, period) {
  const fields = getStudentFields(student)
  const hasStudyTerm = key => /навчання|study/.test(normalizeFieldName(key))
  const matchesPeriod = period === 'start'
    ? key => /початок|зарахування|вступ|start|навчанняз/.test(normalizeFieldName(key))
    : key => /заверш|закінч|кінець|end|graduation|навчаннядо/.test(normalizeFieldName(key))

  for (const [key, value] of Object.entries(fields)) {
    if (
      hasStudyTerm(key) &&
      matchesPeriod(key) &&
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ''
    ) {
      return value
    }
  }

  return null
}

function formatStudyDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getDate()).padStart(2, '0')}.${String(value.getMonth() + 1).padStart(2, '0')}.${value.getFullYear()}`
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      return `${String(parsed.d).padStart(2, '0')}.${String(parsed.m).padStart(2, '0')}.${parsed.y}`
    }
  }

  const text = String(value || '').trim()
  if (!text) return null
  if (/^\d{5,6}(?:\.\d+)?$/.test(text)) {
    const parsed = XLSX.SSF.parse_date_code(Number(text))
    if (parsed) {
      return `${String(parsed.d).padStart(2, '0')}.${String(parsed.m).padStart(2, '0')}.${parsed.y}`
    }
  }

  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (dmy) {
    const [, day, month, rawYear] = dmy
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear
    return `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`

  return null
}

function getStudyTerm(student) {
  const startValue = findImportedValue(student, [
    'study_start_date',
    'Початок навчання',
    'Дата початку навчання',
    'Дата початку строку навчання',
    'Дата зарахування',
    'Дата вступу',
    'Зарахований на навчання з',
    'Навчання з',
    'Термін навчання з'
  ]) || findImportedStudyDate(student, 'start')
  const endValue = findImportedValue(student, [
    'study_end_date',
    'Завершення навчання',
    'Дата завершення навчання',
    'Дата закінчення навчання',
    'Дата завершення строку навчання',
    'Дата закінчення строку навчання',
    'Навчання до',
    'Термін навчання до'
  ]) || findImportedStudyDate(student, 'end')
  const start = formatStudyDate(startValue)
  const end = formatStudyDate(endValue)

  return start && end ? { start, end } : null
}

function groupIdentityKeys(student) {
  const fields = getStudentFields(student)
  const name = normalizeIdentityPart(student.applicant || fields.applicant || fields['Здобувач'])
  const specialty = normalizeIdentityPart(student.specialty || fields.specialty || fields['Спеціальність'])
  const groupSpecialty = normalizeIdentityPart(student.group_specialty)
  const effectiveSpecialty = specialty || groupSpecialty
  const inpNumber = normalizeIdentityPart(student.inp_number || fields.inp_number || fields['Номер ІНП'])
  const keys = []

  if (inpNumber) keys.push(`inp:${inpNumber}`)
  if (name) keys.push(`name:${name}|${effectiveSpecialty}`)
  if (!keys.length) keys.push(`id:${student.id}`)
  return keys
}

function getEffectiveSpecialty(student, group) {
  return String(
    student.specialty ||
    findImportedValue(student, ['Спеціальність', 'specialty']) ||
    group.specialty ||
    ''
  ).trim()
}

function getEffectiveCourse(student, group) {
  const importedCourse = findImportedValue(student, ['Курс', 'course'])
  const importedCourseNumber = String(importedCourse || '').match(/\d+/)?.[0]
  const course = Number(importedCourseNumber || group.course)
  return Number.isInteger(course) && course > 0 ? course : null
}

function getEducationProgram(student) {
  return String(findImportedValue(student, [
    'Освітньо-професійна програма',
    'Освітня програма',
    'ОПП',
    'education_program'
  ]) || '').trim()
}

function generatedDate() {
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date())
}

function courseOrdinal(course) {
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
  return ordinals[course] || `${course}-й`
}

function replaceCertificateBody(templateBody, student, group) {
  let body = String(templateBody || '')
  const course = getEffectiveCourse(student, group)
  const specialty = getEffectiveSpecialty(student, group)
  const program = getEducationProgram(student)
  const courseText = body.match(/на\s+.+?\s+курс\s+денної форми/i)?.[0]
  if (courseText) {
    body = body.replace(courseText, `на ${courseOrdinal(course)} курс денної форми`)
  }

  const specialtyStart = body.indexOf('за спеціальністю ')
  const programStart = body.indexOf(' освітньо-професійна програма', specialtyStart)
  if (specialty && specialtyStart !== -1 && programStart !== -1) {
    body = `${body.slice(0, specialtyStart)}за спеціальністю ${specialty}${body.slice(programStart)}`
  }

  const programPattern = / освітньо-професійна програма «[^»]*»/
  if (program && programPattern.test(body)) {
    body = body.replace(programPattern, ` освітньо-професійна програма «${program}»`)
  } else if (program && !programPattern.test(body)) {
    body = body.replace(/\s+в групу\s+#ГРУПА#/, ` освітньо-професійна програма «${program}» в групу #ГРУПА#`)
  }

  return body.replaceAll('#ГРУПА#', String(group.name || ''))
}

function replaceStudyTerm(templateText, term) {
  const dateRange = /(\s+з\s*)\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(\s+до\s+)\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/
  const text = String(templateText || '')
  if (!dateRange.test(text)) {
    throw new Error('У шаблоні довідки не знайдено місце для терміну навчання.')
  }
  return text.replace(dateRange, `$1${term.start}$2${term.end}`)
}

export async function createCertificate(template, student, group, term, date) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(template)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('Аркуш шаблону довідки не знайдено.')

  for (const [address, value] of [
    ['B13', student.applicant],
    ['B35', student.applicant],
    ['A14', replaceCertificateBody(sheet.getCell('A14').text, student, group)],
    ['A36', replaceCertificateBody(sheet.getCell('A36').text, student, group)],
    ['A15', replaceStudyTerm(sheet.getCell('A15').text, term)],
    ['J9', date],
    ['J32', date]
  ]) {
    sheet.getCell(address).value = String(value || '').trim()
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

function sanitizeFileName(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '') || 'group'
}

async function getGroupById(groupId) {
  const [rows] = await pool.query(
    `SELECT id, name, specialty, course
     FROM student_groups
     WHERE id = ?
     LIMIT 1`,
    [groupId]
  )
  return rows[0] || null
}

async function getGroupStudents(groupId) {
  const [rows] = await pool.query(
    `SELECT ga.id, ga.applicant, ga.inp_number, ga.specialty, ga.funding_source,
            ga.status, ga.imported_data, sg.specialty AS group_specialty
     FROM group_applicants ga
     JOIN student_groups sg ON sg.id = ga.group_id
     WHERE ga.group_id = ?
       AND TRIM(IFNULL(ga.applicant, '')) <> ''
     ORDER BY ga.applicant, ga.id`,
    [groupId]
  )

  return deduplicateStudents(rows)
}

function studyTermReport(students) {
  return students
    .filter(student => !getStudyTerm(student))
    .map(student => String(student.applicant || `ID ${student.id}`))
}

export async function getCertificateGroups(req, res) {
  try {
    const [groups] = await pool.query(
      `SELECT id, name, specialty, course
       FROM student_groups
       ORDER BY course, name`
    )
    const results = await Promise.all(groups.map(async group => {
      const students = await getGroupStudents(group.id)
      return {
        ...group,
        students_count: students.length,
        missing_study_term_students: studyTermReport(students)
      }
    }))

    res.json(results)
  } catch (error) {
    console.error('ПОМИЛКА ОТРИМАННЯ ГРУП ДЛЯ ДОВІДОК:', error)
    res.status(500).json({ message: 'Не вдалося завантажити групи для створення довідок.' })
  }
}

export async function downloadGroupCertificates(req, res) {
  try {
    const groupId = Number(req.params.groupId)
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({ message: 'Некоректний ідентифікатор групи.' })
    }

    const group = await getGroupById(groupId)
    if (!group) return res.status(404).json({ message: 'Групу не знайдено.' })

    const students = await getGroupStudents(groupId)
    if (!students.length) {
      return res.status(400).json({ message: 'У цій групі немає студентів для створення довідок.' })
    }

    const missingStudents = studyTermReport(students)
    if (missingStudents.length) {
      return res.status(422).json({
        message: 'Не вдалося створити архів: у картках цих студентів не заповнено початок або завершення навчання.',
        students: missingStudents
      })
    }

    const missingSpecialty = students.filter(student => !getEffectiveSpecialty(student, group))
    if (missingSpecialty.length) {
      return res.status(422).json({
        message: 'Не вдалося створити архів: не вказана спеціальність у картці студента або групи.',
        students: missingSpecialty.map(student => student.applicant)
      })
    }

    const missingCourse = students.filter(student => !getEffectiveCourse(student, group))
    if (missingCourse.length) {
      return res.status(422).json({
        message: 'Не вдалося створити архів: не вказаний курс у картці студента або групи.',
        students: missingCourse.map(student => student.applicant)
      })
    }

    const template = await fs.readFile(templatePath)
    const date = generatedDate()
    const archive = new JSZip()
    const folder = archive.folder(sanitizeFileName(group.name))

    for (const [index, student] of students.entries()) {
      const certificate = await createCertificate(template, student, group, getStudyTerm(student), date)
      const fileName = `${String(index + 1).padStart(2, '0')} - ${sanitizeFileName(student.applicant)}.xlsx`
      folder.file(fileName, certificate)
    }

    const output = await archive.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    const archiveName = `${sanitizeFileName(group.name)} - довідки - ${date.replaceAll('.', '-')}.zip`

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(archiveName)}`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(output)
  } catch (error) {
    console.error('ПОМИЛКА СТВОРЕННЯ АРХІВУ ДОВІДОК:', error)
    res.status(500).json({ message: error.message || 'Не вдалося сформувати архів довідок.' })
  }
}
