import express from "express";
import {
  sendFriendRequest,
  respondToFriendRequest,
  getFriendRequests,
  getFriends,
  removeFriend,
} from "../controllers/friendController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.post("/request", sendFriendRequest);
router.post("/respond", respondToFriendRequest);
router.get("/requests", getFriendRequests);
router.get("/list", getFriends);
router.delete("/remove/:friendId", removeFriend);

export default router;
