import express from 'express'
import { cancelWorkloadConfirmation, confirmWorkload, deleteWorkloadRow, exportWorkloadExcel, getWorkload, getWorkloadStatus, updateWorkloadRow } from '../controllers/workloadController.js'

const router = express.Router()

router.get('/', getWorkload)
router.get('/status', getWorkloadStatus)
router.get('/export/:teacherId', exportWorkloadExcel)
router.post('/confirm/:teacherId', confirmWorkload)
router.delete('/confirm/:teacherId', cancelWorkloadConfirmation)
router.patch('/:id', updateWorkloadRow)
router.delete('/:id', deleteWorkloadRow)

export default router
