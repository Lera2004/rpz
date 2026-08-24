import pool from '../src/config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function inspect() {
  try {
    const [cols] = await pool.query(`SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`, [process.env.DB_NAME, 'telegram_messages'])
    console.log(cols)
  } catch (err) {
    console.error('ERR', err.message)
  } finally {
    process.exit(0)
  }
}

inspect()
