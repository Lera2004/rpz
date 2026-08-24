import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

import teacherRoutes from './routes/teacherRoutes.js'
import groupRoutes from './routes/groupRoutes.js'
import planRoutes from './routes/planRoutes.js'
import workloadRoutes from './routes/workloadRoutes.js'
import commissionRoutes from './routes/commissionRoutes.js'
import studentDistributionRoutes from './routes/studentDistributionRoutes.js'
import taskRoutes from './routes/taskRoutes.js'
import authRoutes from './routes/authRoutes.js'
import scheduleRoutes from './routes/scheduleRoutes.js'
import statementRoutes from './routes/statementRoutes.js'
import { initializeTaskData } from './controllers/taskController.js'
import { initializeAuthData } from './controllers/authController.js'
import { startTelegramBot, startTaskReminders } from './telegramBot.js'
import telegramRoutes from './routes/telegramRoutes.js'
import pool from './config/database.js'


dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const educationProcessWorkbookPath = path.resolve(__dirname, '../../uploads/Графік ОП 2026-2027.xlsx')

const monthOrder = ['Вересень', 'Жовтень', 'Листопад', 'Грудень', 'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень']

const monthYearMap = {
  Вересень: 2026,
  Жовтень: 2026,
  Листопад: 2026,
  Грудень: 2026,
  Січень: 2027,
  Лютий: 2027,
  Березень: 2027,
  Квітень: 2027,
  Травень: 2027,
  Червень: 2027,
  Липень: 2027,
  Серпень: 2027
}

const codeStyles = {
  ПА: { title: 'Проміжна атестація', type: 'assessment', color: '#8b5cf6' },
  Е: { title: 'Екзаменаційна сесія', type: 'exam', color: '#ef4444' },
  К: { title: 'Канікули', type: 'vacation', color: '#facc15' },
  СТ: { title: 'Святковий тиждень', type: 'holiday', color: '#f59e0b' },
  ОТ: { title: 'Практика з використанням обчислювальної техніки', type: 'practice', color: '#10b981' },
  ВТ: { title: 'Виробнича технологічна практика', type: 'practice', color: '#34d399' },
  ПП: { title: 'Переддипломна практика', type: 'practice', color: '#14b8a6' },
  ДП: { title: 'Дипломне проєктування', type: 'project', color: '#ec4899' },
  А: { title: 'Атестація здобувачів ФПО', type: 'assessment', color: '#7c3aed' },
  ВП: { title: 'Виробнича практика', type: 'practice', color: '#22c55e' },
  Н: { title: 'Теоретичне навчання', type: 'study', color: '#3b82f6' },
  М: { title: 'Теоретичне навчання', type: 'study', color: '#3b82f6' },
  С: { title: 'Слюсарна практика', type: 'practice', color: '#10b981' },
  ЕМ: { title: 'Електромонтажна практика', type: 'practice', color: '#10b981' },
  РМ: { title: 'Радіомонтажна практика', type: 'practice', color: '#10b981' },
  РВ: { title: 'Електрорадіовимірювальна практика', type: 'practice', color: '#10b981' },
  default: { title: 'Навчальна діяльність', type: 'other', color: '#64748b' }
}

const monthCalendarIndex = {
  Вересень: 8,
  Жовтень: 9,
  Листопад: 10,
  Грудень: 11,
  Січень: 0,
  Лютий: 1,
  Березень: 2,
  Квітень: 3,
  Травень: 4,
  Червень: 5,
  Липень: 6,
  Серпень: 7
}

const monthAbbrevMap = {
  I: 'Січень',
  II: 'Лютий',
  III: 'Березень',
  IV: 'Квітень',
  V: 'Травень',
  VI: 'Червень',
  VII: 'Липень',
  VIII: 'Серпень',
  IX: 'Вересень',
  X: 'Жовтень',
  XI: 'Листопад',
  XII: 'Грудень'
}

const monthRomanMap = {
  I: 'Січень',
  II: 'Лютий',
  III: 'Березень',
  IV: 'Квітень',
  V: 'Травень',
  VI: 'Червень',
  VII: 'Липень',
  VIII: 'Серпень',
  IX: 'Вересень',
  X: 'Жовтень',
  XI: 'Листопад',
  XII: 'Грудень'
}

