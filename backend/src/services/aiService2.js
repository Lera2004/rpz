import dotenv from 'dotenv'

dotenv.config()

const OPENAI_API_KEY = process.env.AI_API_KEY
const OPENAI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini'
const OPENAI_API = 'https://api.openai.com/v1/chat/completions'

function buildPrompt(text, messageDateIso) {
  return `You are a task extraction assistant. Given the following Telegram channel post (in Ukrainian), determine whether it contains a task to assign to teachers and extract structured fields.\n\nMessageDate: ${messageDateIso}\n\nMessage:\n"""\n${text}\n"""\n\nReturn strictly ONE JSON object (no markdown, no explanation) with these fields:\n{\n  "isTask": true|false,\n  "title": string|null,\n  "description": string|null,\n  "deadline": string|null,\n  "priority": "low"|"medium"|"high"|null,\n  "assigneeMode": "all_teachers"|"specific_teachers"|"specialty"|"department"|null,\n  "teacherNames": ["Full Name", ...] || [],\n  "specialtyCode": string|null,\n  "confidence": number\n}\n\nIf not confident, set confidence low and fields to null as appropriate. Return valid JSON only.`
}

export async function analyzeMessage(text, messageDateIso) {
  if (!OPENAI_API_KEY) return { success: false, error: 'AI_API_KEY not configured' }

  const prompt = buildPrompt(text, messageDateIso)
  try {
    const body = {
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: 'You are a JSON-only extraction assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.0,
      max_tokens: 700
    }

    const res = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const textErr = await res.text()
      return { success: false, error: `OpenAI error: ${res.status} ${textErr}` }
    }

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || null
    if (!raw) return { success: false, error: 'Empty response from AI', raw }

    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return { success: false, error: 'No JSON found in AI response', raw }

    let parsed = null
    try {
      parsed = JSON.parse(match[0])
    } catch (e) {
      try {
        const repaired = match[0].replace(/'/g, '"')
        parsed = JSON.parse(repaired)
      } catch (e2) {
        return { success: false, error: 'Failed to parse AI JSON', raw }
      }
    }

    return { success: true, parsed, raw }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
