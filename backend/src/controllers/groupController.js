import pool from '../config/database.js'
import XLSX from 'xlsx'
import iconv from 'iconv-lite'
import JSZip from 'jszip'
import { SaxesParser } from 'saxes'
import path from 'node:path'
import { createHash } from 'node:crypto'

const parseCsvLine = (line, delimiter = ',') => {
  const cells = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
        continue
      }

      inQuotes = !inQuotes
      continue
    }

    if (!inQuotes && char === delimiter) {
      cells.push(current)
      current = ''
      continue
    }

    current += char
  }

  cells.push(current)

  return cells.map((cell) => cell.trim())
}

const normalizeImportHeader = (value) => {
  const header = String(value || '')
    .toLowerCase()
    .replace(/[\s\u00A0]+/g, ' ')
    .replace(/[^a-zа-яґєії0-9 ]/g, '')
    .trim()

  if (['name', 'group', 'group name', 'назва групи', 'група', 'назва'].includes(header)) {
    return 'group'
  }

  if (['specialty', 'speciality', 'specialization', 'спеціальність'].includes(header)) {
    return 'specialty'
  }

  if (['course', 'курс'].includes(header)) {
    return 'course'
  }

  if (['students_count', 'students count', 'students', 'кількість студентів', 'контингент'].includes(header)) {
    return 'students_count'
  }

  if (['applicant', 'здобувач', 'student', 'student name', 'прізвище', 'п.і.б', 'п.і.б'].includes(header)) {
    return 'applicant'
  }

  if (['inp', 'інп', 'номер інп', 'student number'].includes(header)) {
    return 'inp_number'
  }

  if (['funding_source', 'джерело фінансування', 'source', 'finance', 'financial source', 'funding'].includes(header)) {
    return 'funding_source'
  }

  if (['category_code', 'код категорії', 'категорія', 'категория', 'category'].includes(header) || header.includes('катег') || header.includes('category')) {
    return 'category_code'
  }

  if (['status', 'статус', 'student_status', 'статус студента', 'статус навчання'].includes(header) || header.includes('status') || header.includes('статус навчання')) {
    return 'status'
  }

  if (['academic_leave_from', 'academic leave from', 'date_from', 'дата з', 'з коли', 'академвідпустка з', 'академ відпустка з', 'academic leave start', 'start_date', 'статус з'].includes(header) || (header.includes('академ') && header.includes('з')) || (header.includes('статус') && header.includes('з') && !header.includes('по'))) {
    return 'academic_leave_from'
  }

  if (['academic_leave_to', 'academic leave to', 'date_to', 'дата по', 'по яку дату', 'до', 'академвідпустка по', 'академ відпустка по', 'academic leave end', 'end_date', 'статус по'].includes(header) || (header.includes('академ') && header.includes('по')) || (header.includes('статус') && header.includes('по'))) {
    return 'academic_leave_to'
  }

  return null
}

const buildHeaderIndex = (headerCells) => {
  const headerIndex = {}

  headerCells.forEach((header, index) => {
    const field = normalizeImportHeader(header)
    if (field && headerIndex[field] === undefined) {
      headerIndex[field] = index
    }
  })

  if (!('category_code' in headerIndex)) {
    headerCells.some((header, index) => {
      if (header.includes('катег') || header.includes('category')) {
        headerIndex.category_code = index
        return true
      }
      return false
    })
  }

  return headerIndex
}

const getImportedData = (headers, cells) => headers.reduce((data, header, index) => {
  const label = String(header || '').trim()
  const value = String(cells[index] ?? '').trim()
  if (label) data[label] = value
  return data
}, {})

const getBirthDateFromImportedData = (headers, cells) => {
  const birthDateIndex = headers.findIndex((header) => {
    const normalizedHeader = String(header || '')
      .toLowerCase()
      .replace(/[^a-zа-яґєіїё0-9]/g, '')

    return ['датанародження', 'датарождения', 'dateofbirth', 'birthdate', 'dob'].includes(normalizedHeader)
  })

  const value = birthDateIndex === -1 ? '' : String(cells[birthDateIndex] ?? '').trim()
  return value || String(cells[6] ?? '').trim()
}

const studentDetailColumns = {
  applicant: { index: 5, headers: ['здобувач', 'піб', 'прізвище ім я по батькові', 'student name', 'applicant'] },
  birth_date: { index: 6, headers: ['дата народження', 'date of birth', 'birth date', 'dob'] },
  study_start_date: {
    headers: [
      'початок навчання',
      'дата початку навчання',
      'дата зарахування',
      'дата вступу',
      'зарахування на навчання',
      'зарахований на навчання з',
      'навчання з',
      'період навчання з',
      'термін навчання з',
      'початок періоду навчання',
      'дата початку строку навчання',
      'study start date',
      'start date of study',
      'start of study',
      'enrollment date'
    ]
  },
  study_end_date: {
    headers: [
      'завершення навчання',
      'дата завершення навчання',
      'дата закінчення навчання',
      'дата завершення строку навчання',
      'дата закінчення строку навчання',
      'дата випуску',
      'навчання до',
      'період навчання до',
      'термін навчання до',
      'кінець навчання',
      'study end date',
      'end date of study',
      'end of study',
      'graduation date'
    ]
  },
  gender: { index: 12, headers: ['стать', 'gender', 'sex'] },
  admission_basis: { index: 24, headers: ['вступ на основі', 'основа вступу', 'admission basis'] },
  funding_source: { index: 26, headers: ['джерело фінансування', 'funding source'] },
  specialty: { index: 30, headers: ['спеціальність', 'specialty', 'speciality'] },
  course: { index: 35, headers: ['курс', 'course'] },
  group: { index: 36, headers: ['група', 'group'] },
  category_code: { index: 38, headers: ['код категорії', 'category code'] },
  enrollment_order: { index: 50, headers: ['наказ про зарахування', 'enrollment order', 'admission order'] },
  admission_score: { index: 59, headers: ['кб при вступі', 'кб при поступлении', 'admission score', 'competitive score'] }
}

const normalizeStudentDetailHeader = (value) => String(value || '')
  .toLowerCase()
  .replace(/[\s\u00a0]+/g, ' ')
  .trim()

const normalizeStudyDateHeader = (value) => String(value || '')
  .normalize('NFC')
  .toLowerCase()
  .replace(/[^a-zа-яґєіїё0-9]/g, '')

const findStudyDateHeaderIndex = (headers, fieldName) => {
  const aliases = new Set(studentDetailColumns[fieldName].headers.map(normalizeStudyDateHeader))
  const exactMatch = headers.findIndex((header) => aliases.has(normalizeStudyDateHeader(header)))
  if (exactMatch !== -1) return exactMatch

  return headers.findIndex((header) => {
    const normalized = normalizeStudyDateHeader(header)
    if (/акад|відпуст|leave/.test(normalized)) return false

    return fieldName === 'study_start_date'
      ? normalized.startsWith('початок') || normalized.startsWith('датапочатку') ||
        normalized.startsWith('зарахування') || normalized.startsWith('навчанняз')
      : normalized.startsWith('заверш') || normalized.startsWith('закінч') ||
        normalized.startsWith('кінець') || normalized.startsWith('датазавершення') ||
        normalized.startsWith('навчаннядо')
  })
}

const getImportedStudentData = (headers, cells) => {
  const data = getImportedData(headers, cells)
  const fields = {}
  const hasFullStudentExport = headers.length > 59

  for (const [key, definition] of Object.entries(studentDetailColumns)) {
    const matchedIndex = headers.findIndex((header) => definition.headers.includes(normalizeStudentDetailHeader(header)))
    const index = matchedIndex !== -1
      ? matchedIndex
      : hasFullStudentExport && Number.isInteger(definition.index)
        ? definition.index
        : -1
    fields[key] = index === -1 ? '' : String(cells[index] ?? '').trim()
  }

  for (const key of ['study_start_date', 'study_end_date']) {
    const matchedIndex = findStudyDateHeaderIndex(headers, key)
    fields[key] = matchedIndex === -1 ? '' : String(cells[matchedIndex] ?? '').trim()
  }

  fields.birth_date = fields.birth_date || getBirthDateFromImportedData(headers, cells)
  data.student_fields = fields
  if (fields.birth_date) data.birth_date = fields.birth_date
  return data
}

const normalizeImportSpecialty = (value) => String(value || '').replace(/\s+/g, ' ').trim()

export const isAllowedImportSpecialty = (value) => {
  const text = normalizeImportSpecialty(value).toLowerCase()

  if (!text) {
    return false
  }

  const compact = text.replace(/[^a-zа-яїієґ0-9]/g, '')
  const has171OrG5Code = /(?:^|[^a-zа-яїієґ0-9])(?:171|g5)(?=$|[^a-zа-яїієґ0-9])/i.test(text)

  const hasSoftwareEngineering = compact.includes('інженеріяпрограмногозабезпечення') || compact.includes('softwareengineering')
  const is121 = compact.includes('121')
  const isF2 = compact.includes('f2')

  return has171OrG5Code || (hasSoftwareEngineering && (is121 || isF2))
}

const pruneDisallowedApplicants = async () => {
  const [rows] = await pool.query(`SELECT id, specialty FROM group_applicants`)

  const idsToDelete = (rows || [])
    .filter((row) => {
      const specialty = String(row.specialty || '').trim()
      return specialty && !isAllowedImportSpecialty(specialty)
    })
    .map((row) => row.id)

  if (idsToDelete.length === 0) {
    return
  }

  const placeholders = idsToDelete.map(() => '?').join(', ')
  await pool.query(`DELETE FROM group_applicants WHERE id IN (${placeholders})`, idsToDelete)
}

const pruneDisallowedGroups = async () => {
  const [rows] = await pool.query(`SELECT id, specialty FROM student_groups`)

  const idsToDelete = (rows || [])
    .filter((row) => {
      const specialty = String(row.specialty || '').trim()
      return !specialty || !isAllowedImportSpecialty(specialty)
    })
    .map((row) => row.id)

  if (idsToDelete.length === 0) {
    return
  }

  const placeholders = idsToDelete.map(() => '?').join(', ')
  await pool.query(`DELETE FROM student_groups WHERE id IN (${placeholders})`, idsToDelete)
}

const parseCsvRows = (content) => {
  const normalized = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\uFEFF/, '')
    .trim()

  if (!normalized) {
    return []
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return []
  }

  const headerLine = lines[0]
  const delimiter = headerLine.includes(';') && !headerLine.includes(',') ? ';' : ','
  const rawHeaders = parseCsvLine(headerLine, delimiter)
  const headerCells = rawHeaders.map((cell) => cell.toLowerCase().replace(/\s+/g, ' ').trim())

  const headerIndex = buildHeaderIndex(headerCells)

  if (!('group' in headerIndex) && headerCells.length > 0) headerIndex.group = 0
  if (!('specialty' in headerIndex) && headerCells.length > 1) headerIndex.specialty = 1

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line, delimiter)
    const values = {
      group: String(cells[headerIndex.group] || '').trim(),
      specialty: String(cells[headerIndex.specialty] || '').trim(),
      applicant: String(cells[headerIndex.applicant] || '').trim(),
      inp_number: String(cells[headerIndex.inp_number] || '').trim(),
      funding_source: String(cells[headerIndex.funding_source] || '').trim(),
      category_code: String(cells[headerIndex.category_code] || '').trim(),
      status: String(cells[headerIndex.status] || '').trim(),
      academic_leave_from: String(cells[headerIndex.academic_leave_from] || '').trim(),
      academic_leave_to: String(cells[headerIndex.academic_leave_to] || '').trim(),
      course: String(cells[headerIndex.course] || '').trim(),
      students_count: String(cells[headerIndex.students_count] || '').trim(),
      imported_data: getImportedStudentData(rawHeaders, cells)
    }

    if (!values.group && !values.applicant) {
      return null
    }

    if (values.specialty && !isAllowedImportSpecialty(values.specialty)) {
      return null
    }

    const course = values.course === '' ? null : Number(values.course.replace(',', '.'))
    const students_count = values.students_count === '' ? 0 : Number(values.students_count.replace(',', '.'))

    return {
      group: values.group || null,
      specialty: values.specialty || null,
      applicant: values.applicant || null,
      inp_number: values.inp_number || null,
      funding_source: values.funding_source || null,
      category_code: values.category_code || null,
      status: normalizeApplicantStatus(values.status),
      academic_leave_from: parseAcademicDate(values.academic_leave_from),
      academic_leave_to: parseAcademicDate(values.academic_leave_to),
      course: Number.isFinite(course) ? course : null,
      students_count: Number.isFinite(students_count) ? students_count : 0,
      imported_data: values.imported_data
    }
  }).filter(Boolean)
}

const ensureGroupApplicantsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_applicants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NULL,
      applicant VARCHAR(255),
      funding_source VARCHAR(255),
      specialty VARCHAR(255),
      category_code VARCHAR(255),
      status VARCHAR(255) DEFAULT 'active',
      academic_leave_from DATE NULL,
      academic_leave_to DATE NULL,
      inp_number VARCHAR(255) NULL,
      imported_data JSON NULL,
      FOREIGN KEY (group_id) REFERENCES student_groups(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS applicant_action_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      applicant_id INT NULL,
      applicant_name VARCHAR(255),
      group_id INT NULL,
      group_name VARCHAR(255),
      action_type VARCHAR(255) NOT NULL,
      action_label VARCHAR(255) NOT NULL,
      details JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_history_applicant (applicant_id),
      INDEX idx_history_group (group_id),
      INDEX idx_history_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `)

  const [classTeacherColumns] = await pool.query(
    `SHOW COLUMNS FROM student_groups LIKE 'class_teacher_id'`
  )
  if (!classTeacherColumns.length) {
    await pool.query('ALTER TABLE student_groups ADD COLUMN class_teacher_id INT NULL')
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_applicant_photos (
      photo_identity CHAR(64) PRIMARY KEY,
      content_type VARCHAR(32) NOT NULL,
      image_data LONGBLOB NOT NULL,
      original_filename VARCHAR(255) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_applicant_contacts (
      contact_identity CHAR(64) PRIMARY KEY,
      contact_data JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_applicant_manual_data (
      applicant_id INT PRIMARY KEY,
      contact_data JSON NOT NULL,
      benefit_category VARCHAR(255) NULL,
      benefit_category_set BOOLEAN NOT NULL DEFAULT FALSE,
      photo_content_type VARCHAR(32) NULL,
      photo_data LONGBLOB NULL,
      photo_filename VARCHAR(255) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (applicant_id) REFERENCES group_applicants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `)
  const [manualBenefitCategorySetColumns] = await pool.query(
    `SHOW COLUMNS FROM group_applicant_manual_data LIKE 'benefit_category_set'`
  )
  if (!manualBenefitCategorySetColumns.length) {
    await pool.query(
      `ALTER TABLE group_applicant_manual_data
       ADD COLUMN benefit_category_set BOOLEAN NOT NULL DEFAULT FALSE`
    )
  }

  const [groupIdColumns] = await pool.query(`SHOW COLUMNS FROM group_applicants LIKE 'group_id'`)
  if (groupIdColumns.length > 0) {
    const groupIdType = groupIdColumns[0].Type || ''
    if (!/NULL/.test(groupIdType) && !/int\s*\(.*\)\s*DEFAULT\s*NULL/.test(groupIdType)) {
      await pool.query(`ALTER TABLE group_applicants MODIFY COLUMN group_id INT NULL`)
    }
  }

  const [columns] = await pool.query(`SHOW COLUMNS FROM group_applicants LIKE 'category_code'`)
  if (columns.length === 0) {
    await pool.query(`ALTER TABLE group_applicants ADD COLUMN category_code VARCHAR(255) NULL`)
  }

  const [statusColumns] = await pool.query(`SHOW COLUMNS FROM group_applicants LIKE 'status'`)
  if (statusColumns.length === 0) {
    await pool.query(`ALTER TABLE group_applicants ADD COLUMN status VARCHAR(255) DEFAULT 'active'`)
  }

  const [leaveFromColumns] = await pool.query(`SHOW COLUMNS FROM group_applicants LIKE 'academic_leave_from'`)
  if (leaveFromColumns.length === 0) {
    await pool.query(`ALTER TABLE group_applicants ADD COLUMN academic_leave_from DATE NULL`)
  }

  const [leaveToColumns] = await pool.query(`SHOW COLUMNS FROM group_applicants LIKE 'academic_leave_to'`)
  if (leaveToColumns.length === 0) {
    await pool.query(`ALTER TABLE group_applicants ADD COLUMN academic_leave_to DATE NULL`)
  }

  const [inpColumns] = await pool.query(`SHOW COLUMNS FROM group_applicants LIKE 'inp_number'`)
  if (inpColumns.length === 0) {
    await pool.query(`ALTER TABLE group_applicants ADD COLUMN inp_number VARCHAR(255) NULL`)
  }

  const [importedDataColumns] = await pool.query(`SHOW COLUMNS FROM group_applicants LIKE 'imported_data'`)
  if (importedDataColumns.length === 0) {
    await pool.query(`ALTER TABLE group_applicants ADD COLUMN imported_data JSON NULL`)
  }
}


const parseAcademicDate = (value) => {
  if (!value && value !== 0) return null

  const raw = String(value).trim()
  if (!raw) return null

  const date = new Date(raw)
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10)
  }

  const match = raw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/)
  if (match) {
    const [, d, m, y] = match
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  return null
}

const normalizeApplicantStatus = (value) => {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return 'active'

  if (/(повернено з академ|returned from academic|back from academic|відновлено.*академ|returned.*leave|back.*leave)/i.test(text)) {
    return 'Повернено з академвідпустки'
  }

  if (/(академ.?відп|academic.?leave|leave)/i.test(text)) {
    return 'Надано академвідпустку'
  }

  if (/(відрах|dismiss|expel|removed)/i.test(text)) {
    return 'Відрахований'
  }

  return 'active'
}

const normalizeApplicantIdentityPart = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('uk')

const normalizeApplicantSpecialtyIdentity = (value) => {
  const specialty = normalizeApplicantIdentityPart(value)
  const compact = specialty.replace(/[^a-zа-яїієґ0-9]/g, '')
  const hasSoftwareEngineering = compact.includes('інженеріяпрограмногозабезпечення') || compact.includes('softwareengineering')

  if (hasSoftwareEngineering && (compact.includes('121') || compact.includes('f2'))) {
    return '121/f2 інженерія програмного забезпечення'
  }

  if (/(?:^|[^a-zа-яїієґ0-9])(?:171|g5)(?=$|[^a-zа-яїієґ0-9])/i.test(specialty)) {
    return '171/g5 електроніка'
  }

  return specialty
}

const getApplicantIdentityKey = (applicant) => {
  const inpNumber = normalizeApplicantIdentityPart(applicant.inp_number)
  if (inpNumber) return `inp:${inpNumber}`

  const name = normalizeApplicantIdentityPart(applicant.applicant)
  if (!name) return null

  return JSON.stringify([
    'name',
    name,
    normalizeApplicantSpecialtyIdentity(applicant.specialty),
    normalizeApplicantIdentityPart(applicant.funding_source)
  ])
}

const getApplicantNameSpecialtyKey = (applicant) => {
  const name = normalizeApplicantIdentityPart(applicant.applicant)
  if (!name) return null

  return JSON.stringify([name, normalizeApplicantSpecialtyIdentity(applicant.specialty)])
}

const getApplicantRosterIdentityKeys = (applicant) => {
  const keys = []
  const inpNumber = normalizeApplicantIdentityPart(applicant.inp_number)
  const nameSpecialtyKey = getApplicantNameSpecialtyKey(applicant)

  if (inpNumber) keys.push(`inp:${inpNumber}`)
  if (nameSpecialtyKey) keys.push(`name:${nameSpecialtyKey}`)
  return keys
}

const deduplicateApplicantRows = (applicants) => {
  const uniqueApplicants = []
  const indexByIdentity = new Map()
  const identitiesByIndex = []

  for (const applicant of applicants || []) {
    const keys = getApplicantRosterIdentityKeys(applicant)
    const existingIndex = keys
      .map((key) => indexByIdentity.get(key))
      .find((index) => index !== undefined)

    if (existingIndex === undefined) {
      const index = uniqueApplicants.push(applicant) - 1
      identitiesByIndex[index] = keys
      for (const key of keys) indexByIdentity.set(key, index)
      continue
    }

    const existing = uniqueApplicants[existingIndex]
    const preferIncoming = Boolean(applicant.group_id) && !existing.group_id
    const merged = mergeDuplicateApplicantData(existing, applicant)
    const preferred = preferIncoming ? applicant : existing
    uniqueApplicants[existingIndex] = {
      ...merged,
      ...preferred,
      imported_data: merged.imported_data,
      id: preferred.id,
      group_id: preferred.group_id
    }

    for (const key of identitiesByIndex[existingIndex]) indexByIdentity.delete(key)
    identitiesByIndex[existingIndex] = [...new Set([...keys, ...getApplicantRosterIdentityKeys(uniqueApplicants[existingIndex])])]
    for (const key of identitiesByIndex[existingIndex]) indexByIdentity.set(key, existingIndex)
  }

  return uniqueApplicants
}

const deduplicateApplicants = (applicants) => {
  const uniqueApplicants = []
  const indexByKey = new Map()
  const keysByIndex = []

  for (const applicant of applicants || []) {
    const name = normalizeApplicantIdentityPart(applicant.applicant)
    const inpNumber = normalizeApplicantIdentityPart(applicant.inp_number)
    const keys = []

    if (name) {
      keys.push(JSON.stringify([
        'name',
        name,
        normalizeApplicantSpecialtyIdentity(applicant.specialty),
        normalizeApplicantIdentityPart(applicant.funding_source)
      ]))
    }
    if (inpNumber) keys.push(`inp:${inpNumber}`)

    const existingIndex = keys.map((key) => indexByKey.get(key)).find((index) => index !== undefined)
    if (existingIndex === undefined) {
      const index = uniqueApplicants.push(applicant) - 1
      keysByIndex[index] = keys
      for (const key of keys) indexByKey.set(key, index)
    } else {
      uniqueApplicants[existingIndex] = applicant
      for (const key of keysByIndex[existingIndex]) indexByKey.delete(key)
      keysByIndex[existingIndex] = keys
      for (const key of keys) indexByKey.set(key, existingIndex)
    }
  }

  return uniqueApplicants
}

const removeImportedUngroupedDuplicates = async (applicants) => {
  const names = [...new Set((applicants || [])
    .map((applicant) => String(applicant.applicant || '').trim())
    .filter(Boolean))]
  const inpNumbers = [...new Set((applicants || [])
    .map((applicant) => String(applicant.inp_number || '').trim())
    .filter(Boolean))]
  const conditions = []
  const params = []

  if (names.length) {
    conditions.push(`LOWER(TRIM(IFNULL(ga.applicant, ''))) IN (${names.map(() => '?').join(', ')})`)
    params.push(...names.map((name) => name.toLocaleLowerCase('uk')))
  }
  if (inpNumbers.length) {
    conditions.push(`LOWER(TRIM(IFNULL(ga.inp_number, ''))) IN (${inpNumbers.map(() => '?').join(', ')})`)
    params.push(...inpNumbers.map((inpNumber) => inpNumber.toLocaleLowerCase('uk')))
  }
  if (!conditions.length) return

  const [existingApplicants] = await pool.query(
    `SELECT ga.id, ga.applicant, ga.inp_number, ga.specialty
     FROM group_applicants ga
     LEFT JOIN student_groups sg ON sg.id = ga.group_id
     WHERE (ga.group_id IS NULL OR ga.group_id = 0 OR sg.id IS NULL)
       AND (${conditions.join(' OR ')})`,
    params
  )

  const importedByNameAndSpecialty = new Set((applicants || [])
    .map(getApplicantNameSpecialtyKey)
    .filter(Boolean))
  const importedInpNumbers = new Set(inpNumbers.map((value) => normalizeApplicantIdentityPart(value)))
  const duplicateIds = existingApplicants
    .filter((existing) => {
      const sameNameAndSpecialty = importedByNameAndSpecialty.has(getApplicantNameSpecialtyKey(existing))
      const sameInpNumber = existing.inp_number &&
        importedInpNumbers.has(normalizeApplicantIdentityPart(existing.inp_number))
      return sameNameAndSpecialty || sameInpNumber
    })
    .map((existing) => existing.id)

  if (duplicateIds.length) {
    await pool.query(
      `DELETE FROM group_applicants WHERE id IN (${duplicateIds.map(() => '?').join(', ')})`,
      duplicateIds
    )
  }
}

const deduplicateSummaryApplicants = (applicants) => {
  const uniqueApplicants = new Map()

  for (const applicant of applicants || []) {
    const name = normalizeApplicantIdentityPart(applicant.applicant)
    const identityKey = name
      ? JSON.stringify([name, normalizeApplicantSpecialtyIdentity(applicant.specialty)])
      : applicant.inp_number
        ? `inp:${normalizeApplicantIdentityPart(applicant.inp_number)}`
        : `id:${applicant.id}`
    const existing = uniqueApplicants.get(identityKey)
    const isBudget = String(applicant.funding_source || '').toLowerCase().includes('бюджет')
    const existingIsBudget = String(existing?.funding_source || '').toLowerCase().includes('бюджет')

    if (!existing || (isBudget && !existingIsBudget)) {
      uniqueApplicants.set(identityKey, applicant)
    }
  }

  return [...uniqueApplicants.values()]
}

