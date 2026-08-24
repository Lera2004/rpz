import XLSX from 'xlsx'
import pool from '../config/database.js'

const DAYS = ['ПОНЕДІЛОК', 'ВІВТОРОК', 'СЕРЕДА', 'ЧЕТВЕР', "П'ЯТНИЦЯ", 'СУБОТА', 'НЕДІЛЯ']
const SPECIALTY_PATTERN = /^РПЗ\s+\d{2}\s+\d+\/\d+$/i

function normalizeText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim().replace(/\s+/g, ' ')
}

function normalizeDay(value) {
  return String(value ?? '')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function detectDay(value) {
  const text = normalizeDay(value)
  if (!text) return null

  if (text.includes('ПОНЕДІЛОК')) return 'ПОНЕДІЛОК'
  if (text.includes('ВІВТОРОК')) return 'ВІВТОРОК'
  if (text.includes('СЕРЕДА')) return 'СЕРЕДА'
  if (text.includes('ЧЕТВЕР')) return 'ЧЕТВЕР'
  if (text.includes('СУБОТА')) return 'СУБОТА'
  if (text.includes('НЕДІЛЯ')) return 'НЕДІЛЯ'

  if (
    text.includes("П'ЯТНИЦЯ") ||
    text.includes('ПЯТНИЦЯ') ||
    text.includes('ПЯТНИЦА') ||
    text.includes('ПЯТНИЦ') ||
    text.includes("П'ЯТН") ||
    text.includes('ПЯТН')
  ) {
    return "П'ЯТНИЦЯ"
  }

  return null
}

function normalizeTeacherText(value) {
  let text = normalizeText(value)
  if (!text) return []
  const parts = text
    .replace(/\s*(?:,|;|\/|\||&)\s*/g, ' | ')
    .replace(/\s{2,}/g, ' | ')
    .replace(/\s+(?=[А-ЯІЇЄҐA-Z][а-яіїєґ'-]+\s+[А-ЯІЇЄҐA-Z]\.?)/gu, ' | ')
    .split('|')
    .map((part) => normalizeText(part))
    .filter(Boolean)

  return parts
    .map((teacher) => {
      const match = teacher.match(/^([А-ЯІЇЄҐA-Z][а-яіїєґ'-]+)\s+(.+)$/u)
      if (!match) return teacher
      const initials = match[2].replace(/[^А-ЯІЇЄҐA-Z]/g, '').split('').join('.')
      return initials ? `${match[1]} ${initials}.` : match[1]
    })
    .filter(Boolean)
    .filter((teacher, index, array) => array.indexOf(teacher) === index)
}

function detectWeekType(value) {
  const text = normalizeText(value).toLowerCase()
  if (!text) return 'all'
  if (/(числ\.?|чисельник)/i.test(text)) return 'numerator'
  if (/(знам\.?|знаменник)/i.test(text)) return 'denominator'
  return 'all'
}

const INDEXED_COLORS = {
  6: 'FFCC00',
  10: '92D050'
}

function normalizeColor(value) {
  const color = normalizeText(value).replace(/^#/, '').toUpperCase()
  if (!color) return ''
  if (color.length === 6) return color
  if (color.length === 8) return color.slice(-6)
  return ''
}

function getCellFillColor(cell) {
  const style = cell?.s || {}
  const fill = style.fill || style
  const foreground = fill?.fgColor || fill?.fg || {}
  const rgb = normalizeColor(foreground.rgb || foreground.RGB)
  if (rgb) return { source: 'rgb', value: rgb }

  const indexed = Number(foreground.indexed)
  if (Number.isInteger(indexed) && INDEXED_COLORS[indexed]) {
    return { source: 'indexed', value: INDEXED_COLORS[indexed] }
  }

  const theme = Number(foreground.theme)
  if (Number.isInteger(theme)) return { source: 'theme', value: `THEME:${theme}` }
  return { source: '', value: '' }
}

function detectWeekTypeFromCell(cell) {
  const color = getCellFillColor(cell)
  const rgb = normalizeColor(color.value)
  if (rgb) {
    const red = Number.parseInt(rgb.slice(0, 2), 16)
    const green = Number.parseInt(rgb.slice(2, 4), 16)
    const blue = Number.parseInt(rgb.slice(4, 6), 16)

    if (green > red * 1.15 && green > blue * 1.2 && green >= 100) return 'numerator'
    if (red >= 180 && green >= 130 && blue < 130 && Math.abs(red - green) < 110) return 'denominator'
  }
  return 'all'
}

function detectWeekTypeForRow(subject, teacher, room, roomCell) {
  return [subject, teacher, room]
    .map((value) => detectWeekType(value))
    .find((weekType) => weekType !== 'all') || 'all'
}

function getGroupFamily(groupName) {
  return normalizeText(groupName).replace(/\s+(?:1\/9|2\/9)$/i, '')
}

function splitAlternatives(value) {
  const text = normalizeText(value)
  if (!text) return []

  const parts = text
    .split(/\s*\/\s*|\s*\|\s*/g)
    .map((part) => normalizeText(part))
    .filter(Boolean)

  if (parts.length <= 1) {
    return [{ text, weekType: detectWeekType(text) }]
  }

  return parts.map((part) => ({
    text: part,
    weekType: detectWeekType(part)
  }))
}

function pickVariantByWeekType(value, weekType) {
  const parts = splitAlternatives(value)
  if (!parts.length) return ''

  const exact = parts.find((part) => part.weekType === weekType)
  if (exact) return exact.text

  const general = parts.find((part) => part.weekType === 'all')
  if (general) return general.text

  return parts[0].text
}

function expandWeekVariants(subject, teacher, room, weekText) {
  const combined = [subject, teacher, room, weekText].map((value) => normalizeText(value)).join(' ')
  const hasWeekMarker = /(числ|чисельник|знам|знаменник)/i.test(combined)
  const hasAlternatives = [subject, teacher, room].some((value) => splitAlternatives(value).length > 1)

  if (!hasWeekMarker && !hasAlternatives) {
    return [{
      subject: normalizeText(subject),
      teacher: normalizeText(teacher),
      room: normalizeText(room),
      weekType: detectWeekType(weekText)
    }]
  }

  const weekTypes = ['numerator', 'denominator']
  return weekTypes
    .map((weekType) => ({
      subject: pickVariantByWeekType(subject, weekType),
      teacher: pickVariantByWeekType(teacher, weekType),
      room: pickVariantByWeekType(room, weekType),
      weekType
    }))
    .filter((entry) => entry.subject || entry.teacher || entry.room)
}

function parseAcademicYearFromFileName(fileName = '') {
  const match = String(fileName).match(/(\d{4})[-_]?\d{4}/)
  if (match) {
    return `${match[1]}-${Number(match[1]) + 1}`
  }

  return '2026-2027'
}

function parseSemesterFromFileName(fileName = '') {
  const match = String(fileName).match(/(\d+)\s*сем/i)
  if (match) return Number(match[1])
  return 1
}

function getCellValue(row, index) {
  return row[index] === undefined || row[index] === null ? '' : row[index]
}

function findGroupColumns(headerRow) {
  const columns = []
  for (let i = 0; i < headerRow.length; i += 1) {
    const cell = normalizeText(headerRow[i])
    if (!cell) continue
    if (SPECIALTY_PATTERN.test(cell)) {
      columns.push({
        index: i,
        group: cell
      })
    }
  }

  return columns
}

function getModeColumnMapping(headerRow) {
  const result = new Map()

  const normalizedHeader = headerRow.map((cell) => normalizeText(cell).toLowerCase())

  for (let i = 0; i < headerRow.length; i += 1) {
    const cell = normalizeText(headerRow[i])
    if (!cell) continue
    const lower = cell.toLowerCase()
    if (lower === 'викладач') result.set('teacher', i)
    if (lower === 'ауд.' || lower === 'аудиторія') result.set('room', i)
    if (lower === 'предмет' || lower === 'дисципліна' || lower === 'назва') result.set('subject', i)
  }

  for (let i = 0; i < headerRow.length; i += 1) {
    const cell = normalizeText(headerRow[i])
    if (!cell) continue
    if (SPECIALTY_PATTERN.test(cell)) {
      const group = cell
      const teacherIndex = i + 1
      const roomIndex = i + 2
      if (teacherIndex < headerRow.length) result.set(`g:${group}:teacher`, teacherIndex)
      if (roomIndex < headerRow.length) result.set(`g:${group}:room`, roomIndex)
      if (i > 0 && normalizedHeader[i - 1] === 'предмет') result.set(`g:${group}:subject`, i - 1)
    }
  }

  return result
}

function findDayFromRow(row) {
  for (let i = 0; i < row.length; i += 1) {
    const cellValue = row[i]
    const cell = normalizeText(cellValue)
    if (!cell) continue

    const normalized = normalizeDay(cellValue)
    const detected = detectDay(cellValue)

    if (detected) {
      console.log('[SCHEDULE DAY]', {
        rowIndex: i,
        raw: cellValue,
        normalized,
        detected
      })
      return detected
    }

    if (cell.toLowerCase().includes('п') && /пон|вівт|сер|четв|пят/i.test(cell.toLowerCase())) {
      console.log('[SCHEDULE DAY]', {
        rowIndex: i,
        raw: cellValue,
        normalized,
        detected: null
      })
    }
  }
  return null
}

function parseGroupName(value) {
  const text = normalizeText(value)
  return text && SPECIALTY_PATTERN.test(text) ? text : null
}

function isEmptyLesson(subject, teacher, room) {
  return !normalizeText(subject) && !normalizeText(teacher) && !normalizeText(room)
}

function buildTeacherDisplay(teachers) {
  if (!teachers.length) return ''
  return teachers.join(', ')
}

function buildScheduleKey(entry) {
  return [
    entry.academicYear,
    entry.semester,
    entry.day,
    entry.lessonNumber,
    entry.group,
    entry.subject,
    entry.teacher,
    entry.room,
    entry.weekType
  ].join('|')
}

async function clearScheduleForImport(academicYear, semester, specialty) {
  await pool.query(
    `DELETE FROM teacher_schedule
     WHERE academic_year = ?
       AND semester = ?
       AND specialty = ?`,
    [academicYear, semester, specialty]
  )
}

async function ensureScheduleTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_schedule (
      id INT AUTO_INCREMENT PRIMARY KEY,
      academic_year VARCHAR(20) NOT NULL,
      semester INT NOT NULL,
      specialty VARCHAR(50) NOT NULL DEFAULT '121',
      day VARCHAR(20) NOT NULL,
      lesson_number INT NOT NULL,
      group_name VARCHAR(50) NOT NULL,
      subject TEXT NOT NULL,
      teacher TEXT NOT NULL,
      room VARCHAR(100) NULL,
      week_type VARCHAR(20) NOT NULL DEFAULT 'all',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_schedule_entry (
        academic_year,
        semester,
        day,
        lesson_number,
        group_name,
        subject(255),
        teacher(255),
        room,
        week_type
      )
    )
  `)

  const [columns] = await pool.query('SHOW COLUMNS FROM teacher_schedule')
  if (!columns.some((column) => column.Field === 'week_type')) {
    await pool.query("ALTER TABLE teacher_schedule ADD COLUMN week_type VARCHAR(20) NOT NULL DEFAULT 'all'")
  }

  const [indexes] = await pool.query("SHOW INDEX FROM teacher_schedule WHERE Key_name = 'uq_schedule_entry'")
  const indexColumns = indexes.map((index) => index.Column_name)
  if (!indexColumns.includes('week_type')) {
    if (indexes.length) await pool.query('ALTER TABLE teacher_schedule DROP INDEX uq_schedule_entry')
    await pool.query(`
      ALTER TABLE teacher_schedule
      ADD UNIQUE KEY uq_schedule_entry (
        academic_year,
        semester,
        day,
        lesson_number,
        group_name,
        subject(255),
        teacher(255),
        room,
        week_type
      )
    `)
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_imports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      file_name VARCHAR(255) NOT NULL,
      academic_year VARCHAR(20) NOT NULL,
      semester INT NOT NULL,
      specialty VARCHAR(50) NOT NULL DEFAULT '121',
      records_count INT NOT NULL DEFAULT 0,
      imported_by INT NULL,
      imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (imported_by) REFERENCES users(id)
        ON DELETE SET NULL
    )
  `)
}

async function getCurrentUserId(req) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : null
  if (!token) return null

  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    return Number(payload?.id || 0)
  } catch {
    return null
  }
}

export async function importSchedule(req, res) {
  try {
    await ensureScheduleTable()

    if (!req.file) {
      return res.status(400).json({ message: 'Файл розкладу не був надісланий.' })
    }

    const fileName = req.file.originalname || 'schedule.xlsx'
    const extension = fileName.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls'].includes(extension || '')) {
      return res.status(400).json({ message: 'Підтримуються тільки файли Excel (.xlsx, .xls).' })
    }

    const workbook = XLSX.read(req.file.buffer, {
      type: 'buffer',
      raw: false,
      cellStyles: true
    })
    const sheetName = workbook.SheetNames.find((name) => /Осн|осн/i.test(name)) || workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    if (!sheet) {
      return res.status(400).json({ message: 'Аркуш "Осн" не знайдено в Excel-файлі.' })
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: true, defval: '' })
    const headerRow = rows.find((row) => Array.isArray(row) && row.some((cell) => SPECIALTY_PATTERN.test(normalizeText(cell)))) || rows[1] || []
    const groupColumns = findGroupColumns(headerRow)

    if (!groupColumns.length) {
      return res.status(400).json({ message: 'У файлі не знайдено груп спеціальності 121 (РПЗ ...).' })
    }

    const academicYear = parseAcademicYearFromFileName(fileName)
    const semester = parseSemesterFromFileName(fileName)
    const specialty = '121'

    const lessonRecords = []
    const seenKeys = new Set()
    let currentDay = null
    let currentLessonNumber = null
    let lastLessonDataRowIndex = -2
    let processedRows = 0
    let skippedRows = 0
    const skipReasons = {}
    const weekTypeCounts = { numerator: 0, denominator: 0, all: 0 }
    let duplicateRecords = 0

    const getSheetCell = (rowIndex, columnIndex) => {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })
      return { address, cell: sheet[address], value: sheet[address]?.v ?? '' }
    }

    const getRowEntries = (rowIndex) => {
      if (rowIndex < 0 || rowIndex >= rows.length) return []

      return groupColumns.flatMap((groupColumn) => {
        const subjectCell = getSheetCell(rowIndex, groupColumn.index)
        const teacherCell = getSheetCell(rowIndex, groupColumn.index + 1)
        const roomCell = getSheetCell(rowIndex, groupColumn.index + 2)
        if (isEmptyLesson(subjectCell.value, teacherCell.value, roomCell.value)) return []
        return [{ groupColumn, subjectCell, teacherCell, roomCell }]
      })
    }

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]
      if (!Array.isArray(row)) continue

      const foundDay = findDayFromRow(row)
      if (foundDay) {
        currentDay = foundDay
        currentLessonNumber = null
        lastLessonDataRowIndex = rowIndex - 2
      }

      if (!currentDay) continue

      const lessonNumberCell = normalizeText(getCellValue(row, 1))
      const parsedLessonNumber = Number(lessonNumberCell)
      const hasExplicitLessonNumber = Number.isInteger(parsedLessonNumber) && parsedLessonNumber >= 1 && parsedLessonNumber <= 12
      if (hasExplicitLessonNumber) currentLessonNumber = parsedLessonNumber

      const rowEntries = getRowEntries(rowIndex)

      if (!rowEntries.length) {
        if (!hasExplicitLessonNumber && lessonNumberCell) {
          skippedRows += 1
          skipReasons.invalidLessonNumber = (skipReasons.invalidLessonNumber || 0) + 1
        }
        continue
      }

      const isContinuationRow = !hasExplicitLessonNumber &&
        Number.isInteger(currentLessonNumber) &&
        rowIndex === lastLessonDataRowIndex + 1

      if (!hasExplicitLessonNumber && !isContinuationRow) {
        skippedRows += 1
        skipReasons.orphanDataRow = (skipReasons.orphanDataRow || 0) + 1
        continue
      }

      const lessonNumber = hasExplicitLessonNumber ? parsedLessonNumber : currentLessonNumber
      lastLessonDataRowIndex = rowIndex

      const previousLessonNumberCell = rowIndex > 0 ? normalizeText(getCellValue(rows[rowIndex - 1], 1)) : ''
      const previousLessonNumber = Number(previousLessonNumberCell)
      const previousHasExplicitLessonNumber = Number.isInteger(previousLessonNumber) && previousLessonNumber >= 1 && previousLessonNumber <= 12
      const previousRowEntries = getRowEntries(rowIndex - 1)
      const nextLessonNumberCell = normalizeText(getCellValue(rows[rowIndex + 1], 1))
      const nextLessonNumber = Number(nextLessonNumberCell)
      const nextHasExplicitLessonNumber = Number.isInteger(nextLessonNumber) && nextLessonNumber >= 1 && nextLessonNumber <= 12
      const nextRowEntries = getRowEntries(rowIndex + 1)

      for (const rowEntry of rowEntries) {
        const { groupColumn, roomCell } = rowEntry
        const subjectValue = normalizeText(rowEntry.subjectCell.value)
        const teacherValue = normalizeText(rowEntry.teacherCell.value)
        const roomValue = normalizeText(rowEntry.roomCell.value)
        const parsedTeachers = normalizeTeacherText(teacherValue)
        const teacherDisplay = buildTeacherDisplay(parsedTeachers)
        const groupFamily = getGroupFamily(groupColumn.group)
        const hasSameFamilyInNextRow = nextRowEntries.some((entry) => getGroupFamily(entry.groupColumn.group) === groupFamily)
        const hasSameFamilyInPreviousRow = previousRowEntries.some((entry) => getGroupFamily(entry.groupColumn.group) === groupFamily)
        const isNumeratorSplitRow = hasExplicitLessonNumber && !nextHasExplicitLessonNumber && hasSameFamilyInNextRow
        const isDenominatorSplitRow = isContinuationRow && previousHasExplicitLessonNumber && hasSameFamilyInPreviousRow
        const structuralWeekType = isNumeratorSplitRow
          ? 'numerator'
          : isDenominatorSplitRow
            ? 'denominator'
            : 'all'
        const textWeekType = detectWeekTypeForRow(subjectValue, teacherValue, roomValue, roomCell.cell)
        const weekType = structuralWeekType !== 'all' ? structuralWeekType : textWeekType

        const entry = {
          academicYear,
          semester,
          specialty,
          day: currentDay,
          lessonNumber,
          group: groupColumn.group,
          subject: subjectValue,
          teacher: teacherDisplay || teacherValue,
          room: roomValue,
          weekType
        }

        console.log('[SCHEDULE ROW]', {
          rowIndex: rowIndex + 1,
          day: currentDay,
          rawLessonNumber: lessonNumberCell,
          currentLessonNumber,
          group: groupColumn.group,
          subject: subjectValue,
          teacher: teacherValue,
          room: roomValue,
          roomCellAddress: roomCell.address,
          roomColor: getCellFillColor(roomCell.cell),
          detectedWeekType: weekType
        })

        const key = buildScheduleKey(entry)
        if (seenKeys.has(key)) {
          duplicateRecords += 1
          continue
        }
        seenKeys.add(key)
        lessonRecords.push(entry)
        weekTypeCounts[weekType] += 1
      }

      processedRows += 1
    }

    const summaryByDay = {
      ПОНЕДІЛОК: lessonRecords.filter((entry) => entry.day === 'ПОНЕДІЛОК').length,
      ВІВТОРОК: lessonRecords.filter((entry) => entry.day === 'ВІВТОРОК').length,
      СЕРЕДА: lessonRecords.filter((entry) => entry.day === 'СЕРЕДА').length,
      ЧЕТВЕР: lessonRecords.filter((entry) => entry.day === 'ЧЕТВЕР').length,
      "П'ЯТНИЦЯ": lessonRecords.filter((entry) => entry.day === "П'ЯТНИЦЯ").length,
      СУБОТА: lessonRecords.filter((entry) => entry.day === 'СУБОТА').length,
      НЕДІЛЯ: lessonRecords.filter((entry) => entry.day === 'НЕДІЛЯ').length
    }

    console.log('[SCHEDULE DAYS]', summaryByDay)
    console.log('[SCHEDULE IMPORT DIAGNOSTICS]', {
      rowsRead: rows.length,
      processedRows,
      recordsFound: lessonRecords.length,
      weekTypeCounts,
      duplicateRecords,
      skippedRows,
      skipReasons,
      recordsWithoutLessonNumber: lessonRecords.filter((entry) => !Number.isInteger(entry.lessonNumber)).length,
      recordsWithoutWeekType: lessonRecords.filter((entry) => !entry.weekType).length
    })

    if (!lessonRecords.length) {
      return res.status(400).json({ message: 'У файлі не знайдено коректних занять для груп 121.' })
    }

    await clearScheduleForImport(academicYear, semester, specialty)

    for (const lesson of lessonRecords) {
      await pool.query(
        `INSERT INTO teacher_schedule (
          academic_year,
          semester,
          specialty,
          day,
          lesson_number,
          group_name,
          subject,
          teacher,
          room,
          week_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lesson.academicYear,
          lesson.semester,
          lesson.specialty,
          lesson.day,
          lesson.lessonNumber,
          lesson.group,
          lesson.subject,
          lesson.teacher,
          lesson.room || null,
          lesson.weekType
        ]
      )
    }

    const userId = await getCurrentUserId(req)
    await pool.query(
      `INSERT INTO schedule_imports (file_name, academic_year, semester, specialty, records_count, imported_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fileName, academicYear, semester, specialty, lessonRecords.length, userId || null]
    )

    console.log('[Schedule Import] File received')
    console.log(`[Schedule Import] Sheet "${sheetName}" found`)
    console.log(`[Schedule Import] Groups detected: ${groupColumns.length}`)
    console.log(`[Schedule Import] Days detected: ${new Set(lessonRecords.map((entry) => entry.day)).size}`)
    console.log(`[Schedule Import] Lessons parsed: ${lessonRecords.length}`)
    console.log('[Schedule Import] Import completed')

    res.json({
      message: 'Розклад успішно імпортовано.',
      fileName,
      academicYear,
      semester,
      specialty,
      recordsCount: lessonRecords.length,
      groupsCount: new Set(lessonRecords.map((entry) => entry.group)).size,
      teachersCount: new Set(lessonRecords.map((entry) => entry.teacher)).size,
      diagnostics: {
        rowsRead: rows.length,
        processedRows,
        recordsFound: lessonRecords.length,
        numerator: weekTypeCounts.numerator,
        denominator: weekTypeCounts.denominator,
        all: weekTypeCounts.all,
        skippedRows,
        skipReasons,
        duplicateRecords,
        recordsWithoutLessonNumber: lessonRecords.filter((entry) => !Number.isInteger(entry.lessonNumber)).length,
        recordsWithoutWeekType: lessonRecords.filter((entry) => !entry.weekType).length
      }
    })
  } catch (error) {
    console.error('[Schedule Import] Failed:', error)
    res.status(500).json({ message: 'Не вдалося імпортувати розклад.', details: error.message })
  }
}

