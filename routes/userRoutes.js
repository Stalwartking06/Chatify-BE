import express from 'express';
import { updateProfile, searchUsers, getProfile } from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';
import { updateProfileRules, handleValidationErrors } from '../validations/authValidation.js';
import upload from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.use(protect);

router.put('/update', upload.single('avatar'), updateProfileRules, handleValidationErrors, updateProfile);
router.get('/search', searchUsers);
router.get('/profile/:id', getProfile);

export default router;
