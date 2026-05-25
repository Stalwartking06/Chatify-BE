import Message from '../models/Message.js';
import User from '../models/User.js';
import { uploadImage } from '../services/cloudinaryService.js';
import { emitToUser, userSockets } from '../sockets/socketHandler.js';

export const sendMessage = async (req, res) => {
  const { receiverId, text } = req.body;

  const senderId = req.user._id;

  try {

    // Verify friendship
    const isFriend = await User.exists({
      _id: senderId,
      friends: receiverId,
    });

    if (!isFriend) {
      return res.status(403).json({
        success: false,
        message:
          'You can only exchange messages with accepted contacts.',
      });
    }

    let imageUrl = '';

    // Upload image
    if (req.file?.buffer) {

      imageUrl = await uploadImage(
        req.file.buffer,
        'chats'
      );

      // Upload failed
      if (!imageUrl) {
        return res.status(500).json({
          success: false,
          message: 'Image upload failed.',
        });
      }
    }

    // Empty message check
    if (!text?.trim() && !imageUrl) {
      return res.status(400).json({
        success: false,
        message:
          'Message cannot be empty. Send text or an image.',
      });
    }

    // Receiver online check
    const isReceiverOnline = userSockets.has(
      receiverId.toString()
    );

    const initialStatus = isReceiverOnline
      ? 'delivered'
      : 'sent';

    // Create message
    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,
      text: text?.trim() || '',
      image: imageUrl,
      status: initialStatus,
    });

    // Lightweight realtime payload
    const realtimeMessage = {
      _id: message._id,

      sender: {
        _id: req.user._id,
        username: req.user.username,
        displayName: req.user.displayName,
        avatar: req.user.avatar,
      },

      receiver: {
        _id: receiverId,
      },

      text: message.text,
      image: message.image,
      status: message.status,
      createdAt: message.createdAt,
    };

    // Emit realtime events
    emitToUser(
      receiverId,
      'new-message',
      realtimeMessage
    );

    emitToUser(
      senderId,
      'new-message',
      realtimeMessage
    );

    res.status(201).json({
      success: true,
      message: realtimeMessage,
    });

  } catch (error) {

    console.error(
      'Send Message Error:',
      error.message
    );

    res.status(500).json({
      success: false,
      message: 'Server error sending message.',
    });
  }
};

export const getMessages = async (req, res) => {

  const { friendId } = req.params;

  const userId = req.user._id;

  try {

    // Verify friendship
    const isFriend = await User.exists({
      _id: userId,
      friends: friendId,
    });

    if (!isFriend) {
      return res.status(403).json({
        success: false,
        message:
          'You can only view messages of accepted contacts.',
      });
    }

    // Fetch latest messages
    const messages = await Message.find({
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
    })
      .sort({ createdAt: 1 })
      .limit(50)
      .lean();

    // Count unread
    const unreadCount = await Message.countDocuments({
      sender: friendId,
      receiver: userId,
      status: {
        $ne: 'seen',
      },
    });

    // Update seen only if required
    if (unreadCount > 0) {

      await Message.updateMany(
        {
          sender: friendId,
          receiver: userId,
          status: {
            $ne: 'seen',
          },
        },
        {
          $set: {
            status: 'seen',
          },
        }
      );

      // Notify sender
      emitToUser(friendId, 'messages-seen', {
        senderId: userId,
      });
    }

    res.json({
      success: true,
      messages,
    });

  } catch (error) {

    console.error(
      'Get Messages Error:',
      error.message
    );

    res.status(500).json({
      success: false,
      message: 'Server error retrieving messages.',
    });
  }
};