const monthIndexToName = {
  0: 'Січень',
  1: 'Лютий',
  2: 'Березень',
  3: 'Квітень',
  4: 'Травень',
  5: 'Червень',
  6: 'Липень',
  7: 'Серпень',
  8: 'Вересень',
  9: 'Жовтень',
  10: 'Листопад',
  11: 'Грудень'
}

const formatDate = (year, monthIndex, day) => {
  const date = new Date(year, monthIndex, day)
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
}

const parseDateString = (dateString) => {
  if (!dateString) return null
  const [day, month, year] = dateString.split('.').map((part) => Number(part))
  if (!day || !month || !year) return null
  return new Date(year, month - 1, day)
}

const addDays = (date, days) => {
  if (!(date instanceof Date)) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

const normalizeText = (value) => {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

const getSheetCell = (sheet, row, col) => {
  const address = XLSX.utils.encode_cell({ r: row, c: col })
  const cell = sheet[address]
  return cell ? cell.v : ''
}

const getSheetCellString = (sheet, row, col) => normalizeText(getSheetCell(sheet, row, col))

const getSheetCellNumber = (sheet, row, col) => {
  const value = getSheetCell(sheet, row, col)
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  if (!/^\d+$/.test(text)) return null
  return Number(text)
}

const isNumericValue = (value) => {
  const text = normalizeText(value)
  return text !== '' && /^-?\d+(?:\.\d+)?$/.test(text)
}

const isCodeCandidate = (value) => {
  const text = normalizeText(value)
  return /^[А-ЯІЇЄҐA-Z0-9]{1,6}$/.test(text)
}

const getColumnLetter = (columnIndex) => {
  let index = columnIndex + 1
  let letter = ''

  while (index > 0) {
    const remainder = (index - 1) % 26
    letter = String.fromCharCode(65 + remainder) + letter
    index = Math.floor((index - 1) / 26)
  }

  return letter
}

const getMonthFromCell = (value) => {
  const text = normalizeText(value).replace('.', '')
  if (!text) return null

  if (monthAbbrevMap[text]) return monthAbbrevMap[text]
  if (monthRomanMap[text]) return monthRomanMap[text]
  if (monthOrder.includes(text)) return text
  return null
}

const makeDateString = (monthName, day) => {
  if (!monthName || day == null) return null
  const year = monthYearMap[monthName] || 2026
  const monthIndex = monthCalendarIndex[monthName] ?? 0
  return formatDate(year, monthIndex, day)
}

const getWeekNumber = (value) => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

const findLegendName = (row, start) => {
  const pieces = []

  for (let col = start; col < row.length; col += 1) {
    const value = normalizeText(row[col])
    if (!value) {
      if (pieces.length > 0) break
      continue
    }

    if (isCodeCandidate(value)) break
    pieces.push(value)
  }

  return pieces.join(' ').trim() || null
}

const parseLegend = (sheet) => {
  const legend = {}
  const startRow = 23
  const endRow = 26
  const maxCol = 70

  const findLegendDescription = (row, startCol) => {
    const pieces = []
    for (let col = startCol; col <= maxCol; col += 1) {
      const value = normalizeText(getSheetCell(sheet, row, col))
      if (!value) continue
      if (isCodeCandidate(value)) break
      pieces.push(value)
    }
    return pieces.join(' ').trim() || null
  }

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = 0; col <= maxCol; col += 1) {
      const cell = normalizeText(getSheetCell(sheet, row, col))
      if (!cell) continue
      if (!isCodeCandidate(cell)) continue
      if (monthRomanMap[cell] || monthOrder.includes(cell)) continue

      const name = findLegendDescription(row, col + 1)
      if (name) {
        legend[cell] = name
      }
    }
  }

  return legend
}

const buildMonthByColumn = (sheet) => {
  const monthByColumn = {}
  const merges = sheet['!merges'] || []

  for (const merge of merges) {
    if (merge.s.r !== 8 || merge.e.r !== 8) continue
    const monthName = getSheetCellString(sheet, merge.s.r, merge.s.c)
    if (!monthOrder.includes(monthName)) continue

    for (let col = merge.s.c; col <= merge.e.c; col += 1) {
      monthByColumn[col] = monthName
    }
  }

  let current = null
  for (let col = 3; col <= 54; col += 1) {
    const monthName = getSheetCellString(sheet, 8, col)
    if (monthOrder.includes(monthName)) {
      current = monthName
      monthByColumn[col] = current
    } else if (!monthByColumn[col] && current) {
      monthByColumn[col] = current
    }
  }

  return monthByColumn
}

