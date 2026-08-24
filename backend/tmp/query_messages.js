import pool from '../src/config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function run() {
  try {
    const [rows] = await pool.query('SELECT id, channel_id, message_id, published_at, raw_text, status, task_id, error, created_at FROM telegram_messages ORDER BY created_at DESC LIMIT 20')
    console.log(rows)
  } catch (err) {
    console.error('ERR', err.message)
  } finally { process.exit(0) }
}

run()
