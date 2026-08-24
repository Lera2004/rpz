import express from 'express'
import { exportReport, exportStatement, getStatementGroups } from '../controllers/statementController.js'

const router = express.Router()

router.get('/groups', getStatementGroups)
router.get('/export/:groupId/:reportType', exportReport)
router.get('/export/:groupId', exportStatement)

export default router