export async function getSchedule(req, res) {
  try {
    await ensureScheduleTable()
    const { group, day, teacher, weekType } = req.query

    let query = `
      SELECT
        academic_year,
        semester,
        specialty,
        day,
        lesson_number AS lessonNumber,
        group_name AS groupName,
        group_name AS \`group\`,
        subject,
        teacher,
        room,
        week_type AS weekType
      FROM teacher_schedule
      WHERE specialty = '121'
    `
    const params = []

    if (group) {
      query += ' AND group_name = ?'
      params.push(group)
    }

    if (day) {
      query += ' AND day = ?'
      params.push(day)
    }

    if (teacher) {
      query += ' AND teacher LIKE ?'
      params.push(`%${teacher}%`)
    }

    if (weekType === 'numerator' || weekType === 'denominator') {
      query += ' AND week_type IN (?, ?)'
      params.push(weekType, 'all')
    }

    query += ' ORDER BY FIELD(day, ' + DAYS.map((item) => '?').join(', ') + '), lesson_number ASC'
    params.push(...DAYS)

    const [rows] = await pool.query(query, params)

    res.json(rows)
  } catch (error) {
    console.error('[Schedule Import] Read failed:', error)
    res.status(500).json({ message: 'Не вдалося отримати розклад.', details: error.message })
  }
}

export async function getScheduleSummary(req, res) {
  try {
    await ensureScheduleTable()

    const [rows] = await pool.query(`
      SELECT
        academic_year AS academicYear,
        semester,
        specialty,
        COUNT(*) AS recordsCount,
        COUNT(DISTINCT group_name) AS groupsCount,
        COUNT(DISTINCT teacher) AS teachersCount
      FROM teacher_schedule
      WHERE specialty = '121'
      GROUP BY academic_year, semester, specialty
      ORDER BY academic_year DESC, semester ASC
    `)

    res.json(rows)
  } catch (error) {
    console.error('[Schedule Import] Summary failed:', error)
    res.status(500).json({ message: 'Не вдалося отримати підсумок розкладу.', details: error.message })
  }
}
