import asyncHandler from "../utils/asyncHandler.js";
import * as friendService from "../services/friendService.js";

export const sendFriendRequest = asyncHandler(async (req, res) => {
  const result = await friendService.sendRequest(
    req.user._id,
    req.body.receiverId,
  );

  res.status(201).json(result);
});

export const respondToFriendRequest = asyncHandler(async (req, res) => {
  const result = await friendService.respondRequest(
    req.body.requestId,
    req.body.action,
    req.user._id,
  );

  res.json(result);
});

export const getFriendRequests = asyncHandler(async (req, res) => {
  const result = await friendService.getRequests(req.user._id);

  res.json(result);
});

export const getFriends = asyncHandler(async (req, res) => {
  const result = await friendService.getFriendsList(req.user._id);

  res.json(result);
});

export const removeFriend = asyncHandler(async (req, res) => {
  const result = await friendService.removeFriend(
    req.user._id,
    req.params.friendId,
  );

  res.json(result);
});
