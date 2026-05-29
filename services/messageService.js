import Message from "../models/Message.js";
import User from "../models/User.js";
import { uploadImage } from "./cloudinaryService.js";
import { emitToUser, userSockets } from "../sockets/socketHandler.js";
import ApiError from "../utils/ApiError.js";

export const send = async (sender, receiverId, text, clientMessageId, file) => {
  const senderId = sender._id;

  const isFriend = await User.exists({
    _id: senderId,
    friends: receiverId,
  });
  const blocked = await User.exists({
    _id: receiverId,
    blockedUsers: senderId,
  });

  if (blocked) {
    throw new ApiError(403, "You cannot message this user");
  }

  if (!isFriend) {
    throw new ApiError(
      403,
      "You can only exchange messages with accepted contacts.",
    );
  }

  let imageUrl = "";

  if (file?.buffer) {
    imageUrl = await uploadImage(file.buffer, "chats");

    if (!imageUrl) {
      throw new ApiError(500, "Image upload failed.");
    }
  }

  if (!text?.trim() && !imageUrl) {
    throw new ApiError(400, "Message cannot be empty. Send text or an image.");
  }

  const isReceiverOnline = userSockets.has(receiverId.toString());

  const initialStatus = isReceiverOnline ? "delivered" : "sent";

  const message = await Message.create({
    sender: senderId,
    receiver: receiverId,
    text: text?.trim() || "",
    image: imageUrl,
    status: initialStatus,
    clientMessageId: clientMessageId || "",
  });

  const realtimeMessage = {
    _id: message._id,

    sender: {
      _id: sender._id,
      username: sender.username,
      displayName: sender.displayName,
      avatar: sender.avatar,
    },

    receiver: {
      _id: receiverId,
    },

    text: message.text,
    image: message.image,
    status: message.status,
    clientMessageId: message.clientMessageId,
    createdAt: message.createdAt,
  };

  emitToUser(receiverId, "new-message", realtimeMessage);

  emitToUser(senderId, "new-message", realtimeMessage);

  return {
    success: true,
    message: realtimeMessage,
  };
};

export const getHistory = async (userId, friendId, limit, before) => {
  console.log({
    userId,
    friendId
  });

  const isFriend = await User.exists({
    _id: userId,
    friends: friendId,
  });

  console.log({
    isFriend
  });

  if (!isFriend) {
    throw new ApiError(403, "You can only view messages of accepted contacts.");
  }

  const query = {
    $or: [
      {
        sender: userId,
        receiver: friendId,
      },
      {
        sender: friendId,
        receiver: userId,
      },
    ],
  };

  if (before) {
    query.createdAt = {
      $lt: new Date(before),
    };
  }

  const messages = await Message.find(query)
    .sort({
      createdAt: -1,
    })
    .limit(limit)
    .lean();

  messages.reverse();

  console.log({
    messageCount: messages.length
  });

  const unreadCount = await Message.countDocuments({
    sender: friendId,
    receiver: userId,
    status: {
      $ne: "seen",
    },
  });

  if (unreadCount > 0) {
    await Message.updateMany(
      {
        sender: friendId,
        receiver: userId,
        status: {
          $ne: "seen",
        },
      },
      {
        $set: {
          status: "seen",
        },
      },
    );

    emitToUser(friendId, "messages-seen", {
      senderId: userId,
    });
  }

  return {
    success: true,
    messages,
  };
};

export const editMessage = async (userId, messageId, text) => {
  const message = await Message.findById(messageId);

  if (!message) {
    throw new ApiError(404, "Message not found");
  }

  if (message.sender.toString() !== userId.toString()) {
    throw new ApiError(403, "Not authorized");
  }

  const FIVE_MINUTES = 5 * 60 * 1000;

  if (Date.now() - message.createdAt.getTime() > FIVE_MINUTES) {
    throw new ApiError(400, "Edit window expired");
  }
  message.text = text.trim();

  message.edited = true;

  message.editedAt = new Date();

  await message.save();

  emitToUser(message.receiver.toString(), "message-edited", {
    messageId,
    text: message.text,
    edited: true,
    editedAt: message.editedAt,
  });

  emitToUser(userId, "message-edited", {
    messageId,
    text: message.text,
    edited: true,
    editedAt: message.editedAt,
  });

  return {
    success: true,
    message: "Message updated",
  };
};

export const deleteMessage = async (userId, messageId) => {
  const message = await Message.findById(messageId);

  if (!message) {
    throw new ApiError(404, "Message not found");
  }

  if (message.sender.toString() !== userId.toString()) {
    throw new ApiError(403, "Not authorized");
  }

  message.text = "This message was deleted";

  message.image = "";

  message.deletedForEveryone = true;

  await message.save();

  emitToUser(message.receiver.toString(), "message-deleted", {
    messageId,
  });

  emitToUser(userId, "message-deleted", {
    messageId,
  });

  return {
    success: true,
    message: "Message deleted successfully",
  };
};
