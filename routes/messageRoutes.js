import express from "express";
import { sendMessage, getMessages, editMessage, deleteMessage } from "../controllers/messageController.js";
import { protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.use(protect);

router.post("/send", apiLimiter, upload.single("image"), sendMessage);
router.get("/history/:friendId", getMessages);
router.put("/edit/:messageId", apiLimiter, editMessage);

router.delete("/delete/:messageId", apiLimiter, deleteMessage);

export default router;
