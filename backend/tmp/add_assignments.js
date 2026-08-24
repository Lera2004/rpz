import pool from '../src/config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function run(){
  try{
    const tasks = [64,65]
    const teacherId = 80
    for(const t of tasks){
      const [rows] = await pool.query('SELECT * FROM task_assignments WHERE task_id = ? AND teacher_id = ?', [t, teacherId])
      if (!rows.length) {
        await pool.query('INSERT INTO task_assignments (task_id, teacher_id, status) VALUES (?, ?, "not_started")', [t, teacherId])
        console.log('Inserted assignment for task', t)
      } else {
        console.log('Assignment already exists for task', t)
      }
    }
  }catch(e){console.error('ERR', e.message)}finally{process.exit(0)}
}
run()
