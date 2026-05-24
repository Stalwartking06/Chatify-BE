import express from 'express';
import {
  sendFriendRequest,
  respondToFriendRequest,
  getFriendRequests,
  getFriends,
} from '../controllers/friendController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.post('/request', sendFriendRequest);
router.post('/respond', respondToFriendRequest);
router.get('/requests', getFriendRequests);
router.get('/list', getFriends);

export default router;
