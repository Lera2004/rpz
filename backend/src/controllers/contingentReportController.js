import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pool from '../config/database.js'
import pdfmake from 'pdfmake'
import { isAllowedImportSpecialty } from './groupController.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fontDirectory = path.resolve(__dirname, '../../node_modules/pdfmake/fonts/Roboto')
pdfmake.setUrlAccessPolicy(() => false)
pdfmake.setLocalAccessPolicy((filePath) =>
  path.resolve(filePath).startsWith(`${fontDirectory}${path.sep}`)
)
pdfmake.setFonts({
  Roboto: {
    normal: path.join(fontDirectory, 'Roboto-Regular.ttf'),
    bold: path.join(fontDirectory, 'Roboto-Medium.ttf'),
    italics: path.join(fontDirectory, 'Roboto-Italic.ttf'),
    bolditalics: path.join(fontDirectory, 'Roboto-MediumItalic.ttf')
  }
})

const ACTIVE_STATUSES = new Set([
  '',
  'active',
  'активний',
  'активний студент',
  'повернено з академвідпустки'
])
const ACADEMIC_LEAVE_STATUS = 'надано академвідпустку'
const REPORTED_ACTION_TYPES = new Set([
  'status_change',
  'group_transfer',
  'funding_change',
  'restore',
  'delete'
])

const pad = (value) => String(value).padStart(2, '0')

const formatDate = (date) => `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`

const formatSqlDateTime = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

const parseJson = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch (error) {
    console.error('Не вдалося прочитати дані звіту контингенту:', error)
    return {}
  }
}

