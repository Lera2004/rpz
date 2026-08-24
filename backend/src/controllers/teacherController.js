import pool from '../config/database.js'

export async function getCommissions(req, res) {
  try {
    const [rows] = await pool.query('SELECT id, name FROM commissions ORDER BY name')
    res.json(rows)
  } catch (error) {
    console.error('ПОМИЛКА ОТРИМАННЯ ЦИКЛОВИХ КОМІСІЙ:', error)
    res.status(500).json({ message: error.message, code: error.code })
  }
}

export async function getTeachers(req, res) {
  try {
    console.log('Запит на отримання викладачів')

    const [rows] = await pool.query(`
      SELECT
        t.id,
        t.full_name,
        t.category,
        t.position,
        t.rate,
        t.commission_id,
        t.phone,
        t.email,
        t.date_of_birth,
        c.name AS commission_name
      FROM teachers t
      LEFT JOIN commissions c ON c.id = t.commission_id
      ORDER BY t.full_name
    `)

    console.log('Викладачі:', rows)

    res.json(rows)

  } catch (error) {

    console.error('ПОМИЛКА MYSQL:')
    console.error(error)

    res.status(500).json({
      message: error.message,
      code: error.code
    })
  }
}

export async function createTeacher(req, res) {
  try {
    const {
      full_name,
      category,
      position,
      rate,
      commission_id,
      phone,
      email,
      date_of_birth
    } = req.body

    const [result] = await pool.query(
      `
      INSERT INTO teachers
        (full_name, category, position, rate, commission_id, phone, email, date_of_birth)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        full_name,
        category,
        position,
        rate,
        commission_id || null,
        phone || null,
        email || null,
        date_of_birth || null
      ]
    )

    const [rows] = await pool.query(
      `
      SELECT
        id,
        full_name,
        category,
        position,
        rate,
        commission_id,
        phone,
        email,
        date_of_birth
      FROM teachers
      WHERE id = ?
      `,
      [result.insertId]
    )

    res.status(201).json(rows[0])
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: 'Помилка створення викладача'
    })
  }
}

export async function updateTeacher(req, res) {
  try {
    const { id } = req.params

    const {
      full_name,
      category,
      position,
      rate,
      commission_id,
      phone,
      email,
      date_of_birth
    } = req.body

    await pool.query(
      `
      UPDATE teachers
      SET
        full_name = ?,
        category = ?,
        position = ?,
        rate = ?,
        commission_id = ?,
        phone = ?,
        email = ?,
        date_of_birth = ?
      WHERE id = ?
      `,
      [
        full_name,
        category,
        position,
        rate,
        commission_id || null,
        phone || null,
        email || null,
        date_of_birth || null,
        id
      ]
    )

    const [rows] = await pool.query(
      `
      SELECT
        id,
        full_name,
        category,
        position,
        rate,
        commission_id,
        phone,
        email,
        date_of_birth
      FROM teachers
      WHERE id = ?
      `,
      [id]
    )

    res.json(rows[0])
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: 'Помилка оновлення викладача'
    })
  }
}

export async function deleteTeacher(req, res) {
  try {
    const { id } = req.params

    await pool.query(
      'DELETE FROM teachers WHERE id = ?',
      [id]
    )

    res.json({
      message: 'Викладача видалено'
    })
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: 'Помилка видалення викладача'
    })
  }
}

export async function createCommission(req, res) {
  try {
    const name = String(req.body.name || '').trim()
    if (!name) return res.status(400).json({ message: 'Назва циклової комісії є обовʼязковою' })

    const [result] = await pool.query('INSERT INTO commissions (name) VALUES (?)', [name])
    const [rows] = await pool.query('SELECT id, name FROM commissions WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (error) {
    console.error('ПОМИЛКА СТВОРЕННЯ ЦИКЛОВОЇ КОМІСІЇ:', error)
    res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({
      message: error.code === 'ER_DUP_ENTRY' ? 'Така циклова комісія вже існує' : error.message,
      code: error.code
    })
  }
}