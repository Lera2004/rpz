function formatDateOnlyFromDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function parseDeadlineFromText(rawText, messageDateIso) {
  const text = String(rawText || '').toLowerCase()
  // event/invite heuristic
  const timePattern = /\bо\s*\d{1,2}[:\.]\d{2}\b/gi
  if (/(заход|захід)/i.test(text) || (/((збиратися|збираюсь|збираються|збиратись|збира))/i.test(text) && timePattern.test(rawText))) {
    return { type: 'INFO', deadline: null }
  }
  const anyDateMatch = text.match(/\b(\d{1,2})[\.\-/](\d{1,2})(?:[\.\-/](\d{2,4}))?\b/)
  if (anyDateMatch) {
    const day = Number(anyDateMatch[1])
    const month = Number(anyDateMatch[2])
    let year = anyDateMatch[3] ? Number(anyDateMatch[3]) : null
    if (year && year < 100) year += 2000
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
        return formatDateOnlyFromDate(d)
      }
    }
  }

  if (text.includes('завтра')) {
    const md = new Date(messageDateIso)
    md.setDate(md.getDate() + 1)
    return formatDateOnlyFromDate(md)
  }
  if (text.includes('сьогодні') || text.includes('до кінця дня')) {
    const md = new Date(messageDateIso)
    return formatDateOnlyFromDate(md)
  }
  return null
}

const tests = [
  { text: "На 01.09 ви маєте надати НМК другого семестру в електронному вигляді на перевірку.", pub: '2026-08-23T16:13:36.452+03:00' },
  { text: "До 05.09 потрібно завантажити РПНД.", pub: '2026-08-23T16:13:36.452+03:00' },
  { text: "На 10.09 підготувати звіт.", pub: '2026-08-23T16:13:36.452+03:00' },
  { text: "Завтра потрібно перевірити методички.", pub: '2026-08-23T16:13:36.452+03:00' },
  { text: "Шановні колеги! Тим хто приймає участь у заході, що відбудеться завтра прохання зібратися в Хабі о 9.30.", pub: '2026-08-23T16:13:36.452+03:00' }
]

for (const t of tests) {
  console.log('TEXT:', t.text)
  console.log('PARSED DEADLINE:', parseDeadlineFromText(t.text, t.pub))
  console.log('---')
}