const ensureContingentReportsTable = async () => {
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contingent_reports (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      snapshot_date DATE NOT NULL,
      actions_month CHAR(7) NOT NULL,
      report_data JSON NOT NULL,
      pdf_data LONGBLOB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_contingent_reports_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `)
}

const getCurrentMonthRange = (now) => {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return {
    start: formatSqlDateTime(start),
    end: formatSqlDateTime(end),
    label: `${pad(now.getMonth() + 1)}.${now.getFullYear()}`
  }
}

const getActionDescription = (action, details) => {
  if (action.action_type === 'group_transfer') {
    const previousGroup = details.previousGroupName || action.previous_group_name || 'іншої групи'
    return `Переведено з групи ${previousGroup} до групи ${action.group_name || '—'}`
  }
  if (action.action_type === 'status_change') {
    const previous = details.previous || 'активний статус'
    const next = details.next || action.action_label
    return `Статус: ${previous} → ${next}`
  }
  if (action.action_type === 'funding_change') {
    return `Фінансування: ${details.previous || '—'} → ${details.next || '—'}`
  }
  if (action.action_type === 'restore') {
    return action.action_label || 'Поновлено до групи'
  }
  return action.action_label || 'Видалено зі складу групи'
}

const makeContingentTable = (report, countType) => {
  const countKey = countType === 'active' ? 'active' : 'total'
  const budgetKey = countType === 'active' ? 'activeBudget' : 'budget'
  const contractKey = countType === 'active' ? 'activeContract' : 'contract'
  const totalKey = countType === 'active' ? 'active' : 'total'
  const highlightColor = countType === 'active' ? '#dbeafe' : '#dcfce7'
  const highlightedCell = (text, options = {}) => ({
    text,
    fillColor: highlightColor,
    bold: true,
    ...options
  })
  const tableBody = [[
    { text: '№', style: 'tableHeader', alignment: 'center' },
    { text: 'Група', style: 'tableHeader' },
    { text: 'Бюджет', style: 'tableHeader', alignment: 'center' },
    { text: 'Контракт', style: 'tableHeader', alignment: 'center' },
    { text: 'Всього', style: 'tableHeader', alignment: 'center' }
  ]]
  let groupIndex = 0
  for (const course of report.courses) {
    for (const group of course.groups) {
      groupIndex += 1
      tableBody.push([
        { text: String(groupIndex), alignment: 'center' },
        group.name,
        { text: String(group[budgetKey]), alignment: 'center' },
        { text: String(group[contractKey]), alignment: 'center' },
        { text: String(group[countKey]), alignment: 'center', bold: true }
      ])
    }
    const courseLabel = course.course === 'Без курсу' ? course.course : `Всього ${course.course} курс`
    tableBody.push([
      highlightedCell(courseLabel, { colSpan: 2 }), '',
      highlightedCell(String(course[budgetKey]), { alignment: 'center' }),
      highlightedCell(String(course[contractKey]), { alignment: 'center' }),
      highlightedCell(String(course[totalKey]), { alignment: 'center' })
    ])
  }
  tableBody.push([
    highlightedCell('Всього', { colSpan: 2, fontSize: 12 }), '',
    highlightedCell(String(report.totals[budgetKey]), { alignment: 'center', fontSize: 12 }),
    highlightedCell(String(report.totals[contractKey]), { alignment: 'center', fontSize: 12 }),
    highlightedCell(String(report.totals[totalKey]), { alignment: 'center', fontSize: 12 })
  ])

  return {
    table: {
      headerRows: 1,
      widths: [34, '*', 76, 76, 70],
      body: tableBody,
      dontBreakRows: true
    },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      hLineColor: () => '#374151',
      vLineColor: () => '#374151',
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4
    }
  }
}

const makeContingentPdf = async (report) => {

  const actionRows = report.actions.length
    ? report.actions.map((action, index) => [
      String(index + 1),
      action.date,
      action.applicant || 'ПІБ не вказано',
      action.group_name || '—',
      action.description
    ])
    : [[{ text: 'За поточний місяць змін не зафіксовано.', colSpan: 5, alignment: 'center', margin: [0, 8] }, '', '', '', '']]

  const documentDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [32, 44, 32, 42],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#111827' },
    styles: {
      title: { fontSize: 16, bold: true, alignment: 'center', margin: [0, 0, 0, 5] },
      subtitle: { fontSize: 10, alignment: 'center', margin: [0, 0, 0, 12] },
      sectionTitle: { fontSize: 13, bold: true, margin: [0, 0, 0, 8] },
      tableHeader: { bold: true, fillColor: '#e5e7eb', margin: [0, 3] },
      note: { fontSize: 8, italics: true, color: '#4b5563', margin: [0, 7, 0, 0] }
    },
    footer: (currentPage, pageCount) => ({
      text: `Сформовано ${report.reportDate} · Сторінка ${currentPage} з ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: '#6b7280',
      margin: [0, 12, 0, 0]
    }),
    content: [
      { text: report.title, style: 'title' },
      { text: `на ${report.reportDate} (включно зі студентами в академічній відпустці)`, style: 'subtitle' },
      makeContingentTable(report, 'all'),
      { text: `До загальної чисельності включено ${report.totals.academicLeave} студентів в академічній відпустці.`, style: 'note' },
      { text: '', pageBreak: 'before' },
      { text: `Дії за поточний місяць (${report.actionsMonth})`, style: 'sectionTitle' },
      {
        table: {
          headerRows: 1,
          widths: [30, 78, 145, 95, '*'],
          body: [[
            { text: '№', style: 'tableHeader', alignment: 'center' },
            { text: 'Дата', style: 'tableHeader' },
            { text: 'Студент', style: 'tableHeader' },
            { text: 'Група', style: 'tableHeader' },
            { text: 'Дія', style: 'tableHeader' }
          ], ...actionRows],
          dontBreakRows: true
        },
        layout: 'lightHorizontalLines'
      },
      { text: '', pageBreak: 'before' },
      { text: report.title, style: 'title' },
      { text: `на ${report.reportDate} (без студентів в академічній відпустці)`, style: 'subtitle' },
      makeContingentTable(report, 'active')
    ]
  }

  return pdfmake.createPdf(documentDefinition).getBuffer()
}

