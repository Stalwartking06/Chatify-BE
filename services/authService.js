import jwt from "jsonwebtoken";
import User from "../models/User.js";
import {
  generateAccessToken,
  generateRefreshToken,
  setTokenCookies,
  clearTokenCookies,
} from "../utils/token.js";
import ApiError from "../utils/ApiError.js";

export const registerUser = async (userData, res) => {
  const { username, email, password, displayName } = userData;

  const existingUser = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
  });

  if (existingUser) {
    throw new ApiError(400, "Username or email already exists.");
  }

  const user = await User.create({
    username,
    email,
    password,
    displayName,
  });

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  setTokenCookies(res, accessToken, refreshToken);

  return {
    success: true,
    message: "Registration successful",
    user: {
      _id: user._id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: user.bio,
      friends: user.friends,
    },
    token: accessToken,
  };
};

export const loginUser = async (emailOrUsername, password, res) => {
  const user = await User.findOne({
    $or: [
      {
        email: emailOrUsername.toLowerCase(),
      },
      {
        username: emailOrUsername.toLowerCase(),
      },
    ],
  }).select("+password");

  if (!user) {
    throw new ApiError(401, "Invalid credentials.");
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    throw new ApiError(401, "Invalid credentials.");
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  setTokenCookies(res, accessToken, refreshToken);

  return {
    success: true,
    message: "Login successful",
    user: {
      _id: user._id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: user.bio,
      friends: user.friends,
    },
    token: accessToken,
  };
};

export const logoutUser = async (userId, res) => {
  if (userId) {
    await User.findByIdAndUpdate(userId, {
      onlineStatus: false,
      lastSeen: new Date(),
    });
  }

  clearTokenCookies(res);

  return {
    success: true,
    message: "Logged out successfully.",
  };
};

export const refreshUserToken = async (refreshToken, res) => {
  if (!refreshToken) {
    throw new ApiError(401, "Refresh token not found");
  }

  let decoded;

  try {
    decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || "refresh_secret_12345_abcde",
    );
  } catch {
    clearTokenCookies(res);

    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(decoded.id);

  if (!user) {
    throw new ApiError(401, "User not found");
  }

  const accessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  setTokenCookies(res, accessToken, newRefreshToken);

  return {
    success: true,
    token: accessToken,
  };
};

export const getCurrentUser = async (userId) => {
  const user = await User.findById(userId)
    .select("_id username email displayName avatar bio onlineStatus lastSeen")
    .lean();

  return {
    success: true,
    user,
  };
};
