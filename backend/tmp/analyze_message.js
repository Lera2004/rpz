function formatDateOnlyFromDate(d) {
  if (!(d instanceof Date)) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function simpleAnalyze(rawText, messageDateIso) {
  const text = String(rawText || '').toLowerCase()
  const parsed = {
    isTask: false,
    title: null,
    description: String(rawText || ''),
    deadline: null,
    priority: 'medium',
    assigneeMode: null,
    teacherNames: [],
    confidence: 0.5
  }

  // event heuristic
  const timePattern = /о\s*\d{1,2}[:\.]\d{2}/gi
  if (/(заход|захід)/i.test(text) || (/((збиратися|збираюсь|збираються|збиратись|збира))/i.test(text) && timePattern.test(rawText))) {
    return parsed
  }

  // detect date like dd.mm or dd/mm or yyyy-mm-dd anywhere in text
  const anyDateMatch = text.match(/\b(\d{1,2})[\.\-/](\d{1,2})(?:[\.\-/](\d{2,4}))?\b/)
  if (anyDateMatch) {
    const day = Number(anyDateMatch[1])
    const month = Number(anyDateMatch[2])
    let year = anyDateMatch[3] ? Number(anyDateMatch[3]) : null
    if (year && year < 100) { year += 2000 }
    if (!year) {
      const msgDate = new Date(messageDateIso)
      year = msgDate.getFullYear()
      if (month < (msgDate.getMonth() + 1) && (msgDate.getMonth() + 1) - month > 6) {
        year = year + 1
      }
    }
    if (day >=1 && day <=31 && month >=1 && month<=12) {
      const d = new Date(year, month - 1, day)
      if (!isNaN(d)) {
        parsed.deadline = formatDateOnlyFromDate(d)
        parsed.isTask = true
        parsed.confidence = Math.max(parsed.confidence, 0.75)
      }
    }
  }

  // relative dates
  if (!parsed.deadline) {
    if (text.includes('завтра')) {
      const md = new Date(messageDateIso)
      md.setDate(md.getDate() + 1)
      parsed.deadline = formatDateOnlyFromDate(md)
      parsed.isTask = true
      parsed.confidence = 0.7
    }
    if (text.includes('сьогодні') || text.includes('до кінця дня') || text.includes('сьогодні до кінця дня')) {
      const md = new Date(messageDateIso)
      parsed.deadline = formatDateOnlyFromDate(md)
      parsed.isTask = true
      parsed.confidence = 0.8
    }
  }

  // detect assignees: if contains 'викладач' or 'колеги' -> all
  if (/(викладачам|шановні колеги|колеги|викладачі)/i.test(text)) {
    parsed.assigneeMode = 'all_teachers'
    parsed.isTask = true
    parsed.confidence = Math.max(parsed.confidence, 0.7)
  }

  // detect specific teacher names
  const nameRegex = /([А-ЯҐЄІЇ][а-яґєії]+)\s+([А-ЯËІЇ]\.[А-ЯËІЇ]\.)?/gi
  const names = []
  let m
  while ((m = nameRegex.exec(rawText)) !== null) {
    const candidate = m[0].trim()
    if (candidate && candidate.length > 3) names.push(candidate)
  }
  if (names.length) {
    parsed.assigneeMode = 'specific_teachers'
    parsed.teacherNames = names
    parsed.isTask = true
    parsed.confidence = Math.max(parsed.confidence, 0.6)
  }

  // keywords that imply task even without date
  if (!parsed.isTask) {
    if (/(потрібно|має|необхідно|чекаю|надати|завантажити)/i.test(text)) {
      parsed.isTask = true
      parsed.confidence = 0.55
    }
  }

  return parsed
}

const message = `Шановні колеги, прошу до 25.05.2026 оформити журнали обліку для попереднього розрахунку годин та здати до навчальної частини звіти з КП та ДП`
const messageDateIso = '2026-08-23T17:16:17.947+03:00'
console.log(simpleAnalyze(message, messageDateIso))
