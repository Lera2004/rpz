import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import JSZip from 'jszip'
import pool from '../config/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../..')
const templateDirectory = path.resolve(projectRoot, 'uploads')

const REPORT_TYPES = {
  grade5: {
    label: 'Залікова відомість',
    template: 'Залікова 5 бал  РПЗ 23 2 .docx',
    headerRows: 2,
    tableHeader: 'ПІБ студента',
    allowedCourses: [1, 2, 3, 4]
  },
  grade12: {
    label: 'Залікова відомість 12 балів',
    template: 'Залікова 12 бал РПЗ 25 1.docx',
    headerRows: 1,
    tableHeader: 'ПІБ студента',
    allowedCourses: [1, 2]
  },
  summary: {
    label: 'Підсумкова відомість',
    template: 'Підсум.РПЗ 25 1.docx',
    headerRows: 2,
    tableHeader: 'ПІБ студента',
    allowedCourses: [1, 2, 3, 4]
  },
  summary100: {
    label: 'Підсумкова відомість 100 балів',
    template: 'Підсумкова-100-бал-МЕТ-25 (1).docx',
    headerRows: 3,
    tableHeader: 'ПІБ студента',
    numberStart: 1,
    numberColumnWidth: 800,
    allowedCourses: [1, 2, 3, 4]
  },
  summary24: {
    label: 'Підсумкова відомість',
    template: 'Підсум.РПЗ 24 1.doc',
    fallbackTemplate: 'Підсум.РПЗ 25 1.docx',
    headerRows: 2,
    tableHeader: 'ПІБ студента',
    allowedCourses: [2]
  },
  okr: {
    label: 'Відомість результатів ОКР',
    template: 'ОКР.РПЗ 25 1.docx',
    headerRows: 1,
    tableHeader: 'ПІБ студента',
    allowedCourses: [1, 2, 3, 4]
  }
}

const getReportConfig = (type = 'grade5') => REPORT_TYPES[type] || null

const getTemplatePath = (config) => {
  const requestedPath = path.resolve(templateDirectory, config.template)
  return path.extname(requestedPath).toLowerCase() === '.doc'
    ? path.resolve(templateDirectory, config.fallbackTemplate)
    : requestedPath
}

const setSummary100NumberColumnWidth = (table, width) => {
  const widthValue = String(width)
  const grid = table.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0] || ''
  const gridWidths = [...grid.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((match) => Number(match[1]))
  if (gridWidths.length < 2) return table
  const widthDifference = width - gridWidths[0]
  const adjustedTable = table.replace(
    /(<w:tblGrid>[\s\S]*?<w:gridCol w:w=")\d+("\/>)/,
    `$1${widthValue}$2`
  )
  const adjustedWidths = adjustedTable.replace(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/, (gridMarkup) => {
    let gridIndex = 0
    return gridMarkup.replace(/(<w:gridCol w:w=")\d+("\/>)\s*/g, (match, prefix, suffix) => {
      const nextWidth = gridIndex++ === 1 ? gridWidths[1] - widthDifference : gridIndex === 1 ? width : gridWidths[gridIndex - 1]
      return `${prefix}${nextWidth}${suffix}`
    })
  })
  return adjustedWidths.replace(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g, (row) => {
    let cellIndex = 0
    return row.replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, (cell) => {
      if (cellIndex++ !== 0) return cell
      return cell.replace(/(<w:tcW\s+w:w=")\d+("[^>]*>)/, `$1${widthValue}$2`)
    })
  })
}

const xmlEscape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const decodeXml = (value) => String(value ?? '')
  .replace(/&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&gt;/g, '>')
  .replace(/&lt;/g, '<')
  .replace(/&amp;/g, '&')

