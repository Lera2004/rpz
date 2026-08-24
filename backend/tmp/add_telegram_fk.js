import pool from '../src/config/database.js'

async function run() {
  try {
    console.log('Checking tasks table for telegram_message_id column...')
    const [cols] = await pool.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks'", [process.env.DB_NAME])
    const colNames = cols.map(r => r.COLUMN_NAME)

    if (!colNames.includes('telegram_message_id')) {
      console.log('Adding column telegram_message_id to tasks...')
      await pool.query("ALTER TABLE tasks ADD COLUMN telegram_message_id INT NULL")
    } else {
      console.log('Column already exists')
    }

    // Try to populate from telegram_messages.created_task_id or telegram_messages.task_id
    const [tmExists] = await pool.query("SHOW TABLES LIKE 'telegram_messages'")
    if (tmExists.length) {
      console.log('telegram_messages table exists — attempting to populate telegram_message_id for existing tasks...')
      try {
        await pool.query("UPDATE tasks t JOIN telegram_messages tm ON tm.created_task_id = t.id SET t.telegram_message_id = tm.id")
        console.log('Updated from created_task_id (if present)')
      } catch (e) {
        console.log('created_task_id update skipped or failed (column may not exist):', e.message)
      }
      try {
        await pool.query("UPDATE tasks t JOIN telegram_messages tm ON tm.task_id = t.id SET t.telegram_message_id = tm.id")
        console.log('Updated from task_id (if present)')
      } catch (e) {
        console.log('task_id update skipped or failed (column may not exist):', e.message)
      }

      // check foreign key existence
      const [fkRows] = await pool.query("SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'telegram_message_id'", [process.env.DB_NAME])
      if (!fkRows.length) {
        try {
          console.log('Adding foreign key fk_tasks_telegram_message -> telegram_messages(id) ON DELETE CASCADE')
          await pool.query("ALTER TABLE tasks ADD CONSTRAINT fk_tasks_telegram_message FOREIGN KEY (telegram_message_id) REFERENCES telegram_messages(id) ON DELETE CASCADE")
        } catch (e) {
          console.error('Failed to add FK constraint:', e.message)
        }
      } else {
        console.log('Foreign key or index on telegram_message_id already exists.')
      }
    } else {
      console.log('telegram_messages table does not exist — skipping population and FK creation.')
    }

    console.log('Done. You may want to verify with SHOW CREATE TABLE tasks and SELECT COUNT(*)...')
  } catch (err) {
    console.error('Migration failed:', err)
  } finally {
    await pool.end()
    process.exit(0)
  }
}

run()
