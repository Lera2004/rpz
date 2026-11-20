import express from 'express'
import multer from 'multer'
import { requireAdmin } from '../controllers/authController.js'
import {
  exportReport,
  exportGroupList,
  exportStatement,
  deleteStatementTemplate,
  getStatementGroups,
  getStatementTemplates,
  uploadStatementTemplate
} from '../controllers/statementController.js'

const router = express.Router()
const templateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!/\.docx$/i.test(file.originalname || '')) {
      return callback(new Error('Оберіть шаблон Word у форматі .docx'))
    }
    callback(null, true)
  }
})

const receiveTemplate = (req, res, next) => {
  templateUpload.single('template')(req, res, (error) => {
    if (error) return res.status(400).json({ message: error.message || 'Не вдалося завантажити шаблон' })
    next()
  })
}

router.get('/groups', getStatementGroups)
router.get('/templates', getStatementTemplates)
router.get('/group-list/:groupId', exportGroupList)
router.post('/templates/:reportType', requireAdmin, receiveTemplate, uploadStatementTemplate)
router.delete('/templates/:reportType', requireAdmin, deleteStatementTemplate)
router.get('/export/:groupId/:reportType', exportReport)
router.get('/export/:groupId', exportStatement)

export default router
