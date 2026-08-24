import pool from '../src/config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function run(){
  try{
    const q = "%НМК%"
    const [rows] = await pool.query('SELECT * FROM tasks WHERE title LIKE ? OR description LIKE ? ORDER BY created_at DESC LIMIT 50', [q,q])
    console.log(rows)
  }catch(e){console.error('ERR', e.message)}finally{process.exit(0)}
}
run()