const getApplicantImportedData = (applicant) => {
  let data = applicant?.imported_data
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (error) {
      console.error('Не вдалося прочитати імпортовані дані студента:', error)
      return {}
    }
  }

  return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
}

const getArchiveStudentRecords = (xml) => {
  const records = []
  const stack = []
  let currentRecord = null
  const parser = new SaxesParser()

  parser.on('opentag', (tag) => {
    const name = tag.name.split(':').pop()
    if (stack.length === 1 && name === 'Document') currentRecord = {}
    if (stack.length) stack[stack.length - 1].hasChild = true
    stack.push({ name, text: '', hasChild: false })
  })

  const appendText = (value) => {
    if (stack.length) stack[stack.length - 1].text += value
  }
  parser.on('text', appendText)
  parser.on('cdata', appendText)

  parser.on('closetag', (tag) => {
    const node = stack.pop()
    const name = tag.name.split(':').pop()
    if (currentRecord && stack.length >= 2 && !node.hasChild && name !== 'Document') {
      currentRecord[name] = node.text.trim()
    }
    if (stack.length === 1 && name === 'Document' && currentRecord) {
      records.push(currentRecord)
      currentRecord = null
    }
  })

  parser.write(xml).close()
  return records
}

const normalizePhotoGroupName = (value) => normalizeApplicantIdentityPart(value)
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

const normalizePhotoStudentName = (value) => normalizeApplicantIdentityPart(value)
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

const normalizePhotoSpecialty = (value) => {
  const specialty = normalizeApplicantIdentityPart(value)
    .replace(/^(?:121|f2|171|g5)\s*/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')

  if (specialty.includes('інженеріяпрограмногозабезпечення')) return 'softwareengineering'
  if (specialty.includes('електроніка')) return 'electronics'
  return specialty
}

const getPhotoIdentity = (student, groupName = student.group_name) => {
  const group = normalizePhotoGroupName(groupName)
  const name = normalizePhotoStudentName(student.applicant)
  const specialty = normalizePhotoSpecialty(student.group_specialty || student.specialty)
  if (!group || !name || !specialty) return null

  return createHash('sha256')
    .update(JSON.stringify([group, name, specialty, getImportedApplicantTaxId(student)]))
    .digest('hex')
}

const attachStudentPhotoUrls = async (students) => {
  if (!students.length) return students

  const identityByStudentId = new Map()
  for (const student of students) {
    const identity = getPhotoIdentity(student)
    if (identity) identityByStudentId.set(student.id, identity)
  }
  const identities = [...new Set(identityByStudentId.values())]
  const applicantIds = students.map((student) => Number(student.id)).filter(Number.isInteger)
  const [photosResult, contactsResult, manualResult] = await Promise.all([
    identities.length
      ? pool.query(
          `SELECT photo_identity FROM group_applicant_photos WHERE photo_identity IN (${identities.map(() => '?').join(', ')})`,
          identities
        )
      : Promise.resolve([[]]),
    identities.length
      ? pool.query(
          `SELECT contact_identity, contact_data FROM group_applicant_contacts WHERE contact_identity IN (${identities.map(() => '?').join(', ')})`,
          identities
        )
      : Promise.resolve([[]]),
    applicantIds.length
      ? pool.query(
          `SELECT applicant_id, contact_data, benefit_category, benefit_category_set, photo_content_type
           FROM group_applicant_manual_data WHERE applicant_id IN (${applicantIds.map(() => '?').join(', ')})`,
          applicantIds
        )
      : Promise.resolve([[]])
  ])
  const [photos] = photosResult
  const [contacts] = contactsResult
  const [manualRows] = manualResult
  const savedIdentities = new Set(photos.map((photo) => photo.photo_identity))
  const contactsByIdentity = new Map(contacts.map((contact) => [
    contact.contact_identity,
    typeof contact.contact_data === 'string' ? JSON.parse(contact.contact_data) : contact.contact_data
  ]))
  const manualByApplicantId = new Map(manualRows.map((row) => [
    Number(row.applicant_id),
    {
      contactData: typeof row.contact_data === 'string' ? JSON.parse(row.contact_data) : row.contact_data,
      benefitCategory: row.benefit_category,
      benefitCategorySet: Boolean(row.benefit_category_set),
      hasPhoto: Boolean(row.photo_content_type)
    }
  ]))

  return students.map((student) => {
    const identity = identityByStudentId.get(student.id)
    const manual = manualByApplicantId.get(Number(student.id))
    const importedContacts = identity ? contactsByIdentity.get(identity) || {} : {}
    return {
      ...student,
      ...(manual?.hasPhoto || (identity && savedIdentities.has(identity)) ? { photo_url: `/groups/applicants/${student.id}/photo` } : {}),
      ...((identity && contactsByIdentity.has(identity)) || manual ? {
        student_contacts: {
          ...importedContacts,
          ...(manual?.contactData || {}),
          ...(manual?.benefitCategorySet
            ? { benefit_category: manual.benefitCategory }
            : {})
        }
      } : {})
    }
  })
}

const getImportedApplicantTaxId = (applicant) => {
  const importedData = getApplicantImportedData(applicant)
  const entry = Object.entries(importedData).find(([key]) => {
    const normalizedKey = key.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
    return ['рнокпп', 'инн', 'taxidentificationnumber'].includes(normalizedKey)
  })
  return entry ? String(entry[1] || '').replace(/\D/g, '') : ''
}

const matchPhotoArchiveStudent = (record, studentsByGroupName, studentsByName) => {
  const groupKey = normalizePhotoGroupName(record.StudyGroupName)
  const name = normalizePhotoStudentName([
    record.LastName,
    record.FirstName,
    record.MiddleName
  ].filter(Boolean).join(' '))
  if (!name) return null

  const candidatesByGroup = groupKey
    ? (studentsByGroupName.get(groupKey) || []).filter((student) => normalizePhotoStudentName(student.applicant) === name)
    : []
  const allNameCandidates = studentsByName.get(name) || []
  const xmlSpecialty = normalizePhotoSpecialty(record.SpecialityName)
  const matchesSpecialty = (student) => {
    if (!xmlSpecialty) return false
    const studentSpecialty = normalizePhotoSpecialty(student.group_specialty || student.specialty)
    return studentSpecialty && studentSpecialty === xmlSpecialty
  }
  const exactGroupAndSpecialty = candidatesByGroup.filter(matchesSpecialty)
  if (exactGroupAndSpecialty.length === 1) return exactGroupAndSpecialty[0]

  if (candidatesByGroup.length === 1) return candidatesByGroup[0]
  if (exactGroupAndSpecialty.length > 1) {
    const taxId = String(record.INN || '').replace(/\D/g, '')
    if (taxId) {
      const taxIdMatches = exactGroupAndSpecialty.filter((student) => getImportedApplicantTaxId(student) === taxId)
      if (taxIdMatches.length === 1) return taxIdMatches[0]
    }
    return null
  }

  const sameSpecialty = allNameCandidates.filter(matchesSpecialty)
  if (sameSpecialty.length === 1) return sameSpecialty[0]

  if (allNameCandidates.length === 1) return allNameCandidates[0]
  if (!allNameCandidates.length) return null

  const taxId = String(record.INN || '').replace(/\D/g, '')
  if (taxId) {
    const taxIdMatches = allNameCandidates.filter((student) => getImportedApplicantTaxId(student) === taxId)
    if (taxIdMatches.length === 1) return taxIdMatches[0]
  }

  return null
}

const importStudentPhotoArchive = async (uploadedFile, studentsByGroupName, studentsByName) => {
  const zip = await JSZip.loadAsync(uploadedFile.buffer)
  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  if (entries.length > 2500) throw new Error('В архіві забагато файлів')

  const xmlEntries = entries.filter((entry) => /\.xml$/i.test(entry.name))
  if (xmlEntries.length !== 1) throw new Error('В архіві має бути один XML-файл')

  const photoEntries = new Map()
  let totalUncompressedBytes = 0
  for (const entry of entries) {
    const uncompressedSize = entry._data?.uncompressedSize || 0
    totalUncompressedBytes += uncompressedSize
    if (uncompressedSize > 15 * 1024 * 1024 || totalUncompressedBytes > 250 * 1024 * 1024) {
      throw new Error('Розпакований вміст архіву завеликий')
    }

    const match = entry.name.replace(/\\/g, '/').match(/(?:^|\/)(\d+)-(\d+)\.(jpg|jpeg|png)$/i)
    if (match) photoEntries.set(match[2], { entry, extension: match[3].toLowerCase() })
  }

  const xml = await xmlEntries[0].async('string')
  const records = getArchiveStudentRecords(xml)
  if (!records.length) throw new Error('В XML архіву не знайдено записів студентів')

  const result = {
    filename: uploadedFile.originalname,
    records: records.length,
    matched: 0,
    unmatched: 0,
    missingPhotos: 0,
    unmatchedStudents: []
  }

  for (const record of records) {
    const personEducationId = String(record.PersonEducationId || '').trim()
    const photo = /^\d+$/.test(personEducationId) ? photoEntries.get(personEducationId) : null
    if (!photo) {
      result.missingPhotos += 1
      continue
    }

    const student = matchPhotoArchiveStudent(record, studentsByGroupName, studentsByName)
    if (!student) {
      const applicantName = [record.LastName, record.FirstName, record.MiddleName].filter(Boolean).join(' ').trim() || 'ПІБ відсутнє'
      const entry = {
        applicant: applicantName,
        group: String(record.StudyGroupName || '').trim()
      }
      if (!(studentsByName.get(normalizePhotoStudentName(applicantName)) || []).length) {
        continue
      } else {
        result.unmatched += 1
        result.unmatchedStudents.push(entry)
      }
      continue
    }

    const photoIdentity = getPhotoIdentity(student)
    if (!photoIdentity) {
      result.unmatched += 1
      result.unmatchedStudents.push({
        applicant: String(student.applicant || 'ПІБ відсутнє'),
        group: String(record.StudyGroupName || '').trim()
      })
      continue
    }

    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.query(
        `INSERT INTO group_applicant_photos (photo_identity, content_type, image_data, original_filename)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE content_type = VALUES(content_type), image_data = VALUES(image_data),
                                 original_filename = VALUES(original_filename)`,
        [
          photoIdentity,
          photo.extension === 'png' ? 'image/png' : 'image/jpeg',
          await photo.entry.async('nodebuffer'),
          path.basename(photo.entry.name.replace(/\\/g, '/')).slice(0, 255)
        ]
      )
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }

    result.matched += 1
  }

  return result
}

const getImportedDataFieldCount = (applicant) => Object.values(getApplicantImportedData(applicant))
  .filter((value) => value !== null && value !== undefined && String(value).trim() !== '').length

