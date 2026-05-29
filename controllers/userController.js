import asyncHandler from "../utils/asyncHandler.js";
import * as userService from "../services/userService.js";

export const updateProfile = asyncHandler(async (req, res) => {
  const result = await userService.updateUserProfile(
    req.user._id,
    req.body.displayName,
    req.body.bio,
    req.file,
  );

  res.json(result);
});

export const searchUsers = asyncHandler(async (req, res) => {
  const result = await userService.searchUsers(req.user._id, req.query.query);

  res.json(result);
});

export const getProfile = asyncHandler(async (req, res) => {
  const result = await userService.getProfile(req.params.id);

  res.json(result);
});

export const blockUser = asyncHandler(async (req, res) => {
  const result = await userService.blockUser(req.user._id, req.body.userId);

  res.json(result);
});

export const unblockUser = asyncHandler(async (req, res) => {
  const result = await userService.unblockUser(req.user._id, req.body.userId);

  res.json(result);
});