const buildWeekDefinition = (sheet) => {
  const weekDefinition = []
  const weekRowIndex = 12
  const startRowIndex = 9
  const endRowIndex = 11
  const transitionRowIndex = 10
  const monthByColumn = buildMonthByColumn(sheet)

  let previousEndDate = null

  for (let col = 3; col <= 54; col += 1) {
    const weekNumber = getWeekNumber(getSheetCell(sheet, weekRowIndex, col))
    if (!weekNumber) continue

    const startRaw = getSheetCell(sheet, startRowIndex, col)
    const endRaw = getSheetCell(sheet, endRowIndex, col)
    const transitionRaw = getSheetCell(sheet, transitionRowIndex, col)
    const row9Raw = getSheetCell(sheet, 8, col)

    const startDayValue = getSheetCellNumber(sheet, startRowIndex, col)
    const endDayValue = getSheetCellNumber(sheet, endRowIndex, col)
    const transitionDayValue = getSheetCellNumber(sheet, transitionRowIndex, col)
    const monthFromCandidate = getMonthFromCell(startRaw)
    const monthToCandidate = getMonthFromCell(endRaw)
    const monthFromFallback = monthByColumn[col]

    let dateFromDay = startDayValue
    let dateFromMonth = monthFromCandidate || monthFromFallback
    let dateToDay = endDayValue
    let dateToMonth = monthToCandidate || monthFromFallback

    if (dateFromDay == null) {
      const row9Day = getSheetCellNumber(sheet, 8, col)
      if (row9Day != null) {
        dateFromDay = row9Day
      } else if (previousEndDate) {
        const nextDate = addDays(previousEndDate, 1)
        dateFromDay = nextDate.getDate()
        const monthIndex = nextDate.getMonth()
        dateFromMonth = monthIndexToName[monthIndex]
      }
    }

    if (dateToDay == null) {
      dateToDay = transitionDayValue
    }

    if (dateFromMonth == null && startRaw != null) {
      const candidate = getMonthFromCell(startRaw)
      if (candidate) dateFromMonth = candidate
    }

    if (dateToMonth == null && endRaw != null) {
      const candidate = getMonthFromCell(endRaw)
      if (candidate) dateToMonth = candidate
    }

    if (dateToMonth == null && dateFromMonth != null) {
      dateToMonth = dateFromMonth
    }

    const dateFrom = makeDateString(dateFromMonth, dateFromDay)
    const dateTo = makeDateString(dateToMonth, dateToDay)

    if (dateTo) {
      const parsedEnd = parseDateString(dateTo)
      if (parsedEnd) previousEndDate = parsedEnd
    }

    weekDefinition.push({
      week: weekNumber,
      monthFrom: dateFromMonth || null,
      monthTo: dateToMonth || null,
      dateFrom,
      dateTo,
      column: getColumnLetter(col),
      columnIndex: col
    })
  }

  return weekDefinition.sort((a, b) => a.week - b.week)
}

const buildGroupWeeks = (sheet, weekDefinition, legend, rowIndex) => {
  return weekDefinition.map((weekMeta) => {
    const rawCell = getSheetCell(sheet, rowIndex, weekMeta.columnIndex)
    const cellValue = normalizeText(rawCell)

    let code = null
    let name = null

    if (cellValue && !isNumericValue(cellValue)) {
      if (monthRomanMap[cellValue] || monthOrder.includes(cellValue)) {
        code = null
      } else {
        code = cellValue
        if (code === 'Випуск') {
          name = 'Випуск'
        } else {
          name = legend[code] || codeStyles[code]?.title || code
        }
      }
    }

    return {
      week: weekMeta.week,
      monthFrom: weekMeta.monthFrom,
      monthTo: weekMeta.monthTo,
      dateFrom: weekMeta.dateFrom,
      dateTo: weekMeta.dateTo,
      code,
      name
    }
  })
}

