import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import ExcelJS from 'exceljs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '../..')
const uploadsRoot = path.resolve(projectRoot, 'uploads')

const templatePath = path.resolve(
  uploadsRoot,
  'Басок_Pednavantazhennia_blank_28_08_2025.xlsx'
)

const columns = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function cloneStyle(style) {
  if (!style) {
    return undefined
  }

  return JSON.parse(JSON.stringify(style))
}

function buildTemplateStyles(sheet) {
  const styles = new Map()

  Object.keys(sheet).forEach(cellRef => {
    if (/^[A-Z]+\d+$/.test(cellRef) && sheet[cellRef]?.s) {
      styles.set(cellRef, cloneStyle(sheet[cellRef].s))
    }
  })

  return styles
}

function applyTemplateStyle(cell, cellRef, templateStyles) {
  const templateStyle = templateStyles?.get(cellRef)

  if (templateStyle) {
    cell.s = cloneStyle(templateStyle)
  }

  return cell
}

function applyRotatedHeaderStyles(sheet) {
  const rotatedHeaderColumns = new Set([
    'A', 'C', 'D', 'E', 'F', 'G', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y'
  ])

  for (const columnLetter of rotatedHeaderColumns) {
    for (const rowNumber of [13, 14]) {
      const cellRef = `${columnLetter}${rowNumber}`
      const existingCell = sheet[cellRef] || {}
      const style = cloneStyle(existingCell.s) || {}

      style.alignment = {
        ...(style.alignment || {}),
        vertical: 'center',
        horizontal: 'center',
        wrapText: true,
        textRotation: 90
      }

      style.font = {
        ...(style.font || {}),
        name: style.font?.name || 'Calibri',
        sz: 9
      }

      existingCell.s = style
      sheet[cellRef] = existingCell
    }
  }
}

function inheritTemplateStyle(sheet, cellRef) {
  const refMatch = cellRef.match(/^([A-Z]+)(\d+)$/)

  if (!refMatch) {
    return
  }

  const [, columnLetters, rowNumberText] = refMatch
  const rowNumber = Number(rowNumberText)

  const candidates = [
    `${columnLetters}${rowNumber}`,
    `${columnLetters}15`,
    `${columnLetters}14`,
    `A${rowNumber}`,
    'A15',
    'A14'
  ]

  for (const candidate of candidates) {
    const sourceCell = sheet[candidate]
    if (sourceCell && sourceCell.s) {
      return cloneStyle(sourceCell.s)
    }
  }

  return undefined
}

function findStyleSourceCell(sheet, cellRef) {
  const match = cellRef.match(/^([A-Z]+)(\d+)$/)

  if (!match) {
    return undefined
  }

  const columnLetters = match[1]
  const rowNumber = Number(match[2])

  const styleRow = rowNumber >= 15 ? 15 : 14
  const sameColumnRef = `${columnLetters}${rowNumber}`
  const sameColumnStyle = sheet[sameColumnRef]?.s

  if (sameColumnStyle) {
    return sheet[sameColumnRef]
  }

  const rowAnchorRef = `${columnLetters}${styleRow}`
  const anchorCell = sheet[rowAnchorRef]

  if (anchorCell?.s) {
    return anchorCell
  }

  const fallbackRef = `A${styleRow}`
  return sheet[fallbackRef]
}

function setCellValue(sheet, cellRef, value, templateStyles = null) {
  const existingCell = sheet[cellRef] || {}

  if (value === null || value === undefined || value === '') {
    existingCell.v = ''
    existingCell.t = 's'

    if (existingCell.f) {
      delete existingCell.f
    }

    applyTemplateStyle(existingCell, cellRef, templateStyles)
    sheet[cellRef] = existingCell
    return
  }

  const numeric = typeof value === 'number' && Number.isFinite(value)

  if (!existingCell.s) {
    const inheritedStyle = inheritTemplateStyle(sheet, cellRef)
    if (inheritedStyle) {
      existingCell.s = cloneStyle(inheritedStyle)
    }
  }

  applyTemplateStyle(existingCell, cellRef, templateStyles)

  existingCell.v = value
  existingCell.t = numeric ? 'n' : 's'

  if (existingCell.f) {
    delete existingCell.f
  }

  sheet[cellRef] = existingCell
}

