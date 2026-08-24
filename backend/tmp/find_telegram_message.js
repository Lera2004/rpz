import pool from '../src/config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function run(){
  try{
    const channel = String(process.env.TELEGRAM_TASK_CHANNEL_ID)
    const [rows] = await pool.query('SELECT * FROM telegram_messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT 20', [channel])
    console.log(rows)
  }catch(e){console.error('ERR', e.message)}finally{process.exit(0)}
}
run()
