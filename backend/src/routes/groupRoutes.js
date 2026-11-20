import express from 'express'
import multer from 'multer'
import { requireAdmin } from '../controllers/authController.js'

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
  getApplicantActionHistory,
  importStudentContacts,
  importStudentPhotos,
  getApplicantPhoto,
  updateApplicantManualDetails,
  uploadApplicantManualPhoto
} from '../controllers/groupController.js'


const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })
const contactUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 }
})
const photoArchiveUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 10 }
})
const manualPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(new Error('Підтримуються фото у форматах JPG, PNG або WEBP'))
    }
    callback(null, true)
  }
})

const receivePhotoArchives = (req, res, next) => {
  photoArchiveUpload.array('files', 10)(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message || 'Не вдалося завантажити ZIP-архіви' })
    }
    next()
  })
}

const receiveContactSpreadsheet = (req, res, next) => {
  contactUpload.single('file')(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message || 'Не вдалося завантажити Excel-файл' })
    }
    next()
  })
}


// Отримати всі групи
router.get('/', getGroups)


// Створити групу
router.post('/', createGroup)


// Імпорт груп з CSV
router.post('/import', upload.single('file'), importGroups)

// Імпорт контактів студентів з Excel
router.post('/applicants/contacts/import', receiveContactSpreadsheet, importStudentContacts)

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

// Імпорт фото студентів із ZIP-архівів
router.post('/applicants/photos/import', receivePhotoArchives, importStudentPhotos)
router.get('/applicants/:applicantId/photo', getApplicantPhoto)
router.put('/applicants/:applicantId/manual-details', requireAdmin, updateApplicantManualDetails)
router.post(
  '/applicants/:applicantId/manual-photo',
  requireAdmin,
  (req, res, next) => {
    manualPhotoUpload.single('photo')(req, res, (error) => {
      if (error) return res.status(400).json({ message: error.message || 'Не вдалося завантажити фото' })
      next()
    })
  },
  uploadApplicantManualPhoto
)

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