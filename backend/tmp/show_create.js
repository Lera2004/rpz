import pool from '../src/config/database.js'

async function run(){
  try{
    const [t] = await pool.query("SHOW CREATE TABLE tasks")
    console.log('TASKS CREATE:')
    console.log(t[0]['Create Table'])
  }catch(e){console.error('tasks show failed', e.message)}
  try{
    const [tm] = await pool.query("SHOW CREATE TABLE telegram_messages")
    console.log('\nTELEGRAM_MESSAGES CREATE:')
    console.log(tm[0]['Create Table'])
  }catch(e){console.error('telegram_messages show failed', e.message)}
  await pool.end()
  process.exit(0)
}
run()
