import pool from '../src/config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function run(name) {
  try {
    const [rows] = await pool.query("SELECT id, full_name, telegram_chat_id, email FROM teachers WHERE full_name LIKE ? LIMIT 20", ['%'+name+'%'])
    console.log(rows)
  } catch (err) {
    console.error('ERR', err.message)
  } finally { process.exit(0) }
}

run(process.argv[2] || 'Нерознак')