const mergeImportedValues = (fallback, preferred) => {
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

const mergeDuplicateApplicantData = (existing, incoming) => {
  const existingCount = getImportedDataFieldCount(existing)
  const incomingCount = getImportedDataFieldCount(incoming)
  const preferred = incomingCount > existingCount ? incoming : existing
  const other = preferred === existing ? incoming : existing

  const otherData = getApplicantImportedData(other)
  const preferredData = getApplicantImportedData(preferred)
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

const ACTIVE_STATUS_SQL = `(ga.id IS NOT NULL AND (ga.status IS NULL OR LOWER(TRIM(ga.status)) IN ('active', 'активний', 'активний студент', 'повернено з академвідпустки')))`
const ACADEMIC_STATUS_SQL = `LOWER(TRIM(ga.status)) = 'надано академвідпустку'`
const DISMISSED_STATUS_SQL = `LOWER(TRIM(ga.status)) = 'відрахований'`
const GROUP_APPLICANT_IDENTITY_SQL = `CASE
  WHEN NULLIF(TRIM(IFNULL(ga.applicant, '')), '') IS NOT NULL
    THEN CONCAT('name:', LOWER(TRIM(ga.applicant)), '|', LOWER(TRIM(IFNULL(ga.specialty, ''))))
  WHEN NULLIF(TRIM(IFNULL(ga.inp_number, '')), '') IS NOT NULL
    THEN CONCAT('inp:', LOWER(TRIM(ga.inp_number)))
  ELSE CONCAT('id:', ga.id)
END`

const groupStatisticsSelect = `
  COUNT(DISTINCT ${GROUP_APPLICANT_IDENTITY_SQL}) AS all_students_count,
  COUNT(DISTINCT ${GROUP_APPLICANT_IDENTITY_SQL}) AS applicant_count,
  COUNT(DISTINCT CASE WHEN ${ACTIVE_STATUS_SQL} THEN ${GROUP_APPLICANT_IDENTITY_SQL} END) AS active_students_count,
  COUNT(DISTINCT CASE WHEN ${ACADEMIC_STATUS_SQL} THEN ${GROUP_APPLICANT_IDENTITY_SQL} END) AS academic_leave_count,
  COUNT(DISTINCT CASE WHEN ${DISMISSED_STATUS_SQL} THEN ${GROUP_APPLICANT_IDENTITY_SQL} END) AS dismissed_count,
  COUNT(DISTINCT CASE WHEN LOWER(IFNULL(ga.funding_source, '')) LIKE '%бюджет%' THEN ${GROUP_APPLICANT_IDENTITY_SQL} END) AS budget_count,
  COUNT(DISTINCT CASE WHEN ${ACTIVE_STATUS_SQL} AND LOWER(IFNULL(ga.funding_source, '')) LIKE '%бюджет%' THEN ${GROUP_APPLICANT_IDENTITY_SQL} END) AS active_budget_count,
  COUNT(DISTINCT CASE WHEN LOWER(IFNULL(ga.funding_source, '')) LIKE '%контракт%' THEN ${GROUP_APPLICANT_IDENTITY_SQL} END) AS contract_count,
  COUNT(DISTINCT CASE WHEN ${ACTIVE_STATUS_SQL} AND LOWER(IFNULL(ga.funding_source, '')) LIKE '%контракт%' THEN ${GROUP_APPLICANT_IDENTITY_SQL} END) AS active_contract_count
`

const logApplicantAction = async ({ applicantId, applicantName, groupId, groupName, actionType, actionLabel, details = {} }) => {
  try {
    await pool.query(
      `INSERT INTO applicant_action_history (applicant_id, applicant_name, group_id, group_name, action_type, action_label, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        applicantId ?? null,
        applicantName || null,
        groupId ?? null,
        groupName || null,
        actionType || 'update',
        actionLabel || 'Змінено дані',
        JSON.stringify(details)
      ]
    )
  } catch (error) {
    console.error('ПОМИЛКА ЛОГУВАННЯ ДІЙ СТУДЕНТА:', error)
  }
}

const saveGroupApplicants = async (groupId, applicants) => {
  await pool.query(`DELETE FROM group_applicants WHERE group_id = ?`, [groupId])

  if (!applicants || applicants.length === 0) {
    return
  }

  const values = applicants.map((applicant) => [
    groupId,
    applicant.applicant || null,
    applicant.inp_number || null,
    applicant.funding_source || null,
    applicant.specialty || null,
    applicant.category_code || null,
    normalizeApplicantStatus(applicant.status || applicant.applicant_status),
    parseAcademicDate(applicant.academic_leave_from || applicant.date_from || applicant.from_date),
    parseAcademicDate(applicant.academic_leave_to || applicant.date_to || applicant.to_date),
    JSON.stringify(applicant.imported_data || {})
  ])

  await pool.query(
    `INSERT INTO group_applicants
     (group_id, applicant, inp_number, funding_source, specialty, category_code, status, academic_leave_from, academic_leave_to, imported_data)
     VALUES ?`,
    [values]
  )
}

const getGroupApplicantsById = async (groupId) => {
  const [rows] = await pool.query(
    `SELECT ga.id, ga.applicant, ga.inp_number, ga.funding_source, ga.specialty, ga.category_code,
            ga.status, ga.academic_leave_from, ga.academic_leave_to, ga.imported_data,
            sg.id AS group_id, sg.name AS group_name, sg.specialty AS group_specialty, sg.course
     FROM group_applicants ga
     LEFT JOIN student_groups sg ON sg.id = ga.group_id
     WHERE ga.group_id = ?
     ORDER BY ga.applicant`,
    [groupId]
  )

  const allowedRows = deduplicateApplicantRows(rows.filter((row) => {
    const specialty = String(row.specialty || '').trim()
    return !specialty || isAllowedImportSpecialty(specialty)
  }))
  return attachStudentPhotoUrls(allowedRows)
}


// ============================================
// Отримати всі групи
// ============================================

export async function getGroups(req, res) {
  try {
    await ensureGroupApplicantsTable()
    await pruneDisallowedGroups()
    await pruneDisallowedApplicants()

    const [rows] = await pool.query(`
      SELECT
        sg.id,
        sg.name,
        sg.specialty,
        sg.course,
        sg.students_count,
        sg.class_teacher_id,
        MAX(t.full_name) AS class_teacher_name,
        ${groupStatisticsSelect}
      FROM student_groups sg
      LEFT JOIN group_applicants ga ON ga.group_id = sg.id
      LEFT JOIN teachers t ON t.id = sg.class_teacher_id
      GROUP BY sg.id
      ORDER BY sg.course, sg.name
    `)

    res.json(rows)

  } catch (error) {

    console.error('ПОМИЛКА ОТРИМАННЯ ГРУП:')

    console.error(error)

    res.status(500).json({
      message: error.message,
      code: error.code
    })

  }
}

export async function getSpecialtySummaries(req, res) {
  try {
    await ensureGroupApplicantsTable()
    await pruneDisallowedGroups()
    await pruneDisallowedApplicants()

    const [rows] = await pool.query(`
      SELECT
        ga.id,
        ga.applicant,
        ga.inp_number,
        ga.funding_source,
        ga.status,
        COALESCE(NULLIF(TRIM(ga.specialty), ''), TRIM(sg.specialty), 'Інші') AS specialty,
        ga.group_id
      FROM group_applicants ga
      LEFT JOIN student_groups sg ON sg.id = ga.group_id
      WHERE ga.group_id IS NULL OR sg.id IS NOT NULL
      ORDER BY ga.id
    `)

    const uniqueApplicants = deduplicateSummaryApplicants(rows.filter(
      (row) => !row.specialty || isAllowedImportSpecialty(row.specialty)
    ))

    const summaryBySpecialty = new Map()
    for (const applicant of uniqueApplicants) {
      const specialty = applicant.specialty || 'Інші'
      const summary = summaryBySpecialty.get(specialty) || {
        specialty,
        students_count: 0,
        active_students_count: 0,
        academic_leave_count: 0,
        dismissed_count: 0,
        budget_count: 0,
        active_budget_count: 0,
        contract_count: 0,
        active_contract_count: 0
      }
      const status = String(applicant.status || '').trim().toLowerCase()
      const fundingSource = String(applicant.funding_source || '').toLowerCase()
      const isActive = !status || ['active', 'активний', 'активний студент', 'повернено з академвідпустки'].includes(status)
      const isBudget = fundingSource.includes('бюджет')
      const isContract = fundingSource.includes('контракт')

      summary.students_count += 1
      if (isActive) summary.active_students_count += 1
      if (status === 'надано академвідпустку') summary.academic_leave_count += 1
      if (status === 'відрахований') summary.dismissed_count += 1
      if (isBudget) summary.budget_count += 1
      if (isActive && isBudget) summary.active_budget_count += 1
      if (isContract) summary.contract_count += 1
      if (isActive && isContract) summary.active_contract_count += 1

      summaryBySpecialty.set(specialty, summary)
    }

    res.json([...summaryBySpecialty.values()].sort((a, b) => String(a.specialty).localeCompare(String(b.specialty), 'uk')))
  } catch (error) {
    console.error('ПОМИЛКА ОТРИМАННЯ ПІДСУМКІВ СПЕЦІАЛЬНОСТЕЙ:')
    console.error(error)
    res.status(500).json({
      message: error.message,
      code: error.code
    })
  }
}


// ============================================
// Створити групу
// ============================================

export async function createGroup(req, res) {
  try {

    const {
      name,
      specialty,
      course,
      students_count
    } = req.body


    // Перевірка назви групи

    if (!name || !name.trim()) {

      return res.status(400).json({
        message: 'Назва групи є обовʼязковою'
      })

    }


    const [result] = await pool.query(
      `
      INSERT INTO student_groups
        (
          name,
          specialty,
          course,
          students_count
        )
      VALUES (?, ?, ?, ?)
      `,
      [
        name.trim(),
        specialty || null,
        course || null,
        students_count || 0
      ]
    )


    // Отримуємо створену групу

    const [rows] = await pool.query(
      `
      SELECT
        id,
        name,
        specialty,
        course,
        students_count
      FROM student_groups
      WHERE id = ?
      `,
      [result.insertId]
    )


    res.status(201).json(rows[0])

  } catch (error) {

    console.error('ПОМИЛКА СТВОРЕННЯ ГРУПИ:')

    console.error(error)

    res.status(500).json({
      message: error.message,
      code: error.code
    })

  }
}

// ============================================
// Імпорт груп з CSV
// ============================================

export async function importGroups(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        message: 'Файл CSV не передано'
      })
    }

    await ensureGroupApplicantsTable()
    await pruneDisallowedGroups()
    await pruneDisallowedApplicants()

    const isXlsx = (req.file.originalname && /\.xlsx?$/i.test(req.file.originalname)) ||
      (req.file.mimetype && /spreadsheet|excel|sheet/i.test(req.file.mimetype)) ||
      (req.file.buffer && req.file.buffer.slice(0, 2).toString() === 'PK')

    let rows = []
    if (isXlsx) {
      rows = parseXlsxRows(req.file.buffer)
    } else {
      const csvText = decodeBufferToText(req.file.buffer)
      rows = parseCsvRows(csvText)
    }

    if (rows.length === 0) {
      return res.status(400).json({
        message: 'У файлі CSV не знайдено жодної строки'
      })
    }

    const isApplicantImport = rows.some((row) => row.applicant || row.funding_source)
    const applicantRows = rows.filter((row) => row?.applicant || row?.funding_source)
    const applicantsWithImportedDetails = applicantRows.filter((row) => {
      const fields = row.imported_data?.student_fields
      return fields && Object.values(fields).some((value) => String(value || '').trim() !== '')
    }).length

    let inserted = 0
    let updated = 0
    let groupApplicants = {}

    if (isApplicantImport) {
      const normalizeSpecialty = (s) => String(s || '').replace(/^F\d+\s+/i, '').trim()

      const groupsByKey = new Map()
      const ungroupedApplicants = []

      for (const row of rows) {
        const rawGroup = String(row.group || '').trim()
        const rawSpecialty = String(row.specialty || '').trim()

        if (rawSpecialty && !isAllowedImportSpecialty(rawSpecialty)) {
          continue
        }

        const courseVal = row.course || null

        const applicant = {
          applicant: row.applicant || '',
          inp_number: row.inp_number || '',
          funding_source: row.funding_source || '',
          specialty: rawSpecialty || '',
          category_code: row.category_code || '',
          status: normalizeApplicantStatus(row.status),
          academic_leave_from: row.academic_leave_from || null,
          academic_leave_to: row.academic_leave_to || null,
          imported_data: row.imported_data || {}
        }

        if (!rawGroup) {
          ungroupedApplicants.push(applicant)
          continue
        }

        // key: prefer explicit group name, otherwise group by normalized specialty+course
        const key = rawGroup
          ? `name:${rawGroup}`
          : `spec:${normalizeSpecialty(rawSpecialty)}|course:${courseVal || ''}`

        if (!groupsByKey.has(key)) {
          groupsByKey.set(key, {
            explicitName: rawGroup || null,
            specialty: rawSpecialty || null,
            course: courseVal || null,
            applicants: []
          })
        }

        groupsByKey.get(key).applicants.push(applicant)
      }

      const uniqueUngroupedApplicants = new Map()
      for (const applicant of ungroupedApplicants) {
        const identityKey = getApplicantIdentityKey(applicant)
        if (identityKey) {
          uniqueUngroupedApplicants.set(identityKey, applicant)
        } else {
          uniqueUngroupedApplicants.set(`row:${uniqueUngroupedApplicants.size}`, applicant)
        }
      }

      for (const applicant of uniqueUngroupedApplicants.values()) {
        const inpNumber = applicant.inp_number || null
        const [existing] = await pool.query(
          `SELECT ga.id FROM group_applicants ga
           LEFT JOIN student_groups sg ON sg.id = ga.group_id
           WHERE (ga.group_id IS NULL OR ga.group_id = 0 OR sg.id IS NULL)
             AND (
               (? IS NOT NULL AND LOWER(TRIM(IFNULL(ga.inp_number, ''))) = LOWER(TRIM(?)))
               OR (
                 ? <> ''
                 AND LOWER(TRIM(IFNULL(ga.applicant, ''))) = LOWER(TRIM(?))
                 AND LOWER(TRIM(IFNULL(ga.specialty, ''))) = LOWER(TRIM(?))
                 AND LOWER(TRIM(IFNULL(ga.funding_source, ''))) = LOWER(TRIM(?))
               )
             )
           ORDER BY ga.id
           LIMIT 1`,
          [
            inpNumber,
            inpNumber,
            String(applicant.applicant || '').trim(),
            String(applicant.applicant || '').trim(),
            String(applicant.specialty || '').trim(),
            String(applicant.funding_source || '').trim()
          ]
        )

        const values = [
          inpNumber,
          applicant.applicant || null,
          applicant.funding_source || null,
          applicant.specialty || null,
          applicant.category_code || null,
          applicant.status || 'active',
          applicant.academic_leave_from || null,
          applicant.academic_leave_to || null,
          JSON.stringify(applicant.imported_data || {})
        ]

        if (existing.length) {
          await pool.query(
            `UPDATE group_applicants
             SET inp_number = ?, applicant = ?, funding_source = ?, specialty = ?,
                 category_code = ?, status = ?, academic_leave_from = ?, academic_leave_to = ?, imported_data = ?
             WHERE id = ?`,
            [...values, existing[0].id]
          )
        } else {
          await pool.query(
            `INSERT INTO group_applicants
             (group_id, inp_number, applicant, funding_source, specialty, category_code, status, academic_leave_from, academic_leave_to, imported_data)
             VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            values
          )
        }
      }

      for (const [key, groupData] of groupsByKey) {
        const groupName = groupData.explicitName
        groupData.applicants = deduplicateApplicants(groupData.applicants)
        const studentsCount = groupData.applicants.length


        let groupId = null

        // 1) try exact group name match
        if (groupName) {
          const [existing] = await pool.query(`SELECT id FROM student_groups WHERE name = ? LIMIT 1`, [groupName])
          if (existing.length > 0) groupId = existing[0].id
        }

        // 2) try to find by specialty + course (exact), then specialty LIKE, then name LIKE
        if (!groupId) {
          const spec = normalizeSpecialty(groupData.specialty)
          const courseVal = groupData.course || null

          if (spec) {
            if (courseVal) {
              const [found1] = await pool.query(
                `SELECT id FROM student_groups WHERE specialty = ? AND course = ? LIMIT 1`,
                [spec, courseVal]
              )
              if (found1.length > 0) groupId = found1[0].id
            }

            if (!groupId) {
              const [found2] = await pool.query(
                `SELECT id FROM student_groups WHERE specialty LIKE ? ${courseVal ? 'AND course = ?' : ''} LIMIT 1`,
                courseVal ? [`%${spec}%`, courseVal] : [`%${spec}%`]
              )
              if (found2.length > 0) groupId = found2[0].id
            }

            if (!groupId) {
              const [found3] = await pool.query(
                `SELECT id FROM student_groups WHERE name LIKE ? LIMIT 1`,
                [`%${spec}%`]
              )
              if (found3.length > 0) groupId = found3[0].id
            }
          }
        }

        // create group if still not found
        if (!groupId) {
          const newName = groupName || `${groupData.specialty || 'Група'} ${groupData.course || ''}`.trim()
          const [result] = await pool.query(
            `INSERT INTO student_groups (name, specialty, course, students_count) VALUES (?, ?, ?, ?)`,
            [newName, groupData.specialty, groupData.course || null, studentsCount]
          )
          groupId = result.insertId
          inserted += 1
        } else {
          // update existing group's specialty and students_count
          await pool.query(
            `UPDATE student_groups SET specialty = ?, students_count = ? WHERE id = ?`,
            [groupData.specialty, studentsCount, groupId]
          )
          updated += 1
        }

        await saveGroupApplicants(groupId, groupData.applicants)
        await removeImportedUngroupedDuplicates(groupData.applicants)
        groupApplicants[groupId] = groupData.applicants
      }
    } else {
      for (const group of rows) {
        const [existing] = await pool.query(
          `
          SELECT id
          FROM student_groups
          WHERE name = ?
          LIMIT 1
          `,
          [group.group]
        )

        if (existing.length > 0) {
          await pool.query(
            `
            UPDATE student_groups
            SET specialty = ?, course = ?, students_count = ?
            WHERE id = ?
            `,
            [group.specialty, group.course, group.students_count, existing[0].id]
          )

          updated += 1
        } else {
          await pool.query(
            `
            INSERT INTO student_groups
              (name, specialty, course, students_count)
            VALUES (?, ?, ?, ?)
            `,
            [group.group, group.specialty, group.course, group.students_count]
          )

          inserted += 1
        }
      }
    }

    const [groups] = await pool.query(
      `
      SELECT
        sg.id,
        sg.name,
        sg.specialty,
        sg.course,
        sg.students_count,
        ${groupStatisticsSelect}
      FROM student_groups sg
      LEFT JOIN group_applicants ga ON ga.group_id = sg.id
      GROUP BY sg.id
      ORDER BY sg.name
      `
    )

    res.json({
      message: 'Імпорт CSV завершено',
      inserted,
      updated,
      total: groups.length,
      groups,
      groupApplicants,
      importedApplicants: applicantRows.length,
      applicantsWithImportedDetails
    })
  } catch (error) {
    console.error('ПОМИЛКА ІМПОРТУ CSV:')
    console.error(error)
    res.status(500).json({
      message: 'Не вдалося імпортувати CSV',
      code: error.code
    })
  }
}