const buildReportSnapshot = async () => {
  const now = new Date()
  const range = getCurrentMonthRange(now)
  const reportDate = formatDate(now)
  const [studentRows] = await pool.query(`
    SELECT sg.id AS group_id, sg.name AS group_name, sg.course,
           sg.specialty AS group_specialty,
           ga.applicant, ga.specialty, ga.funding_source, ga.status
    FROM student_groups sg
    LEFT JOIN group_applicants ga ON ga.group_id = sg.id
    ORDER BY sg.course, sg.name, ga.applicant
  `)

  const groups = new Map()
  for (const row of studentRows) {
    const specialty = row.group_specialty || row.specialty
    if (!isAllowedImportSpecialty(specialty)) continue

    const key = Number(row.group_id)
    if (!groups.has(key)) {
      const course = Number(row.course) || 0
      groups.set(key, {
        name: row.group_name,
        course,
        courseLabel: course ? `${course}` : 'Без курсу',
        total: 0,
        active: 0,
        academicLeave: 0,
        contract: 0,
        budget: 0,
        activeContract: 0,
        activeBudget: 0
      })
    }

    if (!row.applicant) continue
    const status = String(row.status || '').trim().toLocaleLowerCase('uk')
    const group = groups.get(key)
    if (status === ACADEMIC_LEAVE_STATUS) {
      group.total += 1
      group.academicLeave += 1
    } else if (ACTIVE_STATUSES.has(status)) {
      group.total += 1
      group.active += 1
    } else {
      continue
    }

    const funding = String(row.funding_source || '').toLocaleLowerCase('uk')
    if (funding.includes('контракт')) {
      group.contract += 1
      if (status !== ACADEMIC_LEAVE_STATUS) group.activeContract += 1
    }
    if (funding.includes('бюджет')) {
      group.budget += 1
      if (status !== ACADEMIC_LEAVE_STATUS) group.activeBudget += 1
    }
  }

  const coursesByNumber = new Map()
  const totals = {
    total: 0,
    active: 0,
    academicLeave: 0,
    contract: 0,
    budget: 0,
    activeContract: 0,
    activeBudget: 0
  }
  for (const group of groups.values()) {
    const courseKey = group.course || 0
    if (!coursesByNumber.has(courseKey)) {
      coursesByNumber.set(courseKey, {
        course: group.courseLabel,
        courseNumber: group.course,
        groups: [],
        total: 0,
        contract: 0,
        budget: 0,
        active: 0,
        activeContract: 0,
        activeBudget: 0
      })
    }
    const course = coursesByNumber.get(courseKey)
    course.groups.push(group)
    course.total += group.total
    course.contract += group.contract
    course.budget += group.budget
    course.active += group.active
    course.activeContract += group.activeContract
    course.activeBudget += group.activeBudget
    for (const key of Object.keys(totals)) totals[key] += group[key]
  }

  const [actionRows] = await pool.query(`
    SELECT h.id, h.applicant_name, h.group_name, h.action_type, h.action_label,
           h.details, DATE_FORMAT(h.created_at, '%d.%m.%Y %H:%i') AS action_date,
           old_group.name AS previous_group_name
    FROM applicant_action_history h
    LEFT JOIN student_groups old_group
      ON old_group.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(h.details, '$.previousGroupId')) AS UNSIGNED)
    WHERE h.created_at >= ? AND h.created_at < ?
    ORDER BY h.created_at, h.id
  `, [range.start, range.end])

  const actions = actionRows
    .filter((action) => REPORTED_ACTION_TYPES.has(action.action_type))
    .map((action) => {
      const details = parseJson(action.details)
      return {
        id: action.id,
        date: action.action_date,
        applicant: action.applicant_name,
        group_name: action.group_name,
        description: getActionDescription({ ...action, previous_group_name: action.previous_group_name }, details)
      }
    })

  return {
    title: 'Контингент відділення електроніки та програмування',
    reportDate,
    actionsMonth: range.label,
    courses: [...coursesByNumber.values()]
      .sort((a, b) => a.courseNumber - b.courseNumber || a.course.localeCompare(b.course, 'uk'))
      .map((course) => ({
        ...course,
        groups: course.groups.sort((a, b) => a.name.localeCompare(b.name, 'uk'))
      })),
    totals,
    actions
  }
}

