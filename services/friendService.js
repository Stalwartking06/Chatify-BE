import FriendRequest from "../models/FriendRequest.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import mongoose from "mongoose";
import { emitToUser } from "../sockets/socketHandler.js";
import ApiError from "../utils/ApiError.js";

/**
 * Send Friend Request
 */
export const sendRequest = async (senderId, receiverId) => {
  const blocked = await User.exists({
    _id: receiverId,
    blockedUsers: senderId,
  });

  if (blocked) {
    throw new ApiError(403, "You cannot send request to this user");
  }
  if (senderId.toString() === receiverId) {
    throw new ApiError(400, "You cannot send a request to yourself.");
  }

  const receiverExists = await User.exists({
    _id: receiverId,
  });

  if (!receiverExists) {
    throw new ApiError(404, "Target user not found.");
  }

  const isAlreadyFriend = await User.exists({
    _id: senderId,
    friends: receiverId,
  });

  if (isAlreadyFriend) {
    throw new ApiError(400, "You are already friends with this user.");
  }

  const existingRequest = await FriendRequest.findOne({
    $or: [
      {
        sender: senderId,
        receiver: receiverId,
      },
      {
        sender: receiverId,
        receiver: senderId,
      },
    ],
  }).lean();

  if (existingRequest) {
    if (existingRequest.status === "pending") {
      throw new ApiError(400, "A pending friend request already exists.");
    }

    await FriendRequest.findByIdAndDelete(existingRequest._id);
  }

  const request = await FriendRequest.create({
    sender: senderId,
    receiver: receiverId,
    status: "pending",
  });

  const populatedRequest = await FriendRequest.findById(request._id)
    .populate("sender", "displayName username avatar bio")
    .populate("receiver", "displayName username avatar bio")
    .lean();

  emitToUser(receiverId, "friend-request-received", populatedRequest);

  return {
    success: true,
    message: "Friend request sent successfully",
    friendRequest: populatedRequest,
  };
};

/**
 * Respond To Request
 */
export const respondRequest = async (requestId, action, userId) => {
  if (!["accepted", "rejected"].includes(action)) {
    throw new ApiError(400, "Invalid action. Must be accepted or rejected.");
  }

  const request = await FriendRequest.findById(requestId);

  if (!request) {
    throw new ApiError(404, "Friend request not found.");
  }

  if (request.receiver.toString() !== userId.toString()) {
    throw new ApiError(
      403,
      "You are not authorized to respond to this request.",
    );
  }

  if (request.status !== "pending") {
    throw new ApiError(400, "This request has already been processed.");
  }

  /**
   * ACCEPT
   */

  if (action === "accepted") {
    request.status = "accepted";

    await request.save();

    await Promise.all([
      User.findByIdAndUpdate(request.sender, {
        $addToSet: {
          friends: request.receiver,
        },
      }),

      User.findByIdAndUpdate(request.receiver, {
        $addToSet: {
          friends: request.sender,
        },
      }),
    ]);

    const [senderUser, receiverUser] = await Promise.all([
      User.findById(request.sender)
        .select("displayName username avatar bio onlineStatus lastSeen")
        .lean(),

      User.findById(request.receiver)
        .select("displayName username avatar bio onlineStatus lastSeen")
        .lean(),
    ]);

    emitToUser(request.sender.toString(), "friend-request-accepted", {
      requestId,
      friend: receiverUser,
    });

    emitToUser(request.receiver.toString(), "friend-request-accepted", {
      requestId,
      friend: senderUser,
    });

    return {
      success: true,
      message: "Friend request accepted.",
      status: "accepted",
      friend: senderUser,
    };
  }

  /**
   * REJECT
   */

  await FriendRequest.findByIdAndDelete(requestId);

  emitToUser(request.sender.toString(), "friend-request-rejected", {
    requestId,
  });

  return {
    success: true,
    message: "Friend request rejected.",
    status: "rejected",
  };
};

/**
 * Get Requests
 */
export const getRequests = async (userId) => {
  const [incoming, outgoing] = await Promise.all([
    FriendRequest.find({
      receiver: userId,
      status: "pending",
    })
      .populate("sender", "displayName username avatar bio")
      .lean(),

    FriendRequest.find({
      sender: userId,
      status: "pending",
    })
      .populate("receiver", "displayName username avatar bio")
      .lean(),
  ]);

  return {
    success: true,
    incoming,
    outgoing,
  };
};

/**
 * Get Friends List
 */
export const getFriendsList = async (userId) => {
  const user = await User.findById(userId)
    .select("friends")
    .populate(
      "friends",
      "_id displayName username avatar bio onlineStatus lastSeen",
    )
    .lean();

  if (!user || !user.friends || user.friends.length === 0) {
    return {
      success: true,
      friends: [],
    };
  }

  const friendIds = user.friends.map((friend) => friend._id);

  const friendObjectIds = friendIds.map(
    (id) => new mongoose.Types.ObjectId(id),
  );

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const lastMessages = await Message.aggregate([
    {
      $match: {
        $or: [
          {
            sender: userObjectId,
            receiver: {
              $in: friendObjectIds,
            },
          },
          {
            receiver: userObjectId,
            sender: {
              $in: friendObjectIds,
            },
          },
        ],
      },
    },

    {
      $sort: {
        createdAt: -1,
      },
    },

    {
      $group: {
        _id: {
          $cond: [
            {
              $eq: ["$sender", userObjectId],
            },
            "$receiver",
            "$sender",
          ],
        },

        lastMessage: {
          $first: "$$ROOT",
        },
      },
    },
  ]);

  const lastMessagesMap = new Map(
    lastMessages.map((item) => [item._id.toString(), item.lastMessage]),
  );

  const friendsWithLastMessage = user.friends.map((friend) => ({
    ...friend,
    lastMessage: lastMessagesMap.get(friend._id.toString()) || null,
  }));

  return {
    success: true,
    friends: friendsWithLastMessage,
  };
};

/**
 * Remove Friend
 */
export const removeFriend = async (userId, friendId) => {
  const isFriend = await User.exists({
    _id: userId,
    friends: friendId,
  });

  if (!isFriend) {
    throw new ApiError(404, "Friend not found");
  }

  await Promise.all([
    User.findByIdAndUpdate(userId, {
      $pull: {
        friends: friendId,
      },
    }),

    User.findByIdAndUpdate(friendId, {
      $pull: {
        friends: userId,
      },
    }),
  ]);

  emitToUser(friendId.toString(), "friend-removed", {
    friendId: userId,
  });

  emitToUser(userId.toString(), "friend-removed", {
    friendId,
  });

  return {
    success: true,
    message: "Friend removed successfully",
  };
};
