import express from 'express'
import {
  getStudentDistributions,
  saveStudentDistribution,
  updateStudentDistribution,
  deleteStudentDistribution
} from '../controllers/studentDistributionController.js'

const router = express.Router()

router.get('/', getStudentDistributions)
router.post('/', saveStudentDistribution)
router.patch('/:id', updateStudentDistribution)
router.delete('/:id', deleteStudentDistribution)

export default router