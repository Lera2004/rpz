import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import JSZip from 'jszip'
import pool from '../config/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../..')
const templateDirectory = path.resolve(projectRoot, 'uploads')
const customTemplateDirectory = path.resolve(templateDirectory, 'statement_templates')
const PROGRAMS = {
  software: 'Розробка програмного забезпечення',
  electronics: 'Інтелектуальні технології мікросистемної радіоелектронної техніки'
}

const REPORT_TYPES = {
  grade5: {
    label: 'Залікова відомість',
    template: 'Залікова 5 бал  РПЗ 25 1.docx',
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
    template: 'Підсумкова 100 бал МЕТ 25.docx',
    headerRows: 3,
    tableHeader: 'ПІБ студента',
    numberStart: 1,
    numberColumnWidth: 800,
    numberFontSize: 22,
    numberLineSpacing: 300,
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

const getTemplatePath = async (reportType, config) => {
  const customPath = path.resolve(customTemplateDirectory, `${reportType}.docx`)
  try {
    await fs.access(customPath)
    return customPath
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const requestedPath = path.resolve(templateDirectory, config.template)
  return path.extname(requestedPath).toLowerCase() === '.doc'
    ? path.resolve(templateDirectory, config.fallbackTemplate)
    : requestedPath
}

const xmlEscape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const normalizeFilenameEncoding = (value) => {
  const filename = String(value || '')
  if (!/[ÃÐÑ]/.test(filename)) return filename

  const decodedFilename = Buffer.from(filename, 'latin1').toString('utf8')
  return decodedFilename.includes('\uFFFD') ? filename : decodedFilename
}

const decodeXml = (value) => String(value ?? '')
  .replace(/&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&gt;/g, '>')
  .replace(/&lt;/g, '<')
  .replace(/&amp;/g, '&')

const getTables = (xml) => [...xml.matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g)].map((match) => match[0])
const getRows = (table) => [...table.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((match) => match[0])
const getCells = (row) => [...row.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map((match) => match[0])
const getRowStructure = (row) => getCells(row).map((cell) => {
  const properties = cell.match(/<w:tcPr(?:\s[^>]*)?>[\s\S]*?<\/w:tcPr>/)?.[0] || ''
  const gridSpan = properties.match(/<w:gridSpan\b[^>]*\bw:val="(\d+)"/)?.[1] || '1'
  const horizontalMerge = properties.match(/<w:hMerge\b[^>]*\bw:val="([^"]+)"/)?.[1] || 'none'
  const verticalMerge = properties.match(/<w:vMerge\b[^>]*\bw:val="([^"]+)"/)?.[1] || 'none'
  return `${gridSpan}:${horizontalMerge}:${verticalMerge}`
}).join('|')

const getCellText = (cell) => decodeXml([...cell.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join(''))

const replaceTextRange = (container, start, end, replacement) => {
  const nodes = [...container.matchAll(/<w:t(?:\s([^>]*))?>([\s\S]*?)<\/w:t>/g)].map((node) => ({
    source: node[0],
    attributes: node[1] ? ` ${node[1]}` : '',
    text: decodeXml(node[2]),
    index: node.index
  }))
  const ranges = []
  let offset = 0
  nodes.forEach((node) => {
    ranges.push({ ...node, start: offset, end: offset + node.text.length })
    offset += node.text.length
  })

  if (start === end) {
    const target = ranges.find((node) => node.start <= start && node.end >= start)
    if (!target) return container
    const localOffset = start - target.start
    const value = target.text.slice(0, localOffset) + replacement + target.text.slice(localOffset)
    const replacementNode = `<w:t${target.attributes}>${xmlEscape(value)}</w:t>`
    return `${container.slice(0, target.index)}${replacementNode}${container.slice(target.index + target.source.length)}`
  }

  let updated = container
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const node = ranges[index]
    const overlapStart = Math.max(start, node.start)
    const overlapEnd = Math.min(end, node.end)
    if (overlapStart >= overlapEnd) continue

    const localStart = overlapStart - node.start
    const localEnd = overlapEnd - node.start
    const value = node.text.slice(0, localStart) +
      (overlapStart === start ? replacement : '') +
      node.text.slice(localEnd)
    const replacementNode = `<w:t${node.attributes}>${xmlEscape(value)}</w:t>`
    updated = `${updated.slice(0, node.index)}${replacementNode}${updated.slice(node.index + node.source.length)}`
  }

  return updated
}

const removeRunUnderline = (runProperties) => runProperties
  .replace(/<w:u(?:\s[^>]*)?\/>/g, '')
  .replace(/<w:u(?:\s[^>]*)?>[\s\S]*?<\/w:u>/g, '')

const updateRunProperties = (paragraph, predicate, update) => paragraph.replace(
  /<w:r((?:\s[^>]*)?)>([\s\S]*?)<\/w:r>/g,
  (run, attributes, body) => {
    const text = [...body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((node) => decodeXml(node[1]))
      .join('')
    if (!predicate(text, body)) return run

    const propertiesMatch = body.match(/<w:rPr(?:\s[^>]*)?\/>|<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/)
    const properties = propertiesMatch?.[0] || '<w:rPr/>'
    const updatedProperties = update(properties)
    const updatedBody = propertiesMatch ? body.replace(propertiesMatch[0], '') : body
    return `<w:r${attributes}>${updatedProperties}${updatedBody}</w:r>`
  }
)

const setRunFontSize = (paragraph, value, halfPoints) => updateRunProperties(
  paragraph,
  (text) => text.includes(value),
  (properties) => {
    let updated = properties.replace(/<w:rPr([^>]*)\/>/, '<w:rPr$1></w:rPr>')
    updated = updated.replace(/<w:sz(?:\s[^>]*)?\/>/g, '').replace(/<w:szCs(?:\s[^>]*)?\/>/g, '')
    updated = updated.replace(/<w:sz(?:\s[^>]*)?>[\s\S]*?<\/w:sz>/g, '')
    updated = updated.replace(/<w:szCs(?:\s[^>]*)?>[\s\S]*?<\/w:szCs>/g, '')
    const fontSize = `<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>`
    return updated.replace('</w:rPr>', `${fontSize}</w:rPr>`)
  }
)

const setRunFont = (properties, fontSize) => {
  let updated = properties.replace(/<w:rPr([^>]*)\/>/, '<w:rPr$1></w:rPr>')
  updated = updated
    .replace(/<w:rFonts(?:\s[^>]*)?\/>/g, '')
    .replace(/<w:rFonts(?:\s[^>]*)?>[\s\S]*?<\/w:rFonts>/g, '')
    .replace(/<w:sz(?:\s[^>]*)?\/>/g, '')
    .replace(/<w:szCs(?:\s[^>]*)?\/>/g, '')
    .replace(/<w:sz(?:\s[^>]*)?>[\s\S]*?<\/w:sz>/g, '')
    .replace(/<w:szCs(?:\s[^>]*)?>[\s\S]*?<\/w:szCs>/g, '')
  const fontProperties = '<w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'
  const sizeProperties = `<w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/>`
  return updated.replace('</w:rPr>', `${fontProperties}${sizeProperties}</w:rPr>`)
}

const removeUnderlineFromText = (paragraph, value) => updateRunProperties(
  paragraph,
  (text) => text.includes(value),
  removeRunUnderline
)

const removeCourseTabUnderlines = (paragraph) => {
  let afterCourse = false
  return paragraph.replace(/<w:r((?:\s[^>]*)?)>([\s\S]*?)<\/w:r>/g, (run, attributes, body) => {
    const text = [...body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((node) => decodeXml(node[1]))
      .join('')
    if (!afterCourse && /курс/iu.test(text)) {
      afterCourse = true
      if (/група/iu.test(text)) return run
      return run
    }
    if (afterCourse && /група/iu.test(text)) {
      afterCourse = false
      return run
    }
    if (!afterCourse || !body.includes('<w:tab/>') || text.trim()) return run

    const properties = body.match(/<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/)?.[0]
    if (!properties) return run
    const updatedProperties = removeRunUnderline(properties)
    return `<w:r${attributes}>${body.replace(properties, updatedProperties)}</w:r>`
  })
}

const insertUnderlinedValueAfterLabel = (paragraph, label, value, underline = true) => {
  const runs = [...paragraph.matchAll(/<w:r((?:\s[^>]*)?)>([\s\S]*?)<\/w:r>/g)]
  const labelRun = runs.find((run) => {
    const text = [...run[2].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((node) => decodeXml(node[1]))
      .join('')
    return text.toLocaleLowerCase('uk').includes(label.toLocaleLowerCase('uk'))
  })
  if (!labelRun) return paragraph

  const runBody = labelRun[2]
  const textNodes = [...runBody.matchAll(/<w:t(?:\s([^>]*))?>([\s\S]*?)<\/w:t>/g)]
  const combinedText = textNodes.map((node) => decodeXml(node[2])).join('')
  const labelStart = combinedText.toLocaleLowerCase('uk').indexOf(label.toLocaleLowerCase('uk'))
  if (labelStart < 0) return paragraph

  let offset = 0
  let labelNodeStart = 0
  const labelNode = textNodes.find((node) => {
    const text = decodeXml(node[2])
    const containsLabel = labelStart >= offset && labelStart + label.length <= offset + text.length
    if (containsLabel) labelNodeStart = offset
    offset += text.length
    return containsLabel
  })
  if (!labelNode) return paragraph

  const labelText = decodeXml(labelNode[2])
  const localStart = labelStart - labelNodeStart
  const localEnd = localStart + label.length
  const prefixText = labelText.slice(0, localEnd)
  const suffixText = labelText.slice(localEnd)
  const beforeNode = runBody.slice(0, labelNode.index)
  const afterNode = runBody.slice(labelNode.index + labelNode[0].length)
  const attributes = labelNode[1] ? ` ${labelNode[1]}` : ''
  const prefixNode = prefixText ? `<w:t${attributes}>${xmlEscape(prefixText)}</w:t>` : ''
  const suffixNode = suffixText ? `<w:t${attributes}>${xmlEscape(suffixText)}</w:t>` : ''
  const originalRunProperties = runBody.match(/<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/)?.[0] || ''
  const underlineRun = runs.find((run) =>
    /<w:u(?:\s[^>]*)?\/?>/.test(run[2]) &&
    [...run[2].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].some((node) => decodeXml(node[1]).trim())
  )
  const valueRunProperties = underlineRun?.[2].match(/<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/)?.[0] ||
    '<w:rPr><w:u w:val="single"/></w:rPr>'
  const appliedValueRunProperties = underline ? valueRunProperties : removeRunUnderline(valueRunProperties)
  const prefixRun = `${beforeNode.replace(originalRunProperties, '')}${prefixNode}`
  const suffixRun = `${suffixNode}${afterNode}`
  const replacementRun = `<w:r>${appliedValueRunProperties}<w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r>`
  const rebuiltRun = [
    prefixRun ? `<w:r${labelRun[1]}>${originalRunProperties}${prefixRun}</w:r>` : '',
    replacementRun,
    suffixRun ? `<w:r${labelRun[1]}>${originalRunProperties}${suffixRun}</w:r>` : ''
  ].join('')
  return `${paragraph.slice(0, labelRun.index)}${rebuiltRun}${paragraph.slice(labelRun.index + labelRun[0].length)}`
}

const replaceValueAfterLabel = (paragraph, label, value, stopLabels = [], options = {}) => {
  const nodes = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
  const joinedText = nodes.map((node) => decodeXml(node[1])).join('')
  const labelIndex = joinedText.toLocaleLowerCase('uk').indexOf(label.toLocaleLowerCase('uk'))
  if (labelIndex < 0) return paragraph

  const contentStart = labelIndex + label.length
  let end = joinedText.length
  for (const stopLabel of stopLabels) {
    const stopIndex = joinedText.toLocaleLowerCase('uk').indexOf(stopLabel.toLocaleLowerCase('uk'), contentStart)
    if (stopIndex >= 0) end = Math.min(end, stopIndex)
  }

  const content = joinedText.slice(contentStart, end)
  const leadingSpace = content.match(/^\s*/u)?.[0].length || 0
  const trailingSpace = content.match(/\s*$/u)?.[0].length || 0
  const start = contentStart + leadingSpace
  const valueEnd = Math.max(start, end - trailingSpace)
  let updatedParagraph = start === valueEnd
    ? insertUnderlinedValueAfterLabel(paragraph, label, value, options.underline !== false)
    : replaceTextRange(paragraph, start, valueEnd, value)
  if (options.underline === false) {
    updatedParagraph = removeUnderlineFromText(updatedParagraph, value)
    if (label.toLocaleLowerCase('uk') === 'курс') updatedParagraph = removeCourseTabUnderlines(updatedParagraph)
  }
  if (options.fontSize) updatedParagraph = setRunFontSize(updatedParagraph, value, options.fontSize)
  return updatedParagraph
}

const replaceValueBeforeLabel = (paragraph, label, value, stopLabels = [], fallbackOptions = {}) => {
  const runs = [...paragraph.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)]
  const runRanges = []
  let textOffset = 0
  for (const run of runs) {
    const text = [...run[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((node) => decodeXml(node[1]))
      .join('')
    runRanges.push({
      start: textOffset,
      end: textOffset + text.length,
      underlined: /<w:u(?:\s[^>]*)?(?:\/>|>)/.test(run[1]) && !/<w:u\b[^>]*w:val="none"/.test(run[1])
    })
    textOffset += text.length
  }

  const joinedText = runs.flatMap((run) =>
    [...run[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((node) => decodeXml(node[1]))
  ).join('')
  const labelIndex = joinedText.toLocaleLowerCase('uk').indexOf(label.toLocaleLowerCase('uk'))
  if (labelIndex < 0) return paragraph

  const prefix = joinedText.slice(0, labelIndex)
  const lowerPrefix = prefix.toLocaleLowerCase('uk')
  const segmentStart = stopLabels.reduce((start, stopLabel) => {
    const stopIndex = lowerPrefix.lastIndexOf(stopLabel.toLocaleLowerCase('uk'))
    return stopIndex < 0 ? start : Math.max(start, stopIndex + stopLabel.length)
  }, 0)
  const segment = prefix.slice(segmentStart)
  const placeholder = segment.match(/[\s_]+$/u)
  if (placeholder) {
    const start = labelIndex - placeholder[0].length
    const hasUnderlinedPlaceholder = runRanges.some((range) =>
      range.start < labelIndex && range.end > start && range.underlined
    )
    if (placeholder[0].includes('_') || hasUnderlinedPlaceholder) {
      return replaceTextRange(paragraph, start, labelIndex, `${value} `)
    }
  }

  return replaceValueAfterLabel(paragraph, label, value, stopLabels, fallbackOptions)
}

const formatCourseLabel = (paragraph, course) => {
  const text = getCellText(paragraph)
  const labelIndex = text.toLocaleLowerCase('uk').indexOf('курс')
  if (labelIndex < 0) return paragraph

  const labelEnd = labelIndex + 'курс'.length
  const beforeLabel = text.slice(0, labelIndex).match(/(\d+)\s*$/u)
  if (beforeLabel && beforeLabel[1] === course) {
    return replaceTextRange(paragraph, labelIndex - beforeLabel[0].length, labelEnd, `${course} курс`)
  }

  const afterLabel = /^\s*(\d+)/u.exec(text.slice(labelEnd))
  if (afterLabel && afterLabel[1] === course) {
    return replaceTextRange(paragraph, labelIndex, labelEnd + afterLabel[0].length, `${course} курс`)
  }

  return paragraph
}

const replaceProgramValue = (paragraph, value) => {
  const nodes = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
  const joinedText = nodes.map((node) => decodeXml(node[1])).join('')
  const openingQuote = joinedText.indexOf('«')
  const closingQuote = joinedText.lastIndexOf('»')
  if (openingQuote >= 0 && closingQuote > openingQuote) {
    return replaceTextRange(paragraph, openingQuote + 1, closingQuote, value)
  }
  return replaceValueAfterLabel(paragraph, 'Освітньо-професійна програма', `«${value}»`)
}

const getRunPropertiesForLabel = (paragraph, label, requireUnderline = false) => {
  const run = [...paragraph.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)].find((match) => {
    const text = [...match[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((node) => decodeXml(node[1]))
      .join('')
    return text.toLocaleLowerCase('uk').includes(label.toLocaleLowerCase('uk')) &&
      (!requireUnderline || /<w:u(?:\s[^>]*)?\/?>/.test(match[1]))
  })
  return run?.[1].match(/<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/)?.[0] || ''
}

const makeMetadataParagraph = (sourceParagraph, label, value, labelProperties, valueProperties) => {
  const paragraphProperties = sourceParagraph.match(/<w:pPr(?:\s[^>]*)?>[\s\S]*?<\/w:pPr>/)?.[0] || ''
  return `<w:p>${paragraphProperties}<w:r>${labelProperties}<w:t xml:space="preserve">${xmlEscape(label)} </w:t></w:r><w:r>${valueProperties}<w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r></w:p>`
}

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
  const suppliedProgram = String(
    group.opp ||
    group.opp_name ||
    group.program ||
    group.program_name ||
    group.educational_program ||
    group.educational_program_name ||
    group.educationalProgram ||
    ''
  ).trim()
  const specialtyKey = specialty.toLocaleLowerCase('uk').replace(/[^a-zа-яіїєґ0-9]/g, '')
  const program = suppliedProgram || ((/(?:121|f2)/i.test(specialtyKey) ||
    specialtyKey.includes('інженеріяпрограмногозабезпечення') ||
    specialtyKey.includes('softwareengineering'))
    ? PROGRAMS.software
    : /(?:171|g5)/i.test(specialtyKey) ||
      specialtyKey.includes('електроніка') ||
      specialtyKey.includes('електроннікомунікації')
      ? PROGRAMS.electronics
      : '')
  const isElectronicsSpecialty = program === PROGRAMS.electronics

  let hasProgramLabel = false
  let specialtyParagraph = ''
  let updatedXml = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = getCellText(paragraph)
    let updatedParagraph = paragraph

    if (program && /освітньо[-‑ ]професійна\s+програма|освітньо[-‑ ]професійної\s+програми|опп/iu.test(text)) {
      hasProgramLabel = true
      updatedParagraph = replaceProgramValue(updatedParagraph, program)
      if (isElectronicsSpecialty) updatedParagraph = setRunFontSize(updatedParagraph, program, 22)
    }

    if (groupName && /група/iu.test(text)) {
      updatedParagraph = replaceValueAfterLabel(
        updatedParagraph,
        'група',
        groupName,
        ['спеціальність', 'освітньо-професійна програма', 'опп']
      )
    }

    if (specialty && /спеціальність/iu.test(text)) {
      updatedParagraph = replaceValueAfterLabel(
        updatedParagraph,
        'спеціальність',
        specialty,
        ['освітньо-професійна програма', 'опп'],
        { fontSize: isElectronicsSpecialty ? 22 : undefined }
      )
    }

    if (course && /курс/iu.test(text)) {
      updatedParagraph = formatCourseLabel(
        replaceValueBeforeLabel(
          updatedParagraph,
          'курс',
          course,
          ['група'],
          { underline: false }
        ),
        course
      )
    }

    if (specialty && /спеціальність/iu.test(text)) specialtyParagraph = updatedParagraph

    return updatedParagraph
  })

  if (program && !hasProgramLabel) {
    if (!specialtyParagraph) throw new Error('У шаблоні не знайдено місце для освітньо-професійної програми.')
    const programParagraph = makeMetadataParagraph(
      specialtyParagraph,
      'Освітньо-професійна програма',
      `«${program}»`,
      getRunPropertiesForLabel(specialtyParagraph, 'спеціальність'),
      getRunPropertiesForLabel(specialtyParagraph, specialty, true)
    )
    if (isElectronicsSpecialty) {
      const formattedProgramParagraph = setRunFontSize(programParagraph, program, 22)
      const specialtyOffset = updatedXml.indexOf(specialtyParagraph)
      if (specialtyOffset < 0) throw new Error('Не вдалося знайти заголовок спеціальності у шаблоні.')
      updatedXml = `${updatedXml.slice(0, specialtyOffset)}${specialtyParagraph}${formattedProgramParagraph}${updatedXml.slice(specialtyOffset + specialtyParagraph.length)}`
      return updatedXml
    }
    if (!programParagraph.includes(program)) throw new Error('Не вдалося додати освітньо-професійну програму до шаблону.')
    const specialtyOffset = updatedXml.indexOf(specialtyParagraph)
    if (specialtyOffset < 0) throw new Error('Не вдалося знайти заголовок спеціальності у шаблоні.')
    updatedXml = `${updatedXml.slice(0, specialtyOffset)}${specialtyParagraph}${programParagraph}${updatedXml.slice(specialtyOffset + specialtyParagraph.length)}`
  }

  return updatedXml
}

const makeTextParagraph = (cell, value, options = {}) => {
  const paragraph = cell.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/)?.[0]
  const paragraphAttributes = paragraph?.match(/^<w:p([^>]*)>/)?.[1] || ''
  let paragraphProperties = paragraph?.match(/<w:pPr[\s\S]*?<\/w:pPr>/)?.[0] || ''
  if (options.removeNumbering) {
    paragraphProperties = paragraphProperties
      .replace(/<w:numPr(?:\s[^>]*)?\/>/g, '')
      .replace(/<w:numPr(?:\s[^>]*)?>[\s\S]*?<\/w:numPr>/g, '')
  }
  if (options.plainParagraph) {
    paragraphProperties = paragraphProperties
      .replace(/<w:pStyle(?:\s[^>]*)?\/>/g, '')
      .replace(/<w:pStyle(?:\s[^>]*)?>[\s\S]*?<\/w:pStyle>/g, '')
      .replace(/<w:ind(?:\s[^>]*)?\/>/g, '')
      .replace(/<w:ind(?:\s[^>]*)?>[\s\S]*?<\/w:ind>/g, '')
  }
  if (options.zeroParagraphIndent) {
    paragraphProperties = paragraphProperties
      .replace(/<w:ind(?:\s[^>]*)?\/>/g, '')
      .replace(/<w:ind(?:\s[^>]*)?>[\s\S]*?<\/w:ind>/g, '')
    paragraphProperties = paragraphProperties
      ? paragraphProperties.replace('</w:pPr>', '<w:ind w:left="0" w:firstLine="0"/></w:pPr>')
      : '<w:pPr><w:ind w:left="0" w:firstLine="0"/></w:pPr>'
  }
  if (options.alignCenter) {
    paragraphProperties = paragraphProperties
      .replace(/<w:jc(?:\s[^>]*)?\/>/g, '')
      .replace(/<w:jc(?:\s[^>]*)?>[\s\S]*?<\/w:jc>/g, '')
    paragraphProperties = paragraphProperties
      ? paragraphProperties.replace('</w:pPr>', '<w:jc w:val="center"/></w:pPr>')
      : '<w:pPr><w:jc w:val="center"/></w:pPr>'
  }
  if (options.studentParagraph) {
    paragraphProperties = paragraphProperties
      .replace(/<w:spacing(?:\s[^>]*)?\/>/g, '')
      .replace(/<w:spacing(?:\s[^>]*)?>[\s\S]*?<\/w:spacing>/g, '')
  }
  if (options.numberLineSpacing) {
    paragraphProperties = paragraphProperties
      .replace(/<w:spacing(?:\s[^>]*)?\/>/g, '')
      .replace(/<w:spacing(?:\s[^>]*)?>[\s\S]*?<\/w:spacing>/g, '')
    const spacing = `<w:spacing w:line="${options.numberLineSpacing}" w:lineRule="auto"/>`
    paragraphProperties = paragraphProperties
      ? paragraphProperties.replace('</w:pPr>', `${spacing}</w:pPr>`)
      : `<w:pPr>${spacing}</w:pPr>`
  }
  const runs = [...(paragraph || '').matchAll(/<w:r((?:\s[^>]*)?)>([\s\S]*?)<\/w:r>/g)]
  const firstRun = runs.find((run) =>
    [...run[2].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .some((node) => decodeXml(node[1]).length > 0)
  ) || runs[0]
  let runProperties = firstRun?.[2].match(/<w:rPr(?:\s[^>]*)?\/>|<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/)?.[0] || ''
  if (options.numberFontSize) runProperties = setRunFont(runProperties || '<w:rPr/>', options.numberFontSize)
  const text = xmlEscape(value)

  return `<w:p${paragraphAttributes}>${paragraphProperties}<w:r${firstRun?.[1] || ''}>${runProperties}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

const replaceCellText = (cell, value, options = {}) => {
  const cellAttributes = cell.match(/^<w:tc([^>]*)>/)?.[1] || ''
  let cellProperties = cell.match(/<w:tcPr(?:\s[^>]*)?>[\s\S]*?<\/w:tcPr>/)?.[0] || ''
  if (options.noWrapCell && !cellProperties.includes('<w:noWrap')) {
    cellProperties = cellProperties.replace('</w:tcPr>', '<w:noWrap/></w:tcPr>')
  }
  return `<w:tc${cellAttributes}>${cellProperties}${makeTextParagraph(cell, value, options)}</w:tc>`
}

const resizeTableColumns = (table, columns, numberColumnWidth) => {
  const grid = table.match(/<w:tblGrid(?:\s[^>]*)?>([\s\S]*?)<\/w:tblGrid>/)
  if (!grid) throw new Error('У шаблоні відомості не знайдено сітку таблиці.')

  const gridColumns = [...grid[1].matchAll(/<w:gridCol\b[^>]*\/>/g)].map((match) => match[0])
  const numberWidth = Number(gridColumns[columns.number]?.match(/\bw:w="(\d+)"/)?.[1])
  const nameWidth = Number(gridColumns[columns.name]?.match(/\bw:w="(\d+)"/)?.[1])
  if (!numberWidth || !nameWidth) throw new Error('Не вдалося визначити ширину стовпців номера та ПІБ у шаблоні.')

  const widthDelta = numberColumnWidth - numberWidth
  if (widthDelta <= 0) return table
  if (nameWidth <= widthDelta) throw new Error('У шаблоні недостатньо ширини стовпця ПІБ для розширення нумерації.')

  const columnWidths = new Map([
    [columns.number, numberColumnWidth],
    [columns.name, nameWidth - widthDelta]
  ])
  const updateWidth = (element, width) => element.replace(/(\bw:w=")\d+(")/, `$1${width}$2`)
  let gridColumnIndex = 0
  let updatedTable = table.replace(grid[0], grid[0].replace(/<w:gridCol\b[^>]*\/>/g, (column) => {
    const width = columnWidths.get(gridColumnIndex)
    gridColumnIndex += 1
    return width ? updateWidth(column, width) : column
  }))

  const rows = [...updatedTable.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)]
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = rows[rowIndex][0]
    let cellIndex = 0
    const updatedRow = row.replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, (cell) => {
      const width = columnWidths.get(cellIndex)
      cellIndex += 1
      if (!width) return cell
      if (!/<w:tcW\b[^>]*\bw:w="\d+"/.test(cell)) {
        throw new Error('Не вдалося визначити ширину комірки нумерації або ПІБ у шаблоні.')
      }
      return cell.replace(/<w:tcW\b[^>]*\/?>/, (cellWidth) => updateWidth(cellWidth, width))
    })
    updatedTable = `${updatedTable.slice(0, rows[rowIndex].index)}${updatedRow}${updatedTable.slice(rows[rowIndex].index + row.length)}`
  }

  return updatedTable
}

const getStudentName = (student, index) => {
  if (typeof student === 'string') return student
  if (!student || typeof student !== 'object' || Array.isArray(student)) {
    throw new TypeError(`Некоректні дані студента у рядку ${index + 1}.`)
  }
  const name = student.applicant ?? student.full_name ?? student.name
  if (name === null || name === undefined || !String(name).trim()) {
    throw new TypeError(`Не вказано ПІБ студента у рядку ${index + 1}.`)
  }
  return String(name)
}

const updateStudentRow = (row, student, index, columns, numberStart = 1, numberStyle = {}) => {
  const cells = getCells(row)
  if (cells.length <= Math.max(columns.number, columns.name) ||
    (columns.inp !== null && cells.length <= columns.inp)) {
    throw new Error('У рядку студентів шаблону не знайдено потрібні комірки.')
  }

  const values = new Map([
    [columns.number, String(index + numberStart)],
    [columns.name, getStudentName(student, index)]
  ])
  if (columns.inp !== null) {
    const inpNumber = student && typeof student === 'object' ? student.inp_number : ''
    values.set(columns.inp, String(inpNumber ?? ''))
  }
  const updatedCells = cells.map((cell, cellIndex) => {
    if (cellIndex === columns.number) return replaceCellText(cell, values.get(cellIndex), {
      removeNumbering: true,
      plainParagraph: true,
      zeroParagraphIndent: Boolean(numberStyle.numberLineSpacing),
      alignCenter: Boolean(numberStyle.numberLineSpacing),
      studentParagraph: Boolean(numberStyle.numberLineSpacing),
      numberFontSize: numberStyle.numberFontSize,
      numberLineSpacing: numberStyle.numberLineSpacing,
      noWrapCell: true
    })
    if (cellIndex === columns.name || cellIndex === columns.inp) {
      return replaceCellText(cell, values.get(cellIndex))
    }
    return cell
  })

  let cursor = 0
  return row.replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, () => updatedCells[cursor++])
}

const findStudentHeader = (table, config) => {
  const rows = getRows(table)
  const normalized = (value) => String(value || '').toLocaleLowerCase('uk').replace(/[^\p{L}\p{N}]+/gu, '')
  const headerIndex = rows.findIndex((row) =>
    getCells(row).some((cell) => normalized(getCellText(cell)).includes(normalized(config.tableHeader)))
  )
  if (headerIndex < 0) {
    return {
      rows,
      headerIndex: config.headerRows - 1,
      columns: { number: 0, name: 1, inp: 2 }
    }
  }

  const rawHeaderCells = getCells(rows[headerIndex]).map(getCellText)
  const headerCells = rawHeaderCells.map(normalized)
  const name = headerCells.findIndex((cell) =>
    cell.includes('піб') || cell.includes('прізвище') || cell.includes('студент') || cell.includes('здобувач')
  )
  const number = headerCells.findIndex((cell, index) =>
    /^(пп|зп|номер)$/.test(cell) ||
    /порядковийномер/.test(cell) ||
    /(?:^|\s)№(?:\s|$)/u.test(rawHeaderCells[index])
  )
  const inp = headerCells.findIndex((cell) =>
    cell.includes('інп') || cell.includes('індивідуальнийномер') || cell.includes('особовийномер')
  )
  const nameIndex = name < 0 ? Math.min(1, headerCells.length - 1) : name
  const numberIndex = number >= 0 ? number : Math.max(0, headerCells.findIndex((_, index) => index !== nameIndex))

  return {
    rows,
    headerIndex,
    columns: {
      number: numberIndex,
      name: nameIndex,
      inp: inp >= 0 ? inp : null
    }
  }
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
  if (!Array.isArray(students)) throw new TypeError('Список студентів має бути масивом.')
  const normalizedStudents = students.map((student, index) => ({
    applicant: getStudentName(student, index),
    inp_number: student && typeof student === 'object' ? String(student.inp_number ?? '') : ''
  }))

  const templatePath = await getTemplatePath(reportType, config)
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

  const originalTable = tables[tableIndex]
  const { columns } = findStudentHeader(originalTable, config)
  const table = config.numberColumnWidth
    ? resizeTableColumns(originalTable, columns, config.numberColumnWidth)
    : originalTable
  const { rows, headerIndex } = findStudentHeader(table, config)
  const firstStudentRow = Math.max(headerIndex + 1, config.headerRows)
  const templateStudentRow = rows[firstStudentRow]
  if (!templateStudentRow) throw new Error('У таблиці шаблону не знайдено рядки студентів.')
  const expectedColumns = Math.max(columns.number, columns.name, columns.inp ?? -1)
  if (getCells(templateStudentRow).length <= expectedColumns) {
    throw new Error('У рядку студентів шаблону не знайдено потрібні комірки.')
  }
  const templateStructure = getRowStructure(templateStudentRow)
  let studentRegionEnd = firstStudentRow + 1
  while (studentRegionEnd < rows.length && getRowStructure(rows[studentRegionEnd]) === templateStructure) {
    studentRegionEnd += 1
  }
  const studentRows = normalizedStudents.map((student, index) =>
    updateStudentRow(templateStudentRow, student, index, columns, config.numberStart ?? 1, config)
  )
  const replacementRows = [
    ...rows.slice(0, firstStudentRow),
    ...studentRows,
    ...rows.slice(studentRegionEnd)
  ]
  const firstRowOffset = table.indexOf(rows[0])
  const lastRowOffset = table.lastIndexOf(rows[rows.length - 1])
  const tablePrefix = table.slice(0, firstRowOffset)
  const tableSuffix = table.slice(lastRowOffset + rows[rows.length - 1].length)
  const updatedTable = `${tablePrefix}${replacementRows.join('')}${tableSuffix}`
  const updatedXml = originalXml.replace(originalTable, updatedTable)

  zip.file('word/document.xml', updatedXml)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

const makeRosterParagraph = (value, { bold = false, size = 24, align } = {}) => {
  const paragraphProperties = align ? `<w:pPr><w:jc w:val="${align}"/></w:pPr>` : ''
  const runProperties = [
    '<w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>',
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`,
    bold ? '<w:b/><w:bCs/>' : ''
  ].join('')
  return `<w:p>${paragraphProperties}<w:r><w:rPr>${runProperties}</w:rPr><w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r></w:p>`
}

const formatStudentCount = (count) => {
  const lastTwoDigits = count % 100
  const lastDigit = count % 10
  const noun = lastTwoDigits >= 11 && lastTwoDigits <= 14
    ? 'студентів'
    : lastDigit === 1
      ? 'студент'
      : lastDigit >= 2 && lastDigit <= 4
        ? 'студенти'
        : 'студентів'
  return `${count} ${noun}`
}

const makeRosterCell = (value, width, { bold = false, align = 'left' } = {}) => {
  const paragraph = makeRosterParagraph(value, { bold, align, size: 22 })
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${paragraph}</w:tc>`
}

export const buildGroupListDocument = async (group, students) => {
  const totalWidth = 9638
  const numberWidth = 700
  const nameWidth = 5700
  const fundingWidth = totalWidth - numberWidth - nameWidth
  const border = '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
  const headerRow = `<w:tr>${makeRosterCell('№', numberWidth, { bold: true, align: 'center' })}${makeRosterCell('ПІБ студента', nameWidth, { bold: true, align: 'center' })}${makeRosterCell('Джерело фінансування', fundingWidth, { bold: true, align: 'center' })}</w:tr>`
  const studentRows = students.map((student, index) =>
    `<w:tr>${makeRosterCell(String(index + 1), numberWidth, { align: 'center' })}${makeRosterCell(student.applicant || '—', nameWidth)}${makeRosterCell(student.funding_source || '—', fundingWidth)}</w:tr>`
  ).join('')
  const budgetCount = students.filter((student) => String(student.funding_source || '').toLocaleLowerCase('uk').includes('бюджет')).length
  const contractCount = students.filter((student) => String(student.funding_source || '').toLocaleLowerCase('uk').includes('контракт')).length
  const classTeacher = group.class_teacher_name || 'Не призначений'
  const groupName = String(group.name || '')
  const course = group.course ? `${group.course} курс` : ''
  const specialty = group.specialty || 'Спеціальність не вказана'
  const table = `<w:tbl><w:tblPr><w:tblW w:w="${totalWidth}" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${numberWidth}"/><w:gridCol w:w="${nameWidth}"/><w:gridCol w:w="${fundingWidth}"/></w:tblGrid>${headerRow}${studentRows}</w:tbl>`
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${makeRosterParagraph(`Класний керівник: ${classTeacher}`, { bold: true })}${makeRosterParagraph(`Список студентів групи ${groupName}`, { bold: true, size: 32, align: 'center' })}${makeRosterParagraph([course, specialty].filter(Boolean).join(' · '), { align: 'center' })}${makeRosterParagraph('')}${table}${makeRosterParagraph('')}${makeRosterParagraph(`Усього: ${formatStudentCount(students.length)}`)}${makeRosterParagraph(`Бюджет: ${formatStudentCount(budgetCount)}`)}${makeRosterParagraph(`Контракт: ${formatStudentCount(contractCount)}`)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="425" w:footer="425" w:gutter="0"/></w:sectPr></w:body></w:document>`
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', documentXml)
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

export async function exportGroupList(req, res) {
  try {
    const groupId = Number(req.params.groupId)
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({ message: 'Невірний ідентифікатор групи.' })
    }

    const [[group]] = await pool.query(`
      SELECT sg.id, sg.name, sg.specialty, sg.course, t.full_name AS class_teacher_name
      FROM student_groups sg
      LEFT JOIN teachers t ON t.id = sg.class_teacher_id
      WHERE sg.id = ?
      LIMIT 1
    `, [groupId])
    if (!group) return res.status(404).json({ message: 'Групу не знайдено.' })

    const [students] = await pool.query(`
      SELECT ga.applicant, ga.funding_source
      FROM group_applicants ga
      WHERE ga.group_id = ?
        AND (ga.status IS NULL OR LOWER(TRIM(ga.status)) IN ('active', 'активний', 'активний студент', 'повернено з академвідпустки'))
      ORDER BY ga.applicant
    `, [groupId])
    students.sort((first, second) =>
      String(first.applicant || '').localeCompare(String(second.applicant || ''), 'uk')
    )

    const output = await buildGroupListDocument(group, students)
    const fileName = `Список студентів ${group.name}.docx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
    res.send(output)
  } catch (error) {
    console.error('ПОМИЛКА ЕКСПОРТУ СПИСКУ ГРУПИ:', error)
    res.status(500).json({ message: 'Не вдалося сформувати список групи.', code: error.code })
  }
}

export async function getStatementTemplates(req, res) {
  try {
    const templates = await Promise.all(Object.entries(REPORT_TYPES).map(async ([type, config]) => {
      const customPath = path.resolve(customTemplateDirectory, `${type}.docx`)
      const metadataPath = path.resolve(customTemplateDirectory, `${type}.json`)
      let custom = false
      try {
        await fs.access(customPath)
        custom = true
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      const templatePath = custom
        ? customPath
        : await getTemplatePath(type, config)
      let originalFilename = null
      if (custom) {
        try {
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
          originalFilename = typeof metadata.filename === 'string'
            ? normalizeFilenameEncoding(metadata.filename)
            : null
        } catch (error) {
          if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
        }
      }
      if (!custom) {
        try {
          await fs.access(templatePath)
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
          console.error(`СТАНДАРТНИЙ ШАБЛОН ВІДОМОСТІ НЕ ЗНАЙДЕНО (${type}):`, templatePath)
          throw new Error(`Не знайдено стандартний шаблон для «${config.label}». Завантажте власний DOCX-шаблон.`)
        }
      }
      return {
        type,
        label: config.label,
        custom,
        filename: custom ? (originalFilename || path.basename(templatePath)) : null,
        fallbackFilename: custom ? null : path.basename(templatePath)
      }
    }))
    res.json(templates)
  } catch (error) {
    console.error('ПОМИЛКА ОТРИМАННЯ ШАБЛОНІВ ВІДОМОСТЕЙ:', error)
    res.status(500).json({ message: 'Не вдалося перевірити шаблони відомостей.', code: error.code })
  }
}

export async function deleteStatementTemplate(req, res) {
  const reportType = String(req.params.reportType || '')
  if (!getReportConfig(reportType)) {
    return res.status(400).json({ message: 'Невідомий тип відомості.' })
  }

  const customPath = path.resolve(customTemplateDirectory, `${reportType}.docx`)
  const metadataPath = path.resolve(customTemplateDirectory, `${reportType}.json`)
  try {
    await fs.unlink(customPath)
    try {
      await fs.unlink(metadataPath)
    } catch (metadataError) {
      if (metadataError.code !== 'ENOENT') throw metadataError
    }
    res.json({ message: 'Завантажений шаблон видалено. Для відомості знову використовується стандартний шаблон.' })
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ message: 'Для цієї відомості немає завантаженого шаблону.' })
    }
    console.error('ПОМИЛКА ВИДАЛЕННЯ ШАБЛОНУ ВІДОМОСТІ:', error)
    res.status(500).json({ message: 'Не вдалося видалити шаблон відомості.', code: error.code })
  }
}

export async function uploadStatementTemplate(req, res) {
  try {
    const reportType = String(req.params.reportType || '')
    const config = getReportConfig(reportType)
    if (!config) return res.status(400).json({ message: 'Невідомий тип відомості.' })
    if (!req.file?.buffer) return res.status(400).json({ message: 'Оберіть шаблон відомості у форматі DOCX.' })
    if (!/\.docx$/i.test(req.file.originalname || '') || req.file.buffer.subarray(0, 2).toString() !== 'PK') {
      return res.status(400).json({ message: 'Підтримуються лише коректні документи Word у форматі .docx.' })
    }

    let uploadedZip
    try {
      uploadedZip = await JSZip.loadAsync(req.file.buffer)
    } catch {
      return res.status(400).json({ message: 'Файл не є коректним документом DOCX.' })
    }
    const documentFile = uploadedZip.file('word/document.xml')
    if (!documentFile) return res.status(400).json({ message: 'У шаблоні не знайдено основний Word-документ.' })
    const documentXml = await documentFile.async('string')
    const hasStudentTable = getTables(documentXml).some((table) =>
      getCellText(table).toLocaleLowerCase('uk').includes(config.tableHeader.toLocaleLowerCase('uk'))
    )
    if (!hasStudentTable) {
      return res.status(400).json({
        message: `У шаблоні має бути таблиця зі стовпцем «${config.tableHeader}».`
      })
    }

    await fs.mkdir(customTemplateDirectory, { recursive: true })
    const targetPath = path.resolve(customTemplateDirectory, `${reportType}.docx`)
    const metadataPath = path.resolve(customTemplateDirectory, `${reportType}.json`)
    const tempId = randomUUID()
    const temporaryPath = `${targetPath}.${tempId}.tmp`
    const temporaryMetadataPath = `${metadataPath}.${tempId}.tmp`
    const filename = path.basename(normalizeFilenameEncoding(
      String(req.file.originalname || '').replace(/[\\/]/g, path.sep)
    ))
    try {
      await fs.writeFile(temporaryPath, req.file.buffer)
      await fs.writeFile(temporaryMetadataPath, JSON.stringify({ filename }, null, 2), 'utf8')
      await fs.rename(temporaryPath, targetPath)
      await fs.rename(temporaryMetadataPath, metadataPath)
    } catch (error) {
      for (const temporaryFile of [temporaryPath, temporaryMetadataPath]) {
        try {
          await fs.unlink(temporaryFile)
        } catch (cleanupError) {
          if (cleanupError.code !== 'ENOENT') {
            console.error('ПОМИЛКА ОЧИЩЕННЯ ТИМЧАСОВОГО ШАБЛОНУ:', cleanupError)
          }
        }
      }
      throw error
    }

    res.json({ message: 'Завантажений шаблон збережено і буде використовуватися для формування відомості.', type: reportType, filename })
  } catch (error) {
    console.error('ПОМИЛКА ІМПОРТУ ШАБЛОНУ ВІДОМОСТІ:', error)
    res.status(500).json({ message: 'Не вдалося зберегти шаблон відомості.', code: error.code })
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
