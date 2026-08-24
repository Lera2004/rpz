import crypto from 'crypto'
import pool from '../config/database.js'

const ROLE_LABELS = {
  admin: 'Адміністратор',
  chair: 'Голова ЦК',
  teacher: 'Викладач'
}

function hashString(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function normalizeName(value) {
  return String(value || '').trim()
}

function transliterate(value) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', і: 'i', ї: 'i', й: 'i',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h',
    ц: 'c', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ъ: '', ы: 'y', э: 'e', ю: 'iu', я: 'ia',
    А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Є: 'Ie', Ж: 'Zh', З: 'Z', І: 'I', Ї: 'I', Й: 'I',
    К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'H',
    Ц: 'C', Ч: 'Ch', Ш: 'Sh', Щ: 'Shch', Ь: '', Ъ: '', Ы: 'Y', Э: 'E', Ю: 'Iu', Я: 'Ia'
  }

  return value
    .split('')
    .map((char) => map[char] || char)
    .join('')
    .replace(/[^A-Za-z0-9]/g, '')
}

function normalizeLogin(value) {
  const login = String(value || '').trim()
  const cleaned = login
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/_+/g, '_')

  return cleaned.toLowerCase()
}

function generateCredentialPair(fullName) {
  const cleanName = normalizeName(fullName)
  const parts = cleanName.split(/\s+/).filter(Boolean)
  const surname = parts[0] || 'User'
  const first = parts[1] || 'User'

  const surnameLatin = transliterate(surname) || 'User'
  const firstLatin = transliterate(first) || 'User'

  let loginBase = `${surnameLatin}_${firstLatin}`
  loginBase = normalizeLogin(loginBase) || 'user_name'

  const passwordBase = `${surnameLatin}${firstLatin}${String(Math.floor(Math.random() * 900 + 100))}!`

  return {
    login: loginBase,
    password: passwordBase
  }
}

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url')
  const secret = process.env.JWT_SECRET || 'ped-dev-secret'
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')

  return `${header}.${body}.${signature}`
}

function verifyToken(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token')
  }

  const [header, payload, signature] = parts
  const secret = process.env.JWT_SECRET || 'ped-dev-secret'
  const expectedSignature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error('Invalid signature')
  }

  const decoded = Buffer.from(payload, 'base64url').toString('utf8')
  const parsed = JSON.parse(decoded)

  if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired')
  }

  return parsed
}

