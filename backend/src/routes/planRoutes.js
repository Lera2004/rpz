import { Router } from 'express'
import multer from 'multer'
import { requireAdmin } from '../controllers/authController.js'
import { getPlans, updatePlanDiscipline } from '../controllers/planController.js'
import { importStudyPlan } from '../controllers/planImportController.js'

const router = Router()
const planUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!/\.xlsx?$/i.test(file.originalname || '')) {
      return callback(new Error('Оберіть робочий план у форматі .xls або .xlsx'))
    }
    callback(null, true)
  }
})

const receivePlanFile = (req, res, next) => {
  planUpload.single('file')(req, res, (error) => {
    if (error) return res.status(400).json({ message: error.message || 'Не вдалося завантажити робочий план.' })
    next()
  })
}

router.get('/', getPlans)
router.post('/import', requireAdmin, receivePlanFile, importStudyPlan)
router.patch('/disciplines/:id', updatePlanDiscipline)

export default router
