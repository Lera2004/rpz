import pool from '../config/database.js'
import XLSX from 'xlsx'
import iconv from 'iconv-lite'

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

const normalizeImportSpecialty = (value) => String(value || '').replace(/\s+/g, ' ').trim()

const isAllowedImportSpecialty = (value) => {
  const text = normalizeImportSpecialty(value).toLowerCase()

  if (!text) {
    return false
  }

  const compact = text.replace(/[^a-zа-яїієґ0-9]/g, '')

  const hasSoftwareEngineering = compact.includes('інженеріяпрограмногозабезпечення') || compact.includes('softwareengineering')
  const is121 = compact.includes('121')
  const isF2 = compact.includes('f2')

  return (hasSoftwareEngineering && (is121 || isF2))
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
  const headerCells = parseCsvLine(headerLine, delimiter).map((cell) => cell.toLowerCase().replace(/\s+/g, ' ').trim())

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
      students_count: String(cells[headerIndex.students_count] || '').trim()
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
      students_count: Number.isFinite(students_count) ? students_count : 0
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

const ACTIVE_STATUS_SQL = `(ga.id IS NOT NULL AND (ga.status IS NULL OR LOWER(TRIM(ga.status)) IN ('active', 'активний', 'активний студент', 'повернено з академвідпустки')))`
const ACADEMIC_STATUS_SQL = `LOWER(TRIM(ga.status)) = 'надано академвідпустку'`
const DISMISSED_STATUS_SQL = `LOWER(TRIM(ga.status)) = 'відрахований'`

const groupStatisticsSelect = `
  COUNT(ga.id) AS all_students_count,
  COUNT(ga.id) AS applicant_count,
  SUM(CASE WHEN ${ACTIVE_STATUS_SQL} THEN 1 ELSE 0 END) AS active_students_count,
  SUM(CASE WHEN ${ACADEMIC_STATUS_SQL} THEN 1 ELSE 0 END) AS academic_leave_count,
  SUM(CASE WHEN ${DISMISSED_STATUS_SQL} THEN 1 ELSE 0 END) AS dismissed_count,
  SUM(CASE WHEN LOWER(IFNULL(ga.funding_source, '')) LIKE '%бюджет%' THEN 1 ELSE 0 END) AS budget_count,
  SUM(CASE WHEN ${ACTIVE_STATUS_SQL} AND LOWER(IFNULL(ga.funding_source, '')) LIKE '%бюджет%' THEN 1 ELSE 0 END) AS active_budget_count,
  SUM(CASE WHEN LOWER(IFNULL(ga.funding_source, '')) LIKE '%контракт%' THEN 1 ELSE 0 END) AS contract_count,
  SUM(CASE WHEN ${ACTIVE_STATUS_SQL} AND LOWER(IFNULL(ga.funding_source, '')) LIKE '%контракт%' THEN 1 ELSE 0 END) AS active_contract_count
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
    parseAcademicDate(applicant.academic_leave_to || applicant.date_to || applicant.to_date)
  ])

  await pool.query(
    `INSERT INTO group_applicants (group_id, applicant, inp_number, funding_source, specialty, category_code, status, academic_leave_from, academic_leave_to) VALUES ?`,
    [values]
  )
}

const getGroupApplicantsById = async (groupId) => {
  const [rows] = await pool.query(
    `SELECT id, applicant, inp_number, funding_source, specialty, category_code, status, academic_leave_from, academic_leave_to FROM group_applicants WHERE group_id = ? ORDER BY applicant`,
    [groupId]
  )

  return rows.filter((row) => {
    const specialty = String(row.specialty || '').trim()
    return !specialty || isAllowedImportSpecialty(specialty)
  })
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
        ${groupStatisticsSelect}
      FROM student_groups sg
      LEFT JOIN group_applicants ga ON ga.group_id = sg.id
      GROUP BY sg.id
      ORDER BY sg.name
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
        COALESCE(NULLIF(TRIM(ga.specialty), ''), TRIM(sg.specialty), 'Інші') AS specialty,
        COUNT(*) AS students_count,
        SUM(CASE WHEN ${ACTIVE_STATUS_SQL} THEN 1 ELSE 0 END) AS active_students_count,
        SUM(CASE WHEN ${ACADEMIC_STATUS_SQL} THEN 1 ELSE 0 END) AS academic_leave_count,
        SUM(CASE WHEN ${DISMISSED_STATUS_SQL} THEN 1 ELSE 0 END) AS dismissed_count,
        SUM(CASE WHEN LOWER(IFNULL(ga.funding_source, '')) LIKE '%бюджет%' THEN 1 ELSE 0 END) AS budget_count,
        SUM(CASE WHEN ${ACTIVE_STATUS_SQL} AND LOWER(IFNULL(ga.funding_source, '')) LIKE '%бюджет%' THEN 1 ELSE 0 END) AS active_budget_count,
        SUM(CASE WHEN LOWER(IFNULL(ga.funding_source, '')) LIKE '%контракт%' THEN 1 ELSE 0 END) AS contract_count,
        SUM(CASE WHEN ${ACTIVE_STATUS_SQL} AND LOWER(IFNULL(ga.funding_source, '')) LIKE '%контракт%' THEN 1 ELSE 0 END) AS active_contract_count
      FROM group_applicants ga
      LEFT JOIN student_groups sg ON sg.id = ga.group_id
      WHERE ga.group_id IS NULL OR sg.id IS NOT NULL
      GROUP BY COALESCE(NULLIF(TRIM(ga.specialty), ''), TRIM(sg.specialty), 'Інші')
      ORDER BY specialty
    `)

    res.json(rows.filter((row) => !row.specialty || isAllowedImportSpecialty(row.specialty)))
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
          academic_leave_to: row.academic_leave_to || null
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

      for (const applicant of ungroupedApplicants) {
        await pool.query(
          `INSERT INTO group_applicants (group_id, applicant, funding_source, specialty, category_code, status, academic_leave_from, academic_leave_to)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            null,
            applicant.applicant || null,
            applicant.funding_source || null,
            applicant.specialty || null,
            applicant.category_code || null,
            applicant.status || 'active',
            applicant.academic_leave_from || null,
            applicant.academic_leave_to || null
          ]
        )
      }

      for (const [key, groupData] of groupsByKey) {
        const groupName = groupData.explicitName
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
      groupApplicants
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
      SELECT ga.id, ga.applicant, ga.funding_source, ga.specialty, ga.category_code, ga.status,
             ga.academic_leave_from, ga.academic_leave_to, ga.group_id,
             sg.name AS group_name
      FROM group_applicants ga
      LEFT JOIN student_groups sg ON sg.id = ga.group_id
      WHERE ga.group_id IS NULL
         OR ga.group_id = 0
         OR sg.id IS NULL
      ORDER BY ga.applicant
    `)

    res.json(rows.filter((row) => {
      const specialty = String(row.specialty || '').trim()
      return !specialty || isAllowedImportSpecialty(specialty)
    }))
  } catch (error) {
    console.error('ПОМИЛКА ОТРИМАННЯ СТУДЕНТІВ БЕЗ ГРУПИ:')
    console.error(error)
    res.status(500).json({
      message: 'Не вдалося отримати студентів без групи',
      code: error.code
    })
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
      `SELECT id FROM group_applicants WHERE id = ? AND group_id = ?`,
      [applicantId, groupId]
    )

    if (existing.length === 0) {
      return res.status(404).json({
        message: 'Заявника не знайдено'
      })
    }

    await pool.query(`DELETE FROM group_applicants WHERE id = ?`, [applicantId])
    await pool.query(`UPDATE student_groups SET students_count = GREATEST(students_count - 1, 0) WHERE id = ?`, [groupId])

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
      await logApplicantAction({
        applicantId,
        applicantName: String(applicant).trim(),
        groupId: effectiveGroupId,
        groupName,
        actionType: 'group_transfer',
        actionLabel: 'Переведено до іншої групи',
        details: {
          previousGroupId: previous.group_id || null,
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
    const query = String(req.query.q || '').trim()
    if (!query) {
      return res.json([])
    }

    const [rows] = await pool.query(
      `SELECT ga.id, ga.applicant, ga.funding_source, ga.specialty, ga.category_code, ga.status,
              ga.academic_leave_from, ga.academic_leave_to, sg.id AS group_id, sg.name AS group_name
       FROM group_applicants ga
       JOIN student_groups sg ON sg.id = ga.group_id
       WHERE LOWER(ga.applicant) LIKE ?
       ORDER BY ga.applicant
       LIMIT 50`,
      [`%${query.toLowerCase()}%`]
    )

    res.json(rows)
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
      students_count
    } = req.body


    // Перевірка назви

    if (!name || !name.trim()) {

      return res.status(400).json({
        message: 'Назва групи є обовʼязковою'
      })

    }


    await pool.query(
      `
      UPDATE student_groups
      SET
        name = ?,
        specialty = ?,
        course = ?,
        students_count = ?
      WHERE id = ?
      `,
      [
        name.trim(),
        specialty || null,
        course || null,
        students_count || 0,
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
        students_count
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

  const headerCells = (rows[0] || []).map((cell) => String(cell || '').toLowerCase().replace(/\s+/g, ' ').trim())

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
      students_count: String(row[headerIndex.students_count] || '').trim()
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
      students_count: Number.isFinite(students_count) ? students_count : 0
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
    SELECT ga.id, ga.applicant, ga.inp_number, ga.funding_source, ga.specialty,
           ga.category_code, ga.status, ga.academic_leave_from, ga.academic_leave_to,
           ga.group_id, sg.name AS group_name, sg.course
    FROM group_applicants ga
    LEFT JOIN student_groups sg ON sg.id = ga.group_id
    WHERE ${statusCondition}
    ORDER BY ga.applicant
  `)
  return rows.filter((row) => {
    const specialty = String(row.specialty || '').trim()
    return !specialty || isAllowedImportSpecialty(specialty)
  })
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