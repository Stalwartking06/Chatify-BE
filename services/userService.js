import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import { uploadImage } from "./cloudinaryService.js";
import ApiError from "../utils/ApiError.js";

export const updateUserProfile = async (userId, displayName, bio, file) => {
  const updateData = {};

  if (displayName?.trim()) {
    updateData.displayName = displayName.trim();
  }

  if (bio !== undefined) {
    updateData.bio = bio.trim();
  }

  if (file?.buffer) {
    const imageUrl = await uploadImage(file.buffer, "avatars");

    if (!imageUrl) {
      throw new ApiError(500, "Avatar upload failed.");
    }

    updateData.avatar = imageUrl;
  }

  const user = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  })
    .populate("friends", "displayName username avatar onlineStatus lastSeen")
    .lean();

  return {
    success: true,
    message: "Profile updated successfully",
    user,
  };
};

export const searchUsers = async (currentUserId, query) => {
  if (!query?.trim()) {
    return {
      success: true,
      users: [],
    };
  }

  if (query.length < 2) {
    return {
      success: true,
      users: [],
    };
  }

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const searchRegex = new RegExp(`^${escapedQuery}`, "i");

  const currentUser = await User.findById(currentUserId)
    .select('blockedUsers')
    .lean();

  const users = await User.find({
    _id: {
      $ne: currentUserId,
      $nin: currentUser?.blockedUsers || [],
    },

    $or: [
      {
        username: searchRegex,
      },
      {
        displayName: searchRegex,
      },
    ],
  })
    .select("displayName username avatar bio onlineStatus")
    .limit(10)
    .lean();

  return {
    success: true,
    users,
  };
};

export const getProfile = async (userId) => {
  const user = await User.findById(userId)
    .select("displayName username avatar bio onlineStatus lastSeen")
    .lean();

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return {
    success: true,
    user,
  };
};

export const blockUser = async (userId, targetUserId) => {
  if (userId.toString() === targetUserId.toString()) {
    throw new ApiError(400, "You cannot block yourself");
  }

  await FriendRequest.deleteMany({
    $or: [
      {
        sender: userId,
        receiver: targetUserId,
      },
      {
        sender: targetUserId,
        receiver: userId,
      },
    ],
  });
  await User.findByIdAndUpdate(userId, {
    $addToSet: {
      blockedUsers: targetUserId,
    },
    $pull: {
      friends: targetUserId,
    },
  });

  await User.findByIdAndUpdate(targetUserId, {
    $pull: {
      friends: userId,
    },
  });

  return {
    success: true,
    message: "User blocked successfully",
  };
};

export const unblockUser = async (userId, targetUserId) => {
  await User.findByIdAndUpdate(userId, {
    $pull: {
      blockedUsers: targetUserId,
    },
  });

  return {
    success: true,
    message: "User unblocked successfully",
  };
};
