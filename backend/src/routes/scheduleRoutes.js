import express from 'express'
import multer from 'multer'

import {
  importSchedule,
  getSchedule,
  getScheduleSummary
} from '../controllers/scheduleController.js'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })

router.get('/', getSchedule)
router.get('/summary', getScheduleSummary)
router.post('/import', upload.single('file'), importSchedule)

export default router