export async function ensureAuthTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      login VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin', 'chair', 'teacher') NOT NULL DEFAULT 'teacher',
      teacher_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id)
        ON DELETE SET NULL
    )
  `)

  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM users')
  if (Number(rows[0]?.total || 0) === 0) {
    const defaultPassword = 'Admin123!'
    await pool.query(
      `INSERT INTO users (full_name, login, password_hash, role)
       VALUES (?, ?, ?, ?)`,
      ['Адміністратор', 'admin', hashString(defaultPassword), 'admin']
    )
  }
}

export async function initializeAuthData() {
  await ensureAuthTables()
}

export async function getUsers(req, res) {
  try {
    await ensureAuthTables()
    const [rows] = await pool.query(`
      SELECT
        u.id,
        u.full_name,
        u.login,
        u.role,
        u.teacher_id,
        u.created_at,
        t.full_name AS teacher_name
      FROM users u
      LEFT JOIN teachers t ON t.id = u.teacher_id
      ORDER BY u.full_name
    `)

    res.json(rows.map((user) => ({
      ...user,
      role_label: ROLE_LABELS[user.role] || user.role
    })))
  } catch (error) {
    console.error('ПОМИЛКА ПРИ ЗАВАНТАЖЕННІ КОРИСТУВАЧІВ:', error)
    res.status(500).json({ message: 'Не вдалося завантажити користувачів.' })
  }
}

export async function createUserAccount(req, res) {
  try {
    await ensureAuthTables()

    const fullName = normalizeName(req.body?.full_name)
    const role = String(req.body?.role || 'teacher')
    const teacherId = req.body?.teacher_id ? Number(req.body.teacher_id) : null

    if (!fullName) {
      return res.status(400).json({ message: 'ПІБ користувача є обов’язковим.' })
    }

    if (!['admin', 'chair', 'teacher'].includes(role)) {
      return res.status(400).json({ message: 'Некоректна роль користувача.' })
    }

    const credentials = generateCredentialPair(fullName)
    let login = credentials.login
    let index = 1

    while (true) {
      const [existingRows] = await pool.query('SELECT id FROM users WHERE login = ?', [login])
      if (!existingRows.length) {
        break
      }
      login = `${credentials.login}${index}`
      index += 1
    }

    const passwordHash = hashString(credentials.password)

    const [result] = await pool.query(
      `INSERT INTO users (full_name, login, password_hash, role, teacher_id)
       VALUES (?, ?, ?, ?, ?)`,
      [fullName, login, passwordHash, role, teacherId && Number.isFinite(teacherId) ? teacherId : null]
    )

    const [rows] = await pool.query(`
      SELECT id, full_name, login, role, teacher_id
      FROM users
      WHERE id = ?
    `, [result.insertId])

    res.status(201).json({
      user: rows[0],
      login,
      password: credentials.password,
      role
    })
  } catch (error) {
    console.error('ПОМИЛКА СТВОРЕННЯ КОРИСТУВАЧА:', error)
    res.status(500).json({ message: 'Не вдалося створити користувача.', details: error.message })
  }
}

export async function updateUserLogin(req, res) {
  try {
    const userId = Number(req.params?.id)
    const nextLogin = normalizeLogin(req.body?.login)

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Некоректний ідентифікатор користувача.' })
    }

    if (!nextLogin) {
      return res.status(400).json({ message: 'Логін не може бути порожнім.' })
    }

    const [userRows] = await pool.query('SELECT id, login FROM users WHERE id = ?', [userId])
    if (!userRows.length) {
      return res.status(404).json({ message: 'Користувача не знайдено.' })
    }

    const [existingRows] = await pool.query('SELECT id FROM users WHERE login = ? AND id != ?', [nextLogin, userId])
    if (existingRows.length) {
      return res.status(409).json({ message: 'Такий логін уже використовується.' })
    }

    await pool.query('UPDATE users SET login = ? WHERE id = ?', [nextLogin, userId])

    const [updatedRows] = await pool.query('SELECT id, full_name, login, role, teacher_id FROM users WHERE id = ?', [userId])

    res.json({
      user: updatedRows[0],
      message: 'Логін успішно оновлено.'
    })
  } catch (error) {
    console.error('ПОМИЛКА ОНОВЛЕННЯ ЛОГІНА:', error)
    res.status(500).json({ message: 'Не вдалося змінити логін.', details: error.message })
  }
}

export async function loginUser(req, res) {
  try {
    await ensureAuthTables()

    const login = String(req.body?.login || '').trim()
    const password = String(req.body?.password || '').trim()

    if (!login || !password) {
      return res.status(400).json({ message: 'Логін і пароль є обов’язковими.' })
    }

    const [rows] = await pool.query(
      `SELECT id, full_name, login, password_hash, role, teacher_id
       FROM users
       WHERE login = ?`,
      [login]
    )

    if (!rows.length) {
      return res.status(401).json({ message: 'Невірний логін або пароль.' })
    }

    const user = rows[0]
    if (user.password_hash !== hashString(password)) {
      return res.status(401).json({ message: 'Невірний логін або пароль.' })
    }

    const token = signToken({
      id: user.id,
      full_name: user.full_name,
      login: user.login,
      role: user.role,
      teacher_id: user.teacher_id
    })

    res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        login: user.login,
        role: user.role,
        role_label: ROLE_LABELS[user.role] || user.role,
        teacher_id: user.teacher_id
      }
    })
  } catch (error) {
    console.error('ПОМИЛКА АВТОРИЗАЦІЇ:', error)
    res.status(500).json({ message: 'Не вдалося увійти в систему.' })
  }
}

export async function getCurrentUser(req, res) {
  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : null

    if (!token) {
      return res.status(401).json({ message: 'Токен не надано.' })
    }

    const payload = verifyToken(token)
    const [rows] = await pool.query(
      `SELECT id, full_name, login, role, teacher_id
       FROM users
       WHERE id = ?`,
      [payload.id]
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Користувача не знайдено.' })
    }

    const user = rows[0]
    res.json({
      id: user.id,
      full_name: user.full_name,
      login: user.login,
      role: user.role,
      role_label: ROLE_LABELS[user.role] || user.role,
      teacher_id: user.teacher_id
    })
  } catch (error) {
    res.status(401).json({ message: 'Сесія недійсна або завершилась.' })
  }
}
