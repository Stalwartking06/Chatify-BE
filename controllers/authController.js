import asyncHandler from "../utils/asyncHandler.js";
import * as authService from "../services/authService.js";

export const register = asyncHandler(async (req, res) => {
  const result = await authService.registerUser(req.body, res);

  res.status(201).json(result);
});

export const login = asyncHandler(async (req, res) => {
  const { emailOrUsername, password } = req.body;

  const result = await authService.loginUser(emailOrUsername, password, res);

  res.json(result);
});

export const logout = asyncHandler(async (req, res) => {
  const result = await authService.logoutUser(req.user?._id, res);

  res.json(result);
});

export const refreshToken = asyncHandler(async (req, res) => {
  const result = await authService.refreshUserToken(
    req.cookies.refreshToken,
    res,
  );

  res.json(result);
});

export const getMe = asyncHandler(async (req, res) => {
  const result = await authService.getCurrentUser(req.user._id);

  res.json(result);
});
