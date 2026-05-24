import express from 'express';
import { register, login, logout, refreshToken, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { registerRules, loginRules, handleValidationErrors } from '../validations/authValidation.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/register', authLimiter, registerRules, handleValidationErrors, register);
router.post('/login', authLimiter, loginRules, handleValidationErrors, login);
router.post('/logout', protect, logout);
router.post('/refresh', refreshToken);
router.get('/me', protect, getMe);

export default router;