const buildGroupEvents = (weeks) => {
  const events = []
  let currentEvent = null

  for (const week of weeks) {
    if (!week.code) {
      if (currentEvent) {
        events.push(currentEvent)
        currentEvent = null
      }
      continue
    }

    if (currentEvent && currentEvent.code === week.code) {
      currentEvent.weekTo = week.week
      currentEvent.weeksCount += 1
      currentEvent.dateTo = week.dateTo
      currentEvent.monthTo = week.monthTo || week.monthFrom
      continue
    }

    if (currentEvent) {
      events.push(currentEvent)
    }

    currentEvent = {
      code: week.code,
      name: week.name,
      weekFrom: week.week,
      weekTo: week.week,
      weeksCount: 1,
      dateFrom: week.dateFrom,
      dateTo: week.dateTo,
      monthFrom: week.monthFrom,
      monthTo: week.monthTo || week.monthFrom
    }
  }

  if (currentEvent) {
    events.push(currentEvent)
  }

  return events
}

const parseEducationSchedule = (filePath) => {
  const workbook = XLSX.readFile(filePath)
  const sheetName = workbook.SheetNames.includes('РПЗ_МЕТ')
    ? 'РПЗ_МЕТ'
    : workbook.SheetNames[0]

  const sheet = workbook.Sheets[sheetName]
  const legend = parseLegend(sheet)
  const weekDefinition = buildWeekDefinition(sheet)

  const groups = []
  const seenGroups = new Set()

  for (let rowIndex = 1; rowIndex <= 60; rowIndex += 1) {
    const groupCell = normalizeText(getSheetCell(sheet, rowIndex, 2))
    const rawGroupMatch = groupCell.match(/РПЗ\s*\d+\s*\d+\s*\/\s*\d+/i)
    let groupName = null

    if (rawGroupMatch) {
      groupName = rawGroupMatch[0].replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').trim()
    } else {
      const fallbackCell = normalizeText(getSheetCell(sheet, rowIndex, 23))
      const fallbackMatch = fallbackCell.match(/РПЗ\s*\d+\s*\d+\s*\/\s*\d+/i)
      if (fallbackMatch) {
        groupName = fallbackMatch[0].replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').trim()
      }
    }

    if (!groupName || seenGroups.has(groupName)) continue

    seenGroups.add(groupName)

    const weeks = buildGroupWeeks(sheet, weekDefinition, legend, rowIndex)
    const events = buildGroupEvents(weeks)

    groups.push({
      group: groupName,
      weeks,
      events
    })
  }

  return {
    sheet: sheetName,
    weeks: weekDefinition,
    legend,
    groups
  }
}

const parseEducationProcessWorkbook = () => parseEducationSchedule(educationProcessWorkbookPath)

const uniteDates = (dates = []) => [...new Set(dates.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b)

export { parseEducationSchedule }

const app = express()

app.use(cors())

app.use(express.json())
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')))

app.use(
  '/api/teachers',
  teacherRoutes
)

app.use(
  '/api/groups',
  groupRoutes
)

app.use(
  '/api/plans',
  planRoutes
)

app.use(
  '/api/workload',
  workloadRoutes
)

app.use(
  '/api/commissions',
  commissionRoutes
)

app.use(
  '/api/student-distributions',
  studentDistributionRoutes
)

app.use(
  '/api/tasks',
  taskRoutes
)

app.use(
  '/api/auth',
  authRoutes
)

app.use(
  '/api/schedule',
  scheduleRoutes
)

app.use(
  '/api/statements',
  statementRoutes
)

app.use(
  '/api/telegram',
  telegramRoutes
)

app.get('/', (req, res) => {

  res.json({
    message: 'PED API працює'
  })

})

app.get('/api/education-process', async (req, res) => {
  try {
    const records = parseEducationProcessWorkbook()


    res.json({
      sourceFile: path.basename(educationProcessWorkbookPath),
      total: Array.isArray(records.groups) ? records.groups.length : 0,
      records
    })
  } catch (error) {
    console.error('ПОМИЛКА ЧИТАННЯ ГРАФІКА ОСВІТНЬОГО ПРОЦЕСУ:', error)
    res.status(500).json({
      message: 'Не вдалося прочитати графік освітнього процесу',
      details: error.message
    })
  }
})

const PORT = process.env.PORT || 3000


app.listen(PORT, async () => {
  try {
    await initializeTaskData()
    await initializeAuthData()
    console.log('Initialized task tables and auth seed data')
  } catch (error) {
    console.error('Failed to initialize app data:', error)
  }

  try {
    await startTelegramBot()
    startTaskReminders()
  } catch (error) {
    console.error('Failed to start Telegram bot:', error)
  }

  console.log(
    `Server started on http://localhost:${PORT}`
  )

})