const getTables = (xml) => [...xml.matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g)].map((match) => match[0])
const getRows = (table) => [...table.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((match) => match[0])
const getCells = (row) => [...row.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map((match) => match[0])

const getCellText = (cell) => decodeXml([...cell.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join(''))

const replaceCellTextMatch = (cell, pattern, replacement) => {
  const nodes = [...cell.matchAll(/<w:t(?:\s([^>]*))?>([\s\S]*?)<\/w:t>/g)].map((node) => ({
    source: node[0],
    attributes: node[1] ? ` ${node[1]}` : '',
    text: decodeXml(node[2]),
    index: node.index
  }))
  const joinedText = nodes.map((node) => node.text).join('')
  const match = joinedText.match(pattern)
  if (!match) return cell

  const start = match.index
  const end = start + match[0].length
  const ranges = []
  let offset = 0
  nodes.forEach((node) => {
    ranges.push({ ...node, start: offset, end: offset + node.text.length })
    offset += node.text.length
  })

  let updatedCell = cell
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const node = ranges[index]
    const overlapStart = Math.max(start, node.start)
    const overlapEnd = Math.min(end, node.end)
    if (overlapStart >= overlapEnd) continue

    const localStart = overlapStart - node.start
    const localEnd = overlapEnd - node.start
    const value = node.text.slice(0, localStart) + (overlapStart === start ? replacement : '') + node.text.slice(localEnd)
    const replacementNode = `<w:t${node.attributes}>${xmlEscape(value)}</w:t>`
    updatedCell = `${updatedCell.slice(0, node.index)}${replacementNode}${updatedCell.slice(node.index + node.source.length)}`
  }

  return updatedCell
}

const replaceTextAfterLabel = (container, label, replacement) => {
  const nodes = [...container.matchAll(/<w:t(?:\s([^>]*))?>([\s\S]*?)<\/w:t>/g)].map((node) => ({
    source: node[0],
    attributes: node[1] ? ` ${node[1]}` : '',
    text: decodeXml(node[2]),
    index: node.index
  }))
  const joinedText = nodes.map((node) => node.text).join('')
  const labelIndex = joinedText.indexOf(label)
  if (labelIndex < 0) return container

  const contentStart = labelIndex + label.length
  const valueStart = contentStart + (joinedText.slice(contentStart).match(/^\s*/u)?.[0].length || 0)
  const ranges = []
  let offset = 0
  nodes.forEach((node) => {
    ranges.push({ ...node, start: offset, end: offset + node.text.length })
    offset += node.text.length
  })

  let updated = container
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const node = ranges[index]
    const overlapStart = Math.max(valueStart, node.start)
    const overlapEnd = Math.min(joinedText.length, node.end)
    if (overlapStart >= overlapEnd) continue

    const localStart = overlapStart - node.start
    const localEnd = overlapEnd - node.start
    const value = node.text.slice(0, localStart) + (overlapStart === valueStart ? replacement : '') + node.text.slice(localEnd)
    const replacementNode = `<w:t${node.attributes}>${xmlEscape(value)}</w:t>`
    updated = `${updated.slice(0, node.index)}${replacementNode}${updated.slice(node.index + node.source.length)}`
  }

  return updated
}

const updateStatementHeader = (xml, group) => {
  const specialty = String(group.specialty || '').trim()
  const groupName = String(group.name || '').trim()
  const course = String(group.course || '').trim()

  return xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = getCellText(paragraph)
    let updatedParagraph = paragraph

    if (groupName && /група/iu.test(text)) {
      updatedParagraph = replaceCellTextMatch(
        updatedParagraph,
        /група\s+.*?(?=\s+спеціальність|\s+\(|$)/iu,
        `група ${groupName}`
      )
    }

    if (specialty && /спеціальність/iu.test(text)) {
      updatedParagraph = replaceCellTextMatch(
        updatedParagraph,
        /спеціальність\s+.*?(?=\s+\(|$)/iu,
        `спеціальність ${specialty}`
      )
    }

    if (course && /курс\s+група/iu.test(text)) {
      updatedParagraph = replaceCellTextMatch(updatedParagraph, /курс\s+група/iu, `курс ${course} група`)
    }

    return updatedParagraph
  })
}

const makeTextParagraph = (cell, value, options = {}) => {
  const paragraph = cell.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/)?.[0]
  let paragraphProperties = paragraph?.match(/<w:pPr[\s\S]*?<\/w:pPr>/)?.[0] || ''
  if (options.removeNumbering) {
    paragraphProperties = paragraphProperties.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/g, '')
  }
  if (options.plainParagraph) {
    paragraphProperties = paragraphProperties
      .replace(/<w:pStyle[^>]*\/?>/g, '')
      .replace(/<w:ind[^>]*\/?>/g, '')
      .replace(/<w:ind[^>]*>[\s\S]*?<\/w:ind>/g, '')
  }
  if (options.studentParagraph) {
    paragraphProperties = paragraphProperties.replace(/<w:spacing[^>]*\/?>/g, '')
    paragraphProperties = paragraphProperties.replace(/<w:spacing[^>]*>[\s\S]*?<\/w:spacing>/g, '')
  }
  if (options.alignLeft) {
    paragraphProperties = paragraphProperties.replace(/<w:jc[^>]*\/>/g, '<w:jc w:val="left"/>')
    paragraphProperties = paragraphProperties.replace(/<w:ind[^>]*\/>/g, '')
  }
  if (options.alignCenter) {
    paragraphProperties = paragraphProperties.replace(/<w:jc[^>]*\/>/g, '<w:jc w:val="center"/>')
    if (!paragraphProperties.includes('<w:jc')) {
      paragraphProperties += '<w:jc w:val="center"/>'
    }
  }
  const runProperties = paragraph?.match(/<w:rPr[\s\S]*?<\/w:rPr>/)?.[0] || ''
  const text = xmlEscape(value)

  return `<w:p>${paragraphProperties}<w:r>${runProperties}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

const replaceCellText = (cell, value, options = {}) => {
  let cellProperties = cell.match(/<w:tcPr(?:\s[^>]*)?>[\s\S]*?<\/w:tcPr>/)?.[0] || ''
  if (options.noWrapCell && !cellProperties.includes('<w:noWrap')) {
    cellProperties = cellProperties.replace('</w:tcPr>', '<w:noWrap/></w:tcPr>')
  }
  return `<w:tc>${cellProperties}${makeTextParagraph(cell, value, options)}</w:tc>`
}

const updateStudentRow = (row, student, index, numberStart = 1) => {
  const cells = getCells(row)
  if (cells.length < 3) return row

  const values = [String(index + numberStart), student.applicant || '', student.inp_number || '']
  const normalizedRow = row.replace(/<w:trHeight[^>]*\/?>/g, '').replace(/<w:trHeight[^>]*>[\s\S]*?<\/w:trHeight>/g, '')
  const updatedCells = cells.map((cell, cellIndex) => {
    if (cellIndex === 0) return replaceCellText(cell, values[0], { removeNumbering: true, plainParagraph: true, studentParagraph: true, alignCenter: true, noWrapCell: true })
    if (cellIndex === 1) return replaceCellText(cell, values[1], { studentParagraph: true })
    if (cellIndex === 2) return replaceCellText(cell, values[2], { studentParagraph: true })
    return cell
      .replace(/<w:spacing[^>]*\/>/g, '')
      .replace(/<w:spacing[^>]*>[\s\S]*?<\/w:spacing>/g, '')
  })

  let cursor = 0
  return normalizedRow.replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, () => updatedCells[cursor++])
}

const getStudents = async (groupId) => {
  const [columns] = await pool.query("SHOW COLUMNS FROM group_applicants LIKE 'inp_number'")
  const hasInpNumber = columns.length > 0
  const inpSelect = hasInpNumber ? ', inp_number' : ''
  const [rows] = await pool.query(`
    SELECT applicant${inpSelect}
    FROM group_applicants
    WHERE group_id = ?
      AND (id IS NOT NULL AND (status IS NULL OR LOWER(TRIM(status)) IN ('active', 'активний', 'активний студент', 'повернено з академвідпустки')))
    ORDER BY applicant
  `, [groupId])
  return rows.sort((first, second) => String(first.applicant || '').localeCompare(String(second.applicant || ''), 'uk'))
}

export const buildStatementDocument = async (students, group = {}) => {
  return buildReportDocument('grade5', students, group)
}

export const buildReportDocument = async (reportType, students, group = {}) => {
  const config = getReportConfig(reportType)
  if (!config) throw new Error('Невідомий тип відомості.')

  const templatePath = getTemplatePath(config)
  const zip = await JSZip.loadAsync(await fs.readFile(templatePath))
  const documentFile = zip.file('word/document.xml')
  if (!documentFile) throw new Error('У шаблоні не знайдено основний Word-документ.')

  const originalXml = updateStatementHeader(await documentFile.async('string'), group)
  const tables = getTables(originalXml)
  const tableIndex = tables.findIndex((table) => {
    const text = getCellText(table)
    return text.includes(config.tableHeader)
  })
  if (tableIndex < 0) throw new Error('У шаблоні не знайдено таблицю студентів.')

  const table = tables[tableIndex]
  const adjustedTable = reportType === 'summary100'
    ? setSummary100NumberColumnWidth(table, config.numberColumnWidth)
    : table
  const rows = getRows(adjustedTable)
  const firstStudentRow = config.headerRows
  const templateStudentRows = rows.slice(firstStudentRow)
  if (!templateStudentRows.length) throw new Error('У таблиці шаблону не знайдено рядки студентів.')

  const templateStudentRow = templateStudentRows[0]
  const studentRows = students.map((student, index) => updateStudentRow(templateStudentRow, student, index, config.numberStart ?? 1))
  const replacementRows = [...rows.slice(0, firstStudentRow), ...studentRows]
  const firstRowOffset = adjustedTable.indexOf(rows[0])
  const lastRowOffset = adjustedTable.lastIndexOf(rows[rows.length - 1])
  const tablePrefix = adjustedTable.slice(0, firstRowOffset)
  const tableSuffix = adjustedTable.slice(lastRowOffset + rows[rows.length - 1].length)
  const updatedTable = `${tablePrefix}${replacementRows.join('')}${tableSuffix}`
  const updatedXml = originalXml.replace(table, updatedTable)

  zip.file('word/document.xml', updatedXml)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

export async function getStatementGroups(req, res) {
  try {
    const [groups] = await pool.query(`
      SELECT sg.id, sg.name, sg.specialty, sg.course,
        SUM(CASE WHEN ga.id IS NOT NULL AND (ga.status IS NULL OR LOWER(TRIM(ga.status)) IN ('active', 'активний', 'активний студент', 'повернено з академвідпустки')) THEN 1 ELSE 0 END) AS student_count
      FROM student_groups sg
      LEFT JOIN group_applicants ga ON ga.group_id = sg.id
      GROUP BY sg.id
      ORDER BY sg.name
    `)
    res.json(groups)
  } catch (error) {
    res.status(500).json({ message: 'Не вдалося завантажити групи для відомостей.', code: error.code })
  }
}

export async function exportStatement(req, res) {
  return exportReport(req, res, 'grade5')
}

export async function exportReport(req, res) {
  try {
    const groupId = Number(req.params.groupId)
    const reportType = req.params.reportType || 'grade5'
    const config = getReportConfig(reportType)
    if (!groupId) return res.status(400).json({ message: 'Невірний ідентифікатор групи.' })
    if (!config) return res.status(400).json({ message: 'Невідомий тип відомості.' })

    const [[group]] = await pool.query('SELECT id, name, specialty, course FROM student_groups WHERE id = ? LIMIT 1', [groupId])
    if (!group) return res.status(404).json({ message: 'Групу не знайдено.' })

    if (!config.allowedCourses.includes(Number(group.course))) {
      return res.status(400).json({ message: 'Ця відомість недоступна для курсу групи.' })
    }

    const students = await getStudents(groupId)
    if (students.length > 30) {
      return res.status(400).json({ message: 'У відомості можна додати не більше 30 студентів.' })
    }
    const output = await buildReportDocument(reportType, students, group)
    const fileName = `${config.label} ${group.name}.docx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
    res.send(output)
  } catch (error) {
    console.error('ПОМИЛКА ЕКСПОРТУ ВІДОМОСТІ:', error)
    res.status(500).json({ message: error.message || 'Не вдалося сформувати відомість.' })
  }
}
