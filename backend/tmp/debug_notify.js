import pool from '../src/config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function run(){
  try{
    const taskIds = [64,65]
    for(const tid of taskIds){
      const [assign] = await pool.query('SELECT * FROM task_assignments WHERE task_id = ?', [tid])
      console.log('Assignments for', tid, assign)
      for(const a of assign){
        const [trows] = await pool.query('SELECT id, full_name, telegram_chat_id FROM teachers WHERE id = ?', [a.teacher_id])
        console.log('Teacher row:', trows)
      }
    }
  }catch(e){console.error(e.message)}finally{process.exit(0)}
}
run()
