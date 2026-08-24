import express from 'express'
import multer from 'multer'

import {
  getGroups,
  getSpecialtySummaries,
  createGroup,
  updateGroup,
  deleteGroup,
  importGroups,
  getGroupApplicants,
  getAcademicLeaveApplicants,
  getDismissedApplicants,
  getUngroupedApplicants,
  deleteGroupApplicant,
  previewImport,
  updateGroupApplicant,
  searchApplicantByName,
  restoreApplicantToGroup,
  getApplicantActionHistory
} from '../controllers/groupController.js'


const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })


// Отримати всі групи
router.get('/', getGroups)


// Створити групу
router.post('/', createGroup)


// Імпорт груп з CSV
router.post('/import', upload.single('file'), importGroups)

// Попередній перегляд імпорту
router.post('/import/preview', upload.single('file'), previewImport)

// Підсумки по спеціальностях
router.get('/summaries', getSpecialtySummaries)

// Пошук заявника за ПІБ
router.get('/applicants/search', searchApplicantByName)

// Історія дій студентів
router.get('/applicants/history', getApplicantActionHistory)

// Студенти без групи
router.get('/applicants/ungrouped', getUngroupedApplicants)

// Студенти, виключені з активної чисельності за статусом
router.get('/applicants/academic-leave', getAcademicLeaveApplicants)
router.get('/applicants/dismissed', getDismissedApplicants)

// Отримати заявників групи
router.get('/:id/applicants', getGroupApplicants)

// Редагувати заявника в групі
router.put('/:groupId/applicants/:applicantId', updateGroupApplicant)

// Поновити заявника в іншу групу
router.post('/applicants/restore', restoreApplicantToGroup)

// Видалити заявника групи
router.delete('/:groupId/applicants/:applicantId', deleteGroupApplicant)

// Редагувати групу
router.put('/:id', updateGroup)


// Видалити групу
router.delete('/:id', deleteGroup)


export default router