import { body, validationResult } from 'express-validator';

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

export const registerRules = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 20 }).withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain alphanumeric characters and underscores'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),

  body('displayName')
    .trim()
    .notEmpty().withMessage('Display name is required')
    .isLength({ max: 30 }).withMessage('Display name cannot exceed 30 characters'),
];

export const loginRules = [
  body('emailOrUsername')
    .trim()
    .notEmpty().withMessage('Username or Email is required'),
  
  body('password')
    .notEmpty().withMessage('Password is required'),
];

export const updateProfileRules = [
  body('displayName')
    .optional()
    .trim()
    .notEmpty().withMessage('Display name cannot be empty')
    .isLength({ max: 30 }).withMessage('Display name cannot exceed 30 characters'),

  body('bio')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Bio cannot exceed 100 characters'),
];