export async function getGroupApplicants(req, res) {
  try {
    const groupId = Number(req.params.id)
    if (!groupId) {
      return res.status(400).json({
        message: 'Невірний ідентифікатор групи'
      })
    }

    await ensureGroupApplicantsTable()
    const applicants = await getGroupApplicantsById(groupId)

    res.json(applicants)
  } catch (error) {
    console.error('ПОМИЛКА ОТРИМАННЯ ЗАЯВНИКІВ ГРУПИ:')
    console.error(error)
    res.status(500).json({
      message: 'Не вдалося отримати заявників групи',
      code: error.code
    })
  }
}

export async function getUngroupedApplicants(req, res) {
  try {
    await ensureGroupApplicantsTable()
    await pruneDisallowedApplicants()

    const [rows] = await pool.query(`
      SELECT ga.id, ga.applicant, ga.inp_number, ga.funding_source, ga.specialty, ga.category_code, ga.status,
             ga.imported_data,
             ga.academic_leave_from, ga.academic_leave_to, ga.group_id,
             sg.name AS group_name, sg.specialty AS group_specialty, sg.course
      FROM group_applicants ga
      LEFT JOIN student_groups sg ON sg.id = ga.group_id
      WHERE ga.group_id IS NULL
         OR ga.group_id = 0
         OR sg.id IS NULL
      ORDER BY ga.applicant, ga.id
    `)

    const [assignedRows] = await pool.query(`
      SELECT ga.id, ga.applicant, ga.inp_number, ga.specialty
      FROM group_applicants ga
      JOIN student_groups sg ON sg.id = ga.group_id
      WHERE ga.group_id IS NOT NULL
    `)
    const assignedIdentities = new Set(assignedRows.flatMap(getApplicantRosterIdentityKeys))
    const eligibleRows = rows.filter((row) => {
      const specialty = String(row.specialty || '').trim()
      return !specialty || isAllowedImportSpecialty(specialty)
    }).filter(row => !getApplicantRosterIdentityKeys(row).some(key => assignedIdentities.has(key)))

    res.json(await attachStudentPhotoUrls(deduplicateApplicantRows(eligibleRows)))
  } catch (error) {
    console.error('ПОМИЛКА ОТРИМАННЯ СТУДЕНТІВ БЕЗ ГРУПИ:')
    console.error(error)
    res.status(500).json({
      message: 'Не вдалося отримати студентів без групи',
      code: error.code
    })
  }
}

export async function importStudentPhotos(req, res) {
  try {
    if (!req.files?.length) {
      return res.status(400).json({ message: 'Оберіть один або кілька ZIP-архівів' })
    }

    await ensureGroupApplicantsTable()

    const [students] = await pool.query(`
      SELECT ga.id, ga.applicant, ga.specialty, ga.imported_data,
             sg.name AS group_name, sg.specialty AS group_specialty
      FROM group_applicants ga
      INNER JOIN student_groups sg ON sg.id = ga.group_id
    `)
    const studentsByGroupName = new Map()
    const studentsByName = new Map()
    for (const student of students) {
      const groupKey = normalizePhotoGroupName(student.group_name)
      if (!groupKey || !isAllowedImportSpecialty(student.group_specialty)) continue
      const studentName = normalizePhotoStudentName(student.applicant)
      if (studentName) {
        const nameStudents = studentsByName.get(studentName) || []
        nameStudents.push(student)
        studentsByName.set(studentName, nameStudents)
      }
      const groupStudents = studentsByGroupName.get(groupKey) || []
      groupStudents.push(student)
      studentsByGroupName.set(groupKey, groupStudents)
    }

    const archives = []
    for (const file of req.files) {
      try {
        archives.push(await importStudentPhotoArchive(file, studentsByGroupName, studentsByName))
      } catch (error) {
        console.error(`ПОМИЛКА ІМПОРТУ ФОТО З АРХІВУ "${file.originalname}":`, error)
        archives.push({
          filename: file.originalname,
          error: error.message || 'Не вдалося обробити архів'
        })
      }
    }

    const successfulArchives = archives.filter((archive) => !archive.error)
    const failedArchives = archives.filter((archive) => archive.error)
    if (!successfulArchives.length) {
      return res.status(422).json({
        message: 'Не вдалося обробити жоден архів',
        archives
      })
    }

    res.json({
      message: 'Імпорт фото завершено',
      matched: successfulArchives.reduce((total, archive) => total + archive.matched, 0),
      unmatched: successfulArchives.reduce((total, archive) => total + archive.unmatched, 0),
      missingPhotos: successfulArchives.reduce((total, archive) => total + archive.missingPhotos, 0),
      unmatchedStudents: successfulArchives.flatMap((archive) => archive.unmatchedStudents),
      archives,
      failedArchives: failedArchives.length
    })
  } catch (error) {
    console.error('ПОМИЛКА ІМПОРТУ ФОТО СТУДЕНТІВ:', error)
    res.status(500).json({
      message: 'Не вдалося імпортувати фото студентів',
      code: error.code
    })
  }
}

const normalizeContactHeader = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '')

const getContactHeaderIndexes = (headers) => {
  const normalized = headers.map(normalizeContactHeader)
  const findIndex = (predicate) => normalized.findIndex(predicate)
  const isParentHeader = (header) =>
    header.includes('батьк') || header.includes('опікун') || header.includes('родител') ||
    header.includes('parent') || header.includes('guardian')
  const findHeader = (predicate) => normalized.findIndex(predicate)
  const studentName = findIndex((header) =>
    header.includes('здобувач') ||
    header.includes('пібстудента') ||
    header.includes('пібздобувача') ||
    header.includes('фиостудента') ||
    header.includes('studentname') ||
    header === 'піб' ||
    header === 'фио'
  )
  const lastName = findIndex((header) => ['прізвище', 'фамилия', 'lastname', 'surname'].includes(header))
  const firstName = findIndex((header) => ['імя', 'имя', 'firstname', 'name'].includes(header))
  const middleName = findIndex((header) => ['побатькові', 'отчество', 'middlename', 'patronymic'].includes(header))
  const homeAddress = findHeader((header) =>
    header.includes('адрес') || header.includes('address') || header.includes('домашня') ||
    header.includes('місцепроживання') || header.includes('местопроживания')
  )
  const studentPhone = findHeader((header) =>
    (header.includes('мобільн') || header.includes('телефон')) && !isParentHeader(header)
  )
  const telegram = findHeader((header) => header.includes('телеграм') || header.includes('telegram'))
  const email = findHeader((header) => header.includes('електроннапошта') || header.includes('email') || header.includes('e-mail'))
  const location = findHeader((header) =>
    header.startsWith('місцезнаходження') || header.startsWith('местонахождение')
  )
  const locationDetails = findHeader((header) =>
    header.includes('вказатиде') || header.includes('країнамісто') || header.includes('странугород')
  )
  const benefitCategory = findHeader((header) =>
    header.includes('пільговакатегор') || header.includes('льготнаякатегор')
  )
  const classTeacher = findHeader((header) =>
    header.includes('класнийкерівник') || header.includes('пібкласногокерівника') ||
    header.includes('классныйруководитель') ||
    header.includes('кураторгрупи') || header.includes('кураторгруппы')
  )
  const parentsContact = findIndex((header) =>
    isParentHeader(header) &&
    (header.includes('контакти') || header.includes('телефон') || header.includes('phone'))
  )
  const parentName = findIndex((header) =>
    isParentHeader(header) &&
    (header.includes('піб') || header.includes('фио') || header.includes('прізвищ') || header.includes('імя') || header.includes('name')) &&
    !header.includes('телефон') && !header.includes('phone') && !header.includes('контакти')
  )
  const motherName = findHeader((header) => header.includes('пібматері') || header.includes('пібматери'))
  const motherContacts = findHeader((header) => header.includes('контактиматері') || header.includes('контактиматери'))
  const fatherName = findHeader((header) => header.includes('піббатька') || header.includes('піботікуна2'))
  const fatherContacts = findHeader((header) => header.includes('контактибатька') || header.includes('контактиотікуна2'))
  const parentPhone = findIndex((header) =>
    isParentHeader(header) && (header.includes('телефон') || header.includes('phone'))
  )
  const group = findIndex((header) => header === 'група' || header === 'учебнаягруппа' || header === 'group')
  const specialty = findIndex((header) => header.includes('спеціальн') || header.includes('специальн') || header === 'specialty')
  const taxId = findIndex((header) => ['рнокпп', 'инн', 'taxidentificationnumber'].includes(header))

  return {
    studentName, lastName, firstName, middleName, homeAddress, studentPhone,
    telegram, email, location, locationDetails, benefitCategory,
    classTeacher, parentName, parentPhone, parentsContact, motherName, motherContacts,
    fatherName, fatherContacts, group, specialty, taxId
  }
}

