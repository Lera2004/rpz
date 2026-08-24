import pool from '../src/config/database.js'

async function run(){
  try{
    console.log('Altering tasks.telegram_message_id to BIGINT...')
    await pool.query("ALTER TABLE tasks MODIFY telegram_message_id BIGINT NULL")
    console.log('Modified column')
  }catch(e){console.error('Modify failed:', e.message)}
  try{
    console.log('Adding FK constraint...')
    await pool.query("ALTER TABLE tasks ADD CONSTRAINT fk_tasks_telegram_message FOREIGN KEY (telegram_message_id) REFERENCES telegram_messages(id) ON DELETE CASCADE")
    console.log('FK added')
  }catch(e){console.error('Add FK failed:', e.message)}
  await pool.end()
  process.exit(0)
}
run()
