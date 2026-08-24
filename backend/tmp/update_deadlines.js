import pool from '../src/config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function run(){
  try{
    // Update task 65 -> 2026-09-01, task 64 -> 2026-12-01 based on telegram_messages
    await pool.query("UPDATE tasks SET deadline = ? WHERE id = ?", ['2026-09-01', 65])
    await pool.query("UPDATE tasks SET deadline = ? WHERE id = ?", ['2026-12-01', 64])

    // update telegram_messages.ai_result JSON to include deadline
    const [rows] = await pool.query('SELECT id, ai_result FROM telegram_messages WHERE task_id IN (?)', [[64,65]])
    for(const r of rows){
      let ai = r.ai_result || {}
      if (typeof ai === 'string') ai = JSON.parse(ai)
      if (r.task_id === 65) ai.deadline = '2026-09-01'
      if (r.task_id === 64) ai.deadline = '2026-12-01'
      await pool.query('UPDATE telegram_messages SET ai_result = ? WHERE id = ?', [JSON.stringify(ai), r.id])
    }

    console.log('Updated deadlines for tasks 64 and 65')
  }catch(e){console.error('ERR', e.message)}finally{process.exit(0)}
}
run()
