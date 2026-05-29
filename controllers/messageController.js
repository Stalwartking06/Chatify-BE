import asyncHandler from "../utils/asyncHandler.js";
import * as messageService from "../services/messageService.js";

export const sendMessage = asyncHandler(async (req, res) => {
  const { receiverId, text, clientMessageId } = req.body;

  const result = await messageService.send(
    req.user,
    receiverId,
    text,
    clientMessageId,
    req.file,
  );

  res.status(201).json(result);
});

export const getMessages = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  const result = await messageService.getHistory(
    req.user._id,
    req.params.friendId,
    limit,
    req.query.before,
  );

  res.json(result);
});

export const editMessage = asyncHandler(async (req, res) => {
  const result = await messageService.editMessage(
    req.user._id,
    req.params.messageId,
    req.body.text,
  );

  res.json(result);
});

export const deleteMessage = asyncHandler(async (req, res) => {
  const result = await messageService.deleteMessage(
    req.user._id,
    req.params.messageId,
  );

  res.json(result);
});