function clearRowRange(sheet, startRow, endRow, startCol, endCol, templateStyles = null) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: row - 1, c: col })
      const cell = sheet[cellRef]

      if (!cell) {
        continue
      }

      cell.v = ''
      cell.t = 's'

      if (cell.f) {
        delete cell.f
      }

      applyTemplateStyle(cell, cellRef, templateStyles)
      sheet[cellRef] = cell
    }
  }
}

function normalizeSemester(value) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return ''
  }

  return numericValue % 2 === 0 ? 2 : 1
}

function normaliseCellNumber(value) {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  const numericValue = Number(value)

  if (!Number.isFinite(numericValue) || numericValue === 0) {
    return ''
  }

  return numericValue
}

function formatTeacherShortName(fullName) {
  const cleanName = String(fullName || '').trim()

  if (!cleanName) {
    return ''
  }

  const parts = cleanName.split(/\s+/).filter(Boolean)

  if (parts.length >= 3) {
    const [lastName, firstName, middleName] = parts
    return `${lastName} ${firstName[0]}.${middleName[0]}.`
  }

  if (parts.length === 2) {
    const [lastName, firstName] = parts
    return `${lastName} ${firstName[0]}.`
  }

  return cleanName
}

function buildTitleText(workload) {
  const teacherFullName = workload?.teacher?.full_name || ''
  const teacherShortName = formatTeacherShortName(teacherFullName)
  const commissionName = workload?.teacher?.commission_name || 'спеціальності 121'
  const academicYear = workload?.studyPlan?.academic_year || '2025-2026'

  return `Педагогічне навантаження викладача ${teacherShortName} циклової комісії ${commissionName} на ${academicYear} н.р.`
}

function buildRowValues(row, index) {
  const values = Array(25).fill('')

  values[0] = row.code || ''
  values[1] = row.group || ''
  values[2] = normaliseCellNumber(row.studentsCount)
  values[3] = normaliseCellNumber(row.course)
  values[4] = normalizeSemester(row.semester)
  values[5] = normaliseCellNumber(row.semesterWeeks)
  values[6] = normaliseCellNumber(row.hoursPerWeek)
  values[7] = row.name || ''
  values[8] = normaliseCellNumber(row.totalHours)
  values[9] = normaliseCellNumber(row.contactHours)
  values[10] = normaliseCellNumber(row.lectures)
  values[11] = normaliseCellNumber(row.practical)
  values[12] = normaliseCellNumber(row.laboratory)
  values[13] = normaliseCellNumber(row.seminars)
  values[14] = normaliseCellNumber(row.selfStudy)
  values[15] = normaliseCellNumber(row.otherWorkHours)
  values[16] = ''
  values[17] = normaliseCellNumber(row.courseWorkExecution)
  values[18] = normaliseCellNumber(row.courseWorkDefense)
  values[19] = normaliseCellNumber(row.okrHours)
  values[20] = normaliseCellNumber(row.controlWorks)
  values[21] = normaliseCellNumber(row.creditAcceptanceHours)
  values[22] = normaliseCellNumber(row.examConsultationHours)
  values[23] = normaliseCellNumber(row.examAcceptanceHours)
  values[24] = normaliseCellNumber(row.officialHours)

  return values
}

function countBorderedCells(sheet) {
  let count = 0

  sheet.eachRow({ includeEmpty: true }, row => {
    row.eachCell({ includeEmpty: true }, cell => {
      const border = cell.border || {}
      if (Object.values(border).some(side => side?.style)) count += 1
    })
  })

  return count
}

