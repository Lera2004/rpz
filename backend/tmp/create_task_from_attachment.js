import fs from 'fs/promises'
import https from 'https'
import http from 'http'
import dotenv from 'dotenv'
dotenv.config()

const attachmentPath = 'c:/Users/User/AppData/Roaming/Code/agentSessionData/aa26f3a0-4e5f-4bc1-a0ab-bd647e5eaa52/attachments/39eff7d5-ebc7-415f-af34-71bd67aeb08e/Pasted text #1.txt'

async function run(){
  const raw = String(await fs.readFile(attachmentPath, 'utf8'))
  const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean)
  const title = lines[0] ? (lines[0].length > 255 ? lines[0].slice(0,252)+'...' : lines[0]) : 'Нове завдання з Telegram'
  const description = raw
  const payload = {
    title,
    description,
    priority: 'medium',
    all_teachers: true
  }
  const port = process.env.PORT || 3000
  const url = `http://localhost:${port}/api/tasks`
  console.log('Posting to', url)
  const res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
  const txt = await res.text()
  console.log('Status', res.status)
  try{ console.log('Response:', JSON.parse(txt)) } catch(e) { console.log('ResponseText:', txt) }
}

run().catch(e=>{console.error(e); process.exit(1)})
