import pool from '../src/config/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function run(){
  try{
    const [cols]= await pool.query('SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [process.env.DB_NAME, 'tasks'])
    console.log(cols)
  }catch(e){console.error(e.message)}finally{process.exit(0)}
}
run()
