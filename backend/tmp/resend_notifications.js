import dotenv from 'dotenv'
dotenv.config()
import { notifyTeachersForTask } from '../src/telegramBot.js'

async function run() {
  const ids = process.argv.slice(2).map((s) => Number(s)).filter(Boolean)
  if (!ids.length) {
    console.log('Usage: node tmp/resend_notifications.js <taskId> [taskId2]')
    process.exit(0)
  }

  for (const id of ids) {
    try {
      console.log('Notifying for task', id)
      const res = await notifyTeachersForTask(id)
      console.log('Notified teacher IDs:', res)
    } catch (err) {
      console.error('Error notifying task', id, err)
    }
  }
  process.exit(0)
}

run()