const getContactSheetClassTeacher = (rows, headerRowIndex, teacherColumnIndex) => {
  if (teacherColumnIndex !== -1) {
    const teacherFromColumn = rows.slice(headerRowIndex + 1)
      .map((row) => String(row?.[teacherColumnIndex] || '').trim())
      .find(Boolean)
    if (teacherFromColumn) return teacherFromColumn
  }

  const labelPattern = /(?:піб\s+класного\s+керівника|класний\s+керівник|классный\s+руководитель|куратор\s+груп(?:и|пы))/i
  for (const row of rows.slice(0, headerRowIndex)) {
    const cells = (row || []).map((value) => String(value || '').trim())
    const labelIndex = cells.findIndex((cell) => labelPattern.test(cell))
    if (labelIndex === -1) continue
    const labelCell = cells[labelIndex]
    const inlineName = labelCell.match(/(?:піб\s+класного\s+керівника|класний\s+керівник|классный\s+руководитель|куратор\s+груп(?:и|пы))\s*[:\-]\s*(.+)$/i)?.[1]
    const adjacentName = cells.slice(labelIndex + 1).find(Boolean)
    if (inlineName?.trim()) return inlineName.trim()
    if (adjacentName) return adjacentName
  }

  return ''
}

const getContactStudentName = (cells, indexes) => {
  if (indexes.studentName !== -1) return String(cells[indexes.studentName] || '').trim()
  return [indexes.lastName, indexes.firstName, indexes.middleName]
    .filter((index) => index !== -1)
    .map((index) => String(cells[index] || '').trim())
    .filter(Boolean)
    .join(' ')
}

export async function importStudentContacts(req, res) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: 'Оберіть Excel-файл із контактними даними' })
    }
    if (!/\.xlsx?$/i.test(req.file.originalname || '')) {
      return res.status(400).json({ message: 'Контактні дані потрібно завантажити у форматі .xlsx або .xls' })
    }

    await ensureGroupApplicantsTable()
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
    const sheetImports = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) return null
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
      const headerRowIndex = rows.findIndex((row) => {
        const candidate = getContactHeaderIndexes((row || []).map((value) => String(value || '').trim()))
        const hasName = candidate.studentName !== -1 ||
          (candidate.lastName !== -1 && candidate.firstName !== -1)
        return hasName && (
          candidate.benefitCategory !== -1 || candidate.homeAddress !== -1 ||
          candidate.parentsContact !== -1 || candidate.studentPhone !== -1 ||
          candidate.telegram !== -1 || candidate.email !== -1
        )
      })
      if (headerRowIndex === -1) return null

      const headers = rows[headerRowIndex].map((value) => String(value || '').trim())
      const indexes = getContactHeaderIndexes(headers)
      const groupTitleRow = rows.slice(0, headerRowIndex).find((row) =>
        normalizeContactHeader(row?.[0]) === 'група' && String(row?.[1] || '').trim()
      )
      const groupName = String(groupTitleRow?.[1] || sheetName).trim()
      const classTeacherName = getContactSheetClassTeacher(rows, headerRowIndex, indexes.classTeacher)
      return { sheetName, rows, headerRowIndex, indexes, groupName, classTeacherName }
    }).filter(Boolean)
    if (!sheetImports.length) {
      return res.status(400).json({ message: 'Не знайдено аркушів із заголовками ПІБ та контактних даних студентів' })
    }

    const [students] = await pool.query(`
      SELECT ga.id, ga.applicant, ga.specialty, ga.imported_data,
             sg.name AS group_name, sg.specialty AS group_specialty
      FROM group_applicants ga
      LEFT JOIN student_groups sg ON sg.id = ga.group_id
      WHERE ga.applicant IS NOT NULL AND TRIM(ga.applicant) <> ''
    `)
    const studentsByName = new Map()
    for (const student of students) {
      const name = normalizePhotoStudentName(student.applicant)
      if (!name) continue
      const matches = studentsByName.get(name) || []
      matches.push(student)
      studentsByName.set(name, matches)
    }

    const [teachers] = await pool.query('SELECT id, full_name FROM teachers')
    const [groups] = await pool.query('SELECT id, name FROM student_groups')
    const teacherByName = new Map()
    for (const teacher of teachers) {
      const key = normalizePhotoStudentName(teacher.full_name)
      const matches = teacherByName.get(key) || []
      matches.push(teacher)
      teacherByName.set(key, matches)
    }
    const groupByName = new Map(groups.map((group) => [
      normalizePhotoGroupName(group.name),
      group
    ]))
    const result = {
      filename: req.file.originalname,
      matched: 0,
      unmatched: 0,
      unmatchedStudents: [],
      linkedClassTeachers: 0,
      classTeacherWarnings: []
    }
    for (const sheetData of sheetImports) {
      const { sheetName, rows, headerRowIndex, indexes, groupName, classTeacherName } = sheetData
      const group = groupByName.get(normalizePhotoGroupName(groupName))
      if (!classTeacherName) {
        result.classTeacherWarnings.push(`${sheetName}: у файлі не вказано класного керівника`)
      } else if (!group) {
        result.classTeacherWarnings.push(`${sheetName}: групу «${groupName}» не знайдено в базі`)
      } else {
        const teacherMatches = teacherByName.get(normalizePhotoStudentName(classTeacherName)) || []
        if (!teacherMatches.length) {
          result.classTeacherWarnings.push(`${sheetName}: викладача «${classTeacherName}» не знайдено в базі`)
        } else if (teacherMatches.length > 1) {
          result.classTeacherWarnings.push(`${sheetName}: знайдено кількох викладачів «${classTeacherName}»`)
        } else {
          const [teacher] = teacherMatches
          await pool.query(
            'UPDATE student_groups SET class_teacher_id = ? WHERE id = ?',
            [teacher.id, group.id]
          )
          result.linkedClassTeachers += 1
        }
      }

      for (const row of rows.slice(headerRowIndex + 1)) {
        const cells = (row || []).map((value) => String(value ?? '').trim())
        const applicantName = getContactStudentName(cells, indexes)
        if (!applicantName) continue

        let candidates = studentsByName.get(normalizePhotoStudentName(applicantName)) || []
        if (!candidates.length) continue

        const groupNameInRow = indexes.group !== -1 ? cells[indexes.group] : ''
        const matchingGroupName = groupNameInRow || groupName
        if (matchingGroupName) {
          const groupKey = normalizePhotoGroupName(matchingGroupName)
          candidates = candidates.filter((student) => normalizePhotoGroupName(student.group_name) === groupKey)
        }
        if (indexes.specialty !== -1 && cells[indexes.specialty]) {
          const specialty = normalizePhotoSpecialty(cells[indexes.specialty])
          const specialtyMatches = candidates.filter((student) =>
            normalizePhotoSpecialty(student.group_specialty || student.specialty) === specialty
          )
          if (specialtyMatches.length) candidates = specialtyMatches
        }
        if (indexes.taxId !== -1 && cells[indexes.taxId]) {
          const taxId = cells[indexes.taxId].replace(/\D/g, '')
          candidates = candidates.filter((student) => getImportedApplicantTaxId(student) === taxId)
        }

        if (candidates.length !== 1) {
          result.unmatched += 1
          result.unmatchedStudents.push({
            applicant: applicantName,
            group: groupName,
            reason: candidates.length ? 'Знайдено кілька студентів з таким ПІБ у групі' : 'Студента не знайдено у вказаній групі'
          })
          continue
        }

        const student = candidates[0]
        const contactIdentity = getPhotoIdentity(student)
        if (!contactIdentity) {
          result.unmatched += 1
          result.unmatchedStudents.push({ applicant: applicantName, group: groupName, reason: 'Не вдалося визначити групу або спеціальність' })
          continue
        }

        const cellValue = (index) => index === -1 ? '' : cells[index]
        const contacts = {
          benefit_category: cellValue(indexes.benefitCategory),
          telegram: cellValue(indexes.telegram),
          student_phone: cellValue(indexes.studentPhone),
          email: cellValue(indexes.email),
          home_address: cellValue(indexes.homeAddress),
          location: cellValue(indexes.location),
          location_details: cellValue(indexes.locationDetails),
          mother_name: cellValue(indexes.motherName),
          mother_contacts: cellValue(indexes.motherContacts),
          father_name: cellValue(indexes.fatherName),
          father_contacts: cellValue(indexes.fatherContacts),
          parent_name: cellValue(indexes.parentName),
          parent_phone: cellValue(indexes.parentPhone),
          parents_contact: cellValue(indexes.parentsContact)
        }
        await pool.query(
          `INSERT INTO group_applicant_contacts (contact_identity, contact_data)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE contact_data = VALUES(contact_data)`,
          [contactIdentity, JSON.stringify(contacts)]
        )
        result.matched += 1
      }
    }

    res.json({
      message: 'Імпорт контактів завершено',
      matched: result.matched,
      unmatched: result.unmatched,
      unmatchedStudents: result.unmatchedStudents,
      linkedClassTeachers: result.linkedClassTeachers,
      classTeacherWarnings: result.classTeacherWarnings,
      file: result.filename
    })
  } catch (error) {
    console.error('ПОМИЛКА ІМПОРТУ КОНТАКТІВ СТУДЕНТІВ:', error)
    res.status(500).json({ message: 'Не вдалося імпортувати контакти студентів', code: error.code })
  }
}

export async function getApplicantPhoto(req, res) {
  try {
    const applicantId = Number(req.params.applicantId)
    if (!Number.isInteger(applicantId) || applicantId <= 0) {
      return res.status(400).json({ message: 'Невірний ідентифікатор студента' })
    }

    await ensureGroupApplicantsTable()
    const [manualPhotos] = await pool.query(
      `SELECT photo_content_type AS content_type, photo_data AS image_data
       FROM group_applicant_manual_data
       WHERE applicant_id = ? AND photo_data IS NOT NULL LIMIT 1`,
      [applicantId]
    )
    if (manualPhotos.length) {
      res.set('Content-Type', manualPhotos[0].content_type)
      res.set('Cache-Control', 'private, max-age=300')
      res.set('X-Content-Type-Options', 'nosniff')
      return res.send(manualPhotos[0].image_data)
    }

    const [students] = await pool.query(
      `SELECT ga.id, ga.applicant, ga.specialty, ga.imported_data,
              sg.name AS group_name, sg.specialty AS group_specialty
       FROM group_applicants ga
       LEFT JOIN student_groups sg ON sg.id = ga.group_id
       WHERE ga.id = ? LIMIT 1`,
      [applicantId]
    )
    if (!students.length) return res.status(404).json({ message: 'Студента не знайдено' })

    const photoIdentity = getPhotoIdentity(students[0])
    if (!photoIdentity) return res.status(404).json({ message: 'Для цього студента фото не збережено' })

    const [photos] = await pool.query(
      `SELECT content_type, image_data FROM group_applicant_photos WHERE photo_identity = ? LIMIT 1`,
      [photoIdentity]
    )
    if (!photos.length) return res.status(404).json({ message: 'Для цього студента фото не збережено' })

    res.set('Content-Type', photos[0].content_type)
    res.set('Cache-Control', 'private, max-age=300')
    res.set('X-Content-Type-Options', 'nosniff')
    res.send(photos[0].image_data)
  } catch (error) {
    console.error('ПОМИЛКА ОТРИМАННЯ ФОТО СТУДЕНТА:', error)
    res.status(500).json({ message: 'Не вдалося отримати фото студента', code: error.code })
  }
}

