import pool from '../config/database.js'

export async function listTelegramMessages(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, channel_id, message_id, published_at AS posted_at, status AS processing_status, task_id AS created_task_id, created_at, updated_at
       FROM telegram_messages
       ORDER BY created_at DESC
       LIMIT 200`
    )
    res.json(rows)
  } catch (error) {
    console.error('Error listing telegram messages:', error)
    res.status(500).json({ message: error.message })
  }
}

export async function getTelegramMessage(req, res) {
  try {
    const { id } = req.params
    const [rows] = await pool.query('SELECT * FROM telegram_messages WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ message: 'Not found' })
    const row = rows[0]
    // normalize fields
    try {
      if (row.ai_result && typeof row.ai_result === 'string') row.ai_result = JSON.parse(row.ai_result)
    } catch (e) {}
    try {
      if (row.raw_payload && typeof row.raw_payload === 'string') row.raw_payload = JSON.parse(row.raw_payload)
    } catch (e) {}
    // map existing column names to API-friendly ones
    if (row.published_at) row.posted_at = row.published_at
    if (row.status) row.processing_status = row.status
    if (row.task_id) row.created_task_id = row.task_id
    res.json(row)
  } catch (error) {
    console.error('Error getting telegram message:', error)
    res.status(500).json({ message: error.message })
  }
}

export async function reprocessTelegramMessage(req, res) {
  try {
    const { id } = req.params
    const [rows] = await pool.query('SELECT * FROM telegram_messages WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ message: 'Not found' })
    const row = rows[0]
    // mark analyzing and return success; actual reprocess is done by admin calling specific endpoint or by requeueing
    await pool.query('UPDATE telegram_messages SET processing_status = ? WHERE id = ?', ['analyzing', id])
    res.json({ success: true })
  } catch (error) {
    console.error('Error reprocessing telegram message:', error)
    res.status(500).json({ message: error.message })
  }
}
