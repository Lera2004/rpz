import pool from '../src/config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function inspect() {
  try {
    // check if telegram_messages exists
    const [tables] = await pool.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('telegram_messages','tasks','task_assignments')", [process.env.DB_NAME])
    const present = new Set(tables.map(t=>t.TABLE_NAME))

    const out = { foundTables: Array.from(present), telegram_messages: null, recentTasks: null }

    if (present.has('telegram_messages')) {
      const [rows] = await pool.query('SELECT id, channel_id, message_id, published_at AS posted_at, raw_text, status AS processing_status, task_id AS created_task_id, error, created_at FROM telegram_messages ORDER BY created_at DESC LIMIT 20')
      out.telegram_messages = rows
    } else {
      out.telegram_messages = 'table_not_found'
    }

    if (present.has('tasks')) {
      const [tasks] = await pool.query("SELECT id, title, deadline, priority, created_at FROM tasks ORDER BY created_at DESC LIMIT 20")
      out.recentTasks = tasks
    } else {
      out.recentTasks = 'table_not_found'
    }

    console.log(JSON.stringify(out, null, 2))
  } catch (err) {
    console.error('ERR', err.message)
  } finally { process.exit(0) }
}

inspect()