const MANUAL_CONTACT_FIELDS = [
  'telegram',
  'student_phone',
  'email',
  'home_address',
  'location',
  'mother_name',
  'mother_contacts',
  'father_name',
  'father_contacts'
]

export async function updateApplicantManualDetails(req, res) {
  try {
    const applicantId = Number(req.params.applicantId)
    if (!Number.isInteger(applicantId) || applicantId <= 0) {
      return res.status(400).json({ message: 'Невірний ідентифікатор студента' })
    }

    await ensureGroupApplicantsTable()
    const contacts = req.body?.contacts
    const benefitCategory = req.body?.benefit_category
    if (!contacts || typeof contacts !== 'object' || Array.isArray(contacts) ||
        typeof benefitCategory !== 'string') {
      return res.status(400).json({ message: 'Передайте контакти та пільгову категорію студента' })
    }

    const [students] = await pool.query('SELECT id FROM group_applicants WHERE id = ? LIMIT 1', [applicantId])
    if (!students.length) return res.status(404).json({ message: 'Студента не знайдено' })

    const [existingRows] = await pool.query(
      'SELECT contact_data FROM group_applicant_manual_data WHERE applicant_id = ? LIMIT 1',
      [applicantId]
    )
    const existingContacts = existingRows.length
      ? (typeof existingRows[0].contact_data === 'string'
          ? JSON.parse(existingRows[0].contact_data)
          : existingRows[0].contact_data)
      : {}
    const nextContacts = { ...existingContacts }
    for (const field of MANUAL_CONTACT_FIELDS) {
      if (typeof contacts[field] !== 'string') {
        return res.status(400).json({ message: `Невірне значення поля ${field}` })
      }
      if (contacts[field].length > 2000) {
        return res.status(400).json({ message: `Значення поля ${field} завелике` })
      }
      nextContacts[field] = contacts[field].trim()
    }
    if (benefitCategory.length > 255) {
      return res.status(400).json({ message: 'Пільгова категорія завелика' })
    }

    await pool.query(
      `INSERT INTO group_applicant_manual_data
         (applicant_id, contact_data, benefit_category, benefit_category_set)
       VALUES (?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE contact_data = VALUES(contact_data),
                               benefit_category = VALUES(benefit_category),
                               benefit_category_set = TRUE`,
      [applicantId, JSON.stringify(nextContacts), benefitCategory.trim() || null]
    )

    res.json({ message: 'Контактні дані студента збережено' })
  } catch (error) {
    console.error('ПОМИЛКА ЗБЕРЕЖЕННЯ РУЧНИХ ДАНИХ СТУДЕНТА:', error)
    res.status(500).json({ message: 'Не вдалося зберегти контактні дані студента', code: error.code })
  }
}

export async function uploadApplicantManualPhoto(req, res) {
  try {
    const applicantId = Number(req.params.applicantId)
    if (!Number.isInteger(applicantId) || applicantId <= 0) {
      return res.status(400).json({ message: 'Невірний ідентифікатор студента' })
    }
    if (!req.file?.buffer) return res.status(400).json({ message: 'Оберіть файл фото' })
    const imageBuffer = req.file.buffer
    const validImage = (req.file.mimetype === 'image/jpeg' && imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff) ||
      (req.file.mimetype === 'image/png' && imageBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
      (req.file.mimetype === 'image/webp' && imageBuffer.toString('ascii', 0, 4) === 'RIFF' && imageBuffer.toString('ascii', 8, 12) === 'WEBP')
    if (!validImage) return res.status(400).json({ message: 'Файл не є коректним фото у форматі JPG, PNG або WEBP' })

    await ensureGroupApplicantsTable()
    const [students] = await pool.query('SELECT id FROM group_applicants WHERE id = ? LIMIT 1', [applicantId])
    if (!students.length) return res.status(404).json({ message: 'Студента не знайдено' })

    await pool.query(
      `INSERT INTO group_applicant_manual_data
         (applicant_id, contact_data, photo_content_type, photo_data, photo_filename)
       VALUES (?, JSON_OBJECT(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE photo_content_type = VALUES(photo_content_type),
                               photo_data = VALUES(photo_data),
                               photo_filename = VALUES(photo_filename)`,
      [
        applicantId,
        req.file.mimetype,
        req.file.buffer,
        path.basename(req.file.originalname).slice(0, 255)
      ]
    )

    res.json({
      message: 'Фото студента збережено в базі даних',
      photo_url: `/groups/applicants/${applicantId}/photo?v=${Date.now()}`
    })
  } catch (error) {
    console.error('ПОМИЛКА ЗБЕРЕЖЕННЯ РУЧНОГО ФОТО СТУДЕНТА:', error)
    res.status(500).json({ message: 'Не вдалося зберегти фото студента', code: error.code })
  }
}

export async function deleteGroupApplicant(req, res) {
  try {
    const groupId = Number(req.params.groupId)
    const applicantId = Number(req.params.applicantId)

    if (!groupId || !applicantId) {
      return res.status(400).json({
        message: 'Невірний ідентифікатор групи або заявника'
      })
    }

    const [existing] = await pool.query(
      `SELECT id, applicant FROM group_applicants WHERE id = ? AND group_id = ?`,
      [applicantId, groupId]
    )

    if (existing.length === 0) {
      return res.status(404).json({
        message: 'Заявника не знайдено'
      })
    }

    const [groupRows] = await pool.query(`SELECT name FROM student_groups WHERE id = ? LIMIT 1`, [groupId])
    await pool.query(`DELETE FROM group_applicants WHERE id = ?`, [applicantId])
    await pool.query(`UPDATE student_groups SET students_count = GREATEST(students_count - 1, 0) WHERE id = ?`, [groupId])
    await logApplicantAction({
      applicantId,
      applicantName: existing[0].applicant,
      groupId,
      groupName: groupRows[0]?.name || 'Без групи',
      actionType: 'delete',
      actionLabel: 'Видалено зі складу групи'
    })

    const applicants = await getGroupApplicantsById(groupId)
    res.json({ message: 'Заявника видалено', applicants })
  } catch (error) {
    console.error('ПОМИЛКА ВИДАЛЕННЯ ЗАЯВНИКА:')
    console.error(error)
    res.status(500).json({
      message: 'Не вдалося видалити заявника',
      code: error.code
    })
  }
}

export async function updateGroupApplicant(req, res) {
  try {
    const groupId = Number(req.params.groupId)
    const applicantId = Number(req.params.applicantId)

    if (!groupId || !applicantId) {
      return res.status(400).json({ message: 'Невірний ідентифікатор заявника' })
    }

    const {
      applicant,
      funding_source,
      specialty,
      category_code,
      status,
      academic_leave_from,
      academic_leave_to,
      group_id
    } = req.body || {}

    const targetGroupId = Number(group_id || groupId)

    const [existing] = await pool.query(
      `SELECT id, group_id, applicant, funding_source, specialty, category_code, status, academic_leave_from, academic_leave_to
       FROM group_applicants WHERE id = ?`,
      [applicantId]
    )

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Заявника не знайдено' })
    }

    const previous = existing[0]
    const currentGroupId = previous.group_id
    const effectiveGroupId = targetGroupId || Number(currentGroupId || groupId)

    if (!applicant || !String(applicant).trim()) {
      return res.status(400).json({ message: 'ПІБ студента є обовʼязковим' })
    }

    const nextStatus = normalizeApplicantStatus(status)
    const nextFundingSource = funding_source || previous.funding_source || null
    const nextSpecialty = specialty || previous.specialty || null
    const nextCategoryCode = category_code || previous.category_code || null
    const nextFrom = parseAcademicDate(academic_leave_from) || previous.academic_leave_from || null
    const nextTo = parseAcademicDate(academic_leave_to) || previous.academic_leave_to || null

    await pool.query(
      `UPDATE group_applicants
       SET applicant = ?,
           funding_source = ?,
           specialty = ?,
           category_code = ?,
           status = ?,
           academic_leave_from = ?,
           academic_leave_to = ?,
           group_id = ?
       WHERE id = ?`,
      [
        String(applicant).trim(),
        nextFundingSource,
        nextSpecialty,
        nextCategoryCode,
        nextStatus,
        nextFrom,
        nextTo,
        effectiveGroupId,
        applicantId
      ]
    )

    const [groupRows] = await pool.query(`SELECT name FROM student_groups WHERE id = ? LIMIT 1`, [effectiveGroupId])
    const groupName = groupRows[0]?.name || 'Без групи'

    if (previous.funding_source !== nextFundingSource) {
      await logApplicantAction({
        applicantId,
        applicantName: String(applicant).trim(),
        groupId: effectiveGroupId,
        groupName,
        actionType: 'funding_change',
        actionLabel: 'Змінено джерело фінансування',
        details: {
          previous: previous.funding_source || '—',
          next: nextFundingSource || '—'
        }
      })
    }

    if (previous.status !== nextStatus) {
      await logApplicantAction({
        applicantId,
        applicantName: String(applicant).trim(),
        groupId: effectiveGroupId,
        groupName,
        actionType: 'status_change',
        actionLabel: nextStatus,
        details: {
          previous: previous.status || 'active',
          next: nextStatus
        }
      })
    }

    if (previous.group_id !== effectiveGroupId) {
      const [previousGroupRows] = previous.group_id
        ? await pool.query(`SELECT name FROM student_groups WHERE id = ? LIMIT 1`, [previous.group_id])
        : [[]]
      await logApplicantAction({
        applicantId,
        applicantName: String(applicant).trim(),
        groupId: effectiveGroupId,
        groupName,
        actionType: 'group_transfer',
        actionLabel: 'Переведено до іншої групи',
        details: {
          previousGroupId: previous.group_id || null,
          previousGroupName: previousGroupRows[0]?.name || 'Без групи',
          nextGroupId: effectiveGroupId
        }
      })
    }

    const [rows] = await pool.query(
      `SELECT id, applicant, funding_source, specialty, category_code, status, academic_leave_from, academic_leave_to, group_id
       FROM group_applicants WHERE id = ?`,
      [applicantId]
    )

    res.json(rows[0] || { message: 'Заявника оновлено' })
  } catch (error) {
    console.error('ПОМИЛКА ОНОВЛЕННЯ ЗАЯВНИКА:')
    console.error(error)
    res.status(500).json({ message: 'Не вдалося оновити студента', code: error.code })
  }
}

export async function searchApplicantByName(req, res) {
  try {
    await ensureGroupApplicantsTable()
    const query = String(req.query.q || '').trim()
    if (!query) {
      return res.json([])
    }

    const [rows] = await pool.query(
      `SELECT ga.id, ga.applicant, ga.inp_number, ga.funding_source, ga.specialty, ga.category_code, ga.status,
              ga.imported_data, ga.academic_leave_from, ga.academic_leave_to,
              sg.id AS group_id, sg.name AS group_name, sg.specialty AS group_specialty, sg.course
       FROM group_applicants ga
       LEFT JOIN student_groups sg ON sg.id = ga.group_id
       WHERE LOWER(ga.applicant) LIKE ?
       ORDER BY ga.applicant
       LIMIT 50`,
      [`%${query.toLowerCase()}%`]
    )

    res.json(await attachStudentPhotoUrls(deduplicateApplicantRows(rows)))
  } catch (error) {
    console.error('ПОМИЛКА ПОШУКУ ЗА ПІБ:')
    console.error(error)
    res.status(500).json({ message: 'Не вдалося виконати пошук', code: error.code })
  }
}

