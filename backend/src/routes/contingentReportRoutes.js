import express from 'express'
import {
  createContingentReport,
  deleteContingentReport,
  downloadContingentReport,
  getContingentReports
} from '../controllers/contingentReportController.js'

const router = express.Router()

router.get('/', getContingentReports)
router.post('/', createContingentReport)
router.delete('/:id', deleteContingentReport)
router.get('/:id/pdf', downloadContingentReport)

export default router