function buildFormattingDiagnostics(sheet) {
  const rotatedHeaders = ['A13', 'C13', 'D13', 'A14', 'C14', 'D14'].map(ref => ({
    ref,
    textRotation: sheet.getCell(ref).alignment?.textRotation || 0
  }))

  const keyCells = ['A13', 'C13', 'A15', 'K5', 'A9']
  const cells = Object.fromEntries(keyCells.map(ref => {
    const cell = sheet.getCell(ref)
    return [ref, {
      styleId: cell.styleId,
      alignment: cell.alignment,
      font: cell.font,
      fill: cell.fill,
      border: cell.border,
      numFmt: cell.numFmt,
      value: cell.value
    }]
  }))

  return {
    mergedCells: sheet.model.merges.length,
    borderedCells: countBorderedCells(sheet),
    rotatedHeaders,
    columns: sheet.columns.slice(0, 12).map(column => ({
      width: column.width,
      hidden: column.hidden
    })),
    rows: [5, 13, 14, 15, 34, 40, 57].map(number => ({
      number,
      height: sheet.getRow(number).height,
      hidden: sheet.getRow(number).hidden
    })),
    pageSetup: sheet.pageSetup,
    pageMargins: sheet.pageMargins,
    printArea: sheet.pageSetup?.printArea,
    printTitlesRow: sheet.pageSetup?.printTitlesRow,
    printTitlesColumn: sheet.pageSetup?.printTitlesColumn,
    cells
  }
}

function setExcelJsCellValue(sheet, cellRef, value) {
  const cell = sheet.getCell(cellRef)
  cell.value = value === '' || value === null || value === undefined ? null : value
}

export async function exportWorkloadToExcel(workload) {
  if (!workload || !workload.teacher) {
    throw new Error('Немає даних для експорту навантаження.')
  }

  const rows = Array.isArray(workload.rows) ? workload.rows : []

  if (rows.length > 21) {
    throw new Error('Кількість рядків навантаження перевищує розмір шаблону A15:Y35.')
  }

  await fs.access(templatePath)

  const fileBuffer = await fs.readFile(templatePath)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(fileBuffer)

  const sheet = workbook.getWorksheet('Басок') || workbook.worksheets[0]

  if (!sheet) {
    throw new Error('Аркуш шаблону не знайдено.')
  }

  const beforeDiagnostics = buildFormattingDiagnostics(sheet)

  for (let rowNumber = 15; rowNumber <= 35; rowNumber += 1) {
    for (let columnNumber = 1; columnNumber <= 25; columnNumber += 1) {
      sheet.getCell(rowNumber, columnNumber).value = null
    }
  }

  const titleText = buildTitleText(workload)
  const teacherShortName = formatTeacherShortName(workload.teacher.full_name || '')

  setExcelJsCellValue(sheet, 'K5', Number(workload.summary?.orderHours ?? workload.summary?.officialHours ?? 0))
  setExcelJsCellValue(sheet, 'A9', titleText)
  setExcelJsCellValue(sheet, 'F9', teacherShortName)

  rows.forEach((row, index) => {
    const excelRowNumber = 15 + index
    const values = buildRowValues(row, index)

    values.forEach((value, columnIndex) => {
      const letter = columns[columnIndex]
      setExcelJsCellValue(sheet, `${letter}${excelRowNumber}`, value)
    })
  })

  const afterDiagnostics = buildFormattingDiagnostics(sheet)
  console.log('[WORKLOAD EXPORT FORMATTING]', JSON.stringify({
    before: beforeDiagnostics,
    after: afterDiagnostics,
    preserved: {
      mergedCells: beforeDiagnostics.mergedCells === afterDiagnostics.mergedCells,
      borderedCells: beforeDiagnostics.borderedCells === afterDiagnostics.borderedCells,
      rotatedHeaders: beforeDiagnostics.rotatedHeaders.every((header, index) => header.textRotation === afterDiagnostics.rotatedHeaders[index].textRotation),
      columns: JSON.stringify(beforeDiagnostics.columns) === JSON.stringify(afterDiagnostics.columns),
      rows: JSON.stringify(beforeDiagnostics.rows) === JSON.stringify(afterDiagnostics.rows),
      pageSetup: JSON.stringify(beforeDiagnostics.pageSetup) === JSON.stringify(afterDiagnostics.pageSetup)
    }
  }, null, 2))

  return workbook.xlsx.writeBuffer({ useStyles: true, useSharedStrings: true })
}