export async function getApplicantActionHistory(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, applicant_id, applicant_name, group_id, group_name, action_type, action_label, details, created_at
      FROM applicant_action_history
      ORDER BY created_at DESC
      LIMIT 200
    `)

    res.json(rows.map((row) => ({
      ...row,
      details: row.details ? JSON.parse(row.details) : {}
    })))
  } catch (error) {
    console.error('ПОМИЛКА ОТРИМАННЯ ІСТОРІЇ ДІЙ:')
    console.error(error)
    res.status(500).json({ message: 'Не вдалося завантажити історію дій', code: error.code })
  }
}

export async function restoreApplicantToGroup(req, res) {
  try {
    const {
      applicantId,
      groupId,
      applicant,
      funding_source,
      specialty,
      category_code,
      status,
      academic_leave_from,
      academic_leave_to
    } = req.body || {}

    if (!groupId) {
      return res.status(400).json({ message: 'Група для поновлення є обовʼязковою' })
    }

    const targetGroup = await pool.query(`SELECT id, name FROM student_groups WHERE id = ? LIMIT 1`, [groupId])
    if (!targetGroup[0] || targetGroup[0].length === 0) {
      return res.status(404).json({ message: 'Цільову групу не знайдено' })
    }

    const groupName = targetGroup[0][0]?.name || 'Без групи'
    const nextStatus = normalizeApplicantStatus(status)
    const nextFrom = parseAcademicDate(academic_leave_from)
    const nextTo = parseAcademicDate(academic_leave_to)

    if (applicantId) {
      const [existingApplicant] = await pool.query(
        `SELECT applicant, group_id, status FROM group_applicants WHERE id = ? LIMIT 1`,
        [Number(applicantId)]
      )

      await pool.query(
        `UPDATE group_applicants
         SET group_id = ?, applicant = ?, funding_source = ?, specialty = ?, category_code = ?, status = ?, academic_leave_from = ?, academic_leave_to = ?
         WHERE id = ?`,
        [
          Number(groupId),
          applicant || null,
          funding_source || null,
          specialty || null,
          category_code || null,
          nextStatus,
          nextFrom,
          nextTo,
          Number(applicantId)
        ]
      )

      const applicantName = String(applicant || existingApplicant[0]?.applicant || '').trim()
      await logApplicantAction({
        applicantId: Number(applicantId),
        applicantName,
        groupId: Number(groupId),
        groupName,
        actionType: 'restore',
        actionLabel: 'Повернено до групи',
        details: {
          previousStatus: existingApplicant[0]?.status || 'active',
          nextStatus,
          previousGroupId: existingApplicant[0]?.group_id || null,
          nextGroupId: Number(groupId)
        }
      })

      res.json({ message: 'Студента поновлено в групу' })
      return
    }

    if (!applicant || !String(applicant).trim()) {
      return res.status(400).json({ message: 'ПІБ студента є обовʼязковим' })
    }

    const [result] = await pool.query(
      `INSERT INTO group_applicants (group_id, applicant, funding_source, specialty, category_code, status, academic_leave_from, academic_leave_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(groupId),
        String(applicant).trim(),
        funding_source || null,
        specialty || null,
        category_code || null,
        nextStatus,
        nextFrom,
        nextTo
      ]
    )

    await logApplicantAction({
      applicantId: result.insertId,
      applicantName: String(applicant).trim(),
      groupId: Number(groupId),
      groupName,
      actionType: 'restore',
      actionLabel: 'Повернено до групи',
      details: { nextStatus }
    })

    res.status(201).json({ message: 'Студента додано до групи' })
  } catch (error) {
    console.error('ПОМИЛКА ПОНОВЛЕННЯ СТУДЕНТА:')
    console.error(error)
    res.status(500).json({ message: 'Не вдалося поновити студента', code: error.code })
  }
}

// ============================================
// Редагувати групу
// ============================================

export async function updateGroup(req, res) {
  try {

    const { id } = req.params


    const {
      name,
      specialty,
      course,
      students_count,
      class_teacher_id
    } = req.body


    // Перевірка назви

    if (!name || !name.trim()) {

      return res.status(400).json({
        message: 'Назва групи є обовʼязковою'
      })

    }

    await ensureGroupApplicantsTable()
    const [existingGroups] = await pool.query(
      'SELECT id, class_teacher_id FROM student_groups WHERE id = ? LIMIT 1',
      [id]
    )
    if (!existingGroups.length) {
      return res.status(404).json({ message: 'Групу не знайдено' })
    }

    let nextClassTeacherId = existingGroups[0].class_teacher_id
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'class_teacher_id')) {
      const rawTeacherId = String(class_teacher_id ?? '').trim()
      if (!rawTeacherId) {
        nextClassTeacherId = null
      } else {
        nextClassTeacherId = Number(rawTeacherId)
        if (!Number.isInteger(nextClassTeacherId) || nextClassTeacherId <= 0) {
          return res.status(400).json({ message: 'Невірний класний керівник' })
        }
        const [teachers] = await pool.query(
          'SELECT id FROM teachers WHERE id = ? LIMIT 1',
          [nextClassTeacherId]
        )
        if (!teachers.length) return res.status(400).json({ message: 'Обраного викладача не знайдено' })
      }
    }

    await pool.query(
      `
      UPDATE student_groups
      SET
        name = ?,
        specialty = ?,
        course = ?,
        students_count = ?,
        class_teacher_id = ?
      WHERE id = ?
      `,
      [
        name.trim(),
        specialty || null,
        course || null,
        students_count || 0,
        nextClassTeacherId,
        id
      ]
    )


    // Отримуємо оновлену групу

    const [rows] = await pool.query(
      `
      SELECT
        id,
        name,
        specialty,
        course,
        students_count,
        class_teacher_id,
        (SELECT full_name FROM teachers WHERE id = class_teacher_id) AS class_teacher_name
      FROM student_groups
      WHERE id = ?
      `,
      [id]
    )


    if (rows.length === 0) {

      return res.status(404).json({
        message: 'Групу не знайдено'
      })

    }


    res.json(rows[0])

  } catch (error) {

    console.error('ПОМИЛКА РЕДАГУВАННЯ ГРУПИ:')

    console.error(error)

    res.status(500).json({
      message: error.message,
      code: error.code
    })

  }
}


// ============================================
// Видалити групу
// ============================================

export async function deleteGroup(req, res) {
  try {

    const { id } = req.params


    // Перевіряємо, чи існує група

    const [existing] = await pool.query(
      `
      SELECT id
      FROM student_groups
      WHERE id = ?
      `,
      [id]
    )


    if (existing.length === 0) {

      return res.status(404).json({
        message: 'Групу не знайдено'
      })

    }


    await pool.query(
      `
      DELETE FROM student_groups
      WHERE id = ?
      `,
      [id]
    )


    res.json({
      message: 'Групу успішно видалено'
    })

  } catch (error) {

    console.error('ПОМИЛКА ВИДАЛЕННЯ ГРУПИ:')

    console.error(error)

    res.status(500).json({
      message: error.message,
      code: error.code
    })

  }
}

const parseXlsxRows = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })

  if (!rows || rows.length === 0) return []

  const rawHeaders = (rows[0] || []).map((cell) => String(cell || '').trim())
  const headerCells = rawHeaders.map((cell) => cell.toLowerCase().replace(/\s+/g, ' ').trim())

  const headerIndex = buildHeaderIndex(headerCells)

  if (!('group' in headerIndex) && headerCells.length > 0) headerIndex.group = 0
  if (!('specialty' in headerIndex) && headerCells.length > 1) headerIndex.specialty = 1

  const result = []
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r]
    if (!Array.isArray(row)) continue

    const values = {
      group: String(row[headerIndex.group] || '').trim(),
      specialty: String(row[headerIndex.specialty] || '').trim(),
      applicant: String(row[headerIndex.applicant] || '').trim(),
      funding_source: String(row[headerIndex.funding_source] || '').trim(),
      category_code: String(row[headerIndex.category_code] || '').trim(),
      status: String(row[headerIndex.status] || '').trim(),
      academic_leave_from: String(row[headerIndex.academic_leave_from] || '').trim(),
      academic_leave_to: String(row[headerIndex.academic_leave_to] || '').trim(),
      course: String(row[headerIndex.course] || '').trim(),
      students_count: String(row[headerIndex.students_count] || '').trim(),
      imported_data: getImportedStudentData(rawHeaders, row)
    }

    if (!values.group && !values.applicant) continue
    if (values.specialty && !isAllowedImportSpecialty(values.specialty)) continue

    const course = values.course === '' ? null : Number(values.course.toString().replace(',', '.'))
    const students_count = values.students_count === '' ? 0 : Number(values.students_count.toString().replace(',', '.'))

    result.push({
      group: values.group || null,
      specialty: values.specialty || null,
      applicant: values.applicant || null,
      funding_source: values.funding_source || null,
      category_code: values.category_code || null,
      status: normalizeApplicantStatus(values.status),
      academic_leave_from: parseAcademicDate(values.academic_leave_from),
      academic_leave_to: parseAcademicDate(values.academic_leave_to),
      course: Number.isFinite(course) ? course : null,
      students_count: Number.isFinite(students_count) ? students_count : 0,
      imported_data: values.imported_data
    })
  }

  return result
}

// ============================================
// Попередній перегляд імпорту (header + перші рядки)
// ============================================
export async function previewImport(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'Файл не передано' })
    }

    const isXlsx = (req.file.originalname && /\.xlsx?$/i.test(req.file.originalname)) ||
      (req.file.mimetype && /spreadsheet|excel|sheet/i.test(req.file.mimetype)) ||
      (req.file.buffer && req.file.buffer.slice(0, 2).toString() === 'PK')

    const normalizeHeader = normalizeImportHeader

    let headerCells = []
    let parsedRows = []

    if (isXlsx) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
      headerCells = (rows[0] || []).map((c) => String(c || ''))
      parsedRows = parseXlsxRows(req.file.buffer)
    } else {
      const text = decodeBufferToText(req.file.buffer)
      const headerLine = text.split(/\r?\n/)[0] || ''
      const delimiter = headerLine.includes(';') && !headerLine.includes(',') ? ';' : ','
      headerCells = parseCsvLine(headerLine, delimiter)
      parsedRows = parseCsvRows(text)
    }

    const mapping = {}
    headerCells.forEach((h, i) => {
      const key = normalizeHeader(h)
      if (key && mapping[key] === undefined) mapping[key] = i
    })

    res.json({ headerCells, mapping, previewRows: parsedRows.slice(0, 10) })
  } catch (error) {
    console.error('ПОМИЛКА PREVIEW IMPORT:')
    console.error(error)
    res.status(500).json({ message: 'Не вдалося отримати превью файлу', code: error.code })
  }
}

const decodeBufferToText = (buffer) => {
  // try utf8 first
  let text = buffer.toString('utf8')

  const hasReplacement = /\uFFFD|�/.test(text)
  const hasCyrillic = /[\u0400-\u04FF]/.test(text)

  if (!hasCyrillic || hasReplacement) {
    try {
      const cpText = iconv.decode(buffer, 'win1251')
      // if cpText looks better (has cyrillic and fewer replacement chars), use it
      const cpHasReplacement = /\uFFFD|�/.test(cpText)
      const cpHasCyrillic = /[\u0400-\u04FF]/.test(cpText)
      if (cpHasCyrillic && !cpHasReplacement) {
        return cpText
      }
    } catch (e) {
      // ignore and fallback to utf8
    }
  }

  return text
}

async function getApplicantsByStatus(status, res) {
  await ensureGroupApplicantsTable()
  const statusCondition = status === 'academic'
    ? ACADEMIC_STATUS_SQL
    : DISMISSED_STATUS_SQL
  const [rows] = await pool.query(`
    SELECT ga.id, ga.applicant, ga.inp_number, ga.funding_source, ga.specialty, ga.imported_data,
           ga.category_code, ga.status, ga.academic_leave_from, ga.academic_leave_to,
           ga.group_id, sg.name AS group_name, sg.specialty AS group_specialty, sg.course
    FROM group_applicants ga
    LEFT JOIN student_groups sg ON sg.id = ga.group_id
    WHERE ${statusCondition}
    ORDER BY ga.applicant
  `)
  const allowedRows = rows.filter((row) => {
    const specialty = String(row.specialty || '').trim()
    return !specialty || isAllowedImportSpecialty(specialty)
  })
  return attachStudentPhotoUrls(deduplicateApplicantRows(allowedRows))
}

export async function getAcademicLeaveApplicants(req, res) {
  try {
    res.json(await getApplicantsByStatus('academic', res))
  } catch (error) {
    console.error('ПОМИЛКА ОТРИМАННЯ СТУДЕНТІВ В АКАДЕМВІДПУСТЦІ:', error)
    res.status(500).json({ message: 'Не вдалося отримати студентів в академвідпустці', code: error.code })
  }
}

export async function getDismissedApplicants(req, res) {
  try {
    res.json(await getApplicantsByStatus('dismissed', res))
  } catch (error) {
    console.error('ПОМИЛКА ОТРИМАННЯ ВІДРАХОВАНИХ СТУДЕНТІВ:', error)
    res.status(500).json({ message: 'Не вдалося отримати відрахованих студентів', code: error.code })
  }
}