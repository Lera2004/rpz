import pool from '../src/config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function run(){
  try{
    const ids = [65,64]
    const [rows] = await pool.query('SELECT * FROM task_assignments WHERE task_id IN (?)', [ids])
    console.log(rows)
  }catch(e){console.error('ERR', e.message)}finally{process.exit(0)}
}
run()