export async function createContingentReport(req, res) {
  try {
    await ensureContingentReportsTable()
    const report = await buildReportSnapshot()
    const pdf = await makeContingentPdf(report)
    const title = `${report.title} на ${report.reportDate}`
    const [result] = await pool.query(
      `INSERT INTO contingent_reports (title, snapshot_date, actions_month, report_data, pdf_data)
       VALUES (?, ?, ?, ?, ?)`,
      [
        title,
        `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`,
        report.actionsMonth,
        JSON.stringify(report),
        pdf
      ]
    )
    res.status(201).json({
      id: result.insertId,
      title,
      report_date: report.reportDate,
      actions_month: report.actionsMonth,
      total: report.totals.total,
      created_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('ПОМИЛКА ФОРМУВАННЯ ЗВІТУ КОНТИНГЕНТУ:', error)
    res.status(500).json({ message: 'Не вдалося сформувати звіт контингенту', code: error.code })
  }
}

export async function getContingentReports(req, res) {
  try {
    await ensureContingentReportsTable()
    const [rows] = await pool.query(`
      SELECT id, title, DATE_FORMAT(snapshot_date, '%Y-%m-%d') AS snapshot_date, actions_month, created_at,
             JSON_UNQUOTE(JSON_EXTRACT(report_data, '$.totals.total')) AS total
      FROM contingent_reports
      ORDER BY created_at DESC, id DESC
    `)
    res.json(rows)
  } catch (error) {
    console.error('ПОМИЛКА ОТРИМАННЯ ЗВІТІВ КОНТИНГЕНТУ:', error)
    res.status(500).json({ message: 'Не вдалося завантажити звіти контингенту', code: error.code })
  }
}

export async function downloadContingentReport(req, res) {
  try {
    const reportId = Number(req.params.id)
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ message: 'Невірний номер звіту' })
    }

    await ensureContingentReportsTable()
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(snapshot_date, '%Y-%m-%d') AS snapshot_date, pdf_data
       FROM contingent_reports WHERE id = ? LIMIT 1`,
      [reportId]
    )
    if (!rows.length) return res.status(404).json({ message: 'Звіт не знайдено' })

    res.set('Content-Type', 'application/pdf')
    const snapshotDate = String(rows[0].snapshot_date).slice(0, 10)
    res.set('Content-Disposition', `attachment; filename="contingent-${snapshotDate}.pdf"`)
    res.set('X-Content-Type-Options', 'nosniff')
    res.send(rows[0].pdf_data)
  } catch (error) {
    console.error('ПОМИЛКА ЗАВАНТАЖЕННЯ ЗВІТУ КОНТИНГЕНТУ:', error)
    res.status(500).json({ message: 'Не вдалося завантажити PDF-звіт', code: error.code })
  }
}

export async function deleteContingentReport(req, res) {
  try {
    const reportId = Number(req.params.id)
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ message: 'Невірний номер звіту' })
    }

    await ensureContingentReportsTable()
    const [result] = await pool.query(
      'DELETE FROM contingent_reports WHERE id = ?',
      [reportId]
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Звіт не знайдено' })

    res.json({ message: 'Звіт видалено' })
  } catch (error) {
    console.error('ПОМИЛКА ВИДАЛЕННЯ ЗВІТУ КОНТИНГЕНТУ:', error)
    res.status(500).json({ message: 'Не вдалося видалити звіт контингенту', code: error.code })
  }
}
