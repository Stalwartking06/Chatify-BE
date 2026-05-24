import Message from '../models/Message.js';
import User from '../models/User.js';
import { uploadImage } from '../services/cloudinaryService.js';
import { emitToUser, userSockets } from '../sockets/socketHandler.js';

export const sendMessage = async (req, res) => {
  const { receiverId, text } = req.body;
  const senderId = req.user._id;

  try {
    // 1. Enforce security: users MUST be friends/contacts to message each other
    const sender = await User.findById(senderId);
    const isFriend = sender.friends.some((friend) => friend.toString() === receiverId.toString());
    if (!isFriend) {
      return res.status(403).json({
        success: false,
        message: 'You can only exchange messages with accepted contacts.',
      });
    }

    let imageUrl = '';
    // 2. Handle image upload if present
    if (req.file) {
      imageUrl = await uploadImage(req.file.path, 'chats');
    }

    if (!text && !imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot be empty. Send text or an image.',
      });
    }

    // Check if receiver is online to determine initial message status
    const isReceiverOnline = userSockets.has(receiverId.toString());
    const initialStatus = isReceiverOnline ? 'delivered' : 'sent';

    // 3. Create and save message (TTL index automatically schedules deletion in 24 hours)
    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,
      text: text || '',
      image: imageUrl,
      status: initialStatus,
    });

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'displayName username avatar')
      .populate('receiver', 'displayName username avatar');

    // 4. Emit real-time events to sync all active tabs of sender and receiver
    emitToUser(receiverId, 'new-message', populatedMessage);
    emitToUser(senderId, 'new-message', populatedMessage);

    res.status(201).json({
      success: true,
      message: populatedMessage,
    });
  } catch (error) {
    console.error('Send Message Error:', error);
    res.status(500).json({ success: false, message: 'Server error sending message.' });
  }
};

export const getMessages = async (req, res) => {
  const { friendId } = req.params;
  const userId = req.user._id;

  try {
    // 1. Verify friendship
    const user = await User.findById(userId);
    const isFriend = user.friends.some((friend) => friend.toString() === friendId.toString());
    if (!isFriend) {
      return res.status(403).json({
        success: false,
        message: 'You can only view messages of accepted contacts.',
      });
    }

    // 2. Fetch history (MongoDB TTL index naturally prunes files older than 24 hours)
    const messages = await Message.find({
      $or: [
        { sender: userId, receiver: friendId },
        { sender: friendId, receiver: userId },
      ],
    }).sort({ createdAt: 1 });

    // 3. Mark all unread messages received from this friend as 'seen'
    const unreadMessages = await Message.find({
      sender: friendId,
      receiver: userId,
      status: { $ne: 'seen' },
    });

    if (unreadMessages.length > 0) {
      await Message.updateMany(
        { sender: friendId, receiver: userId, status: { $ne: 'seen' } },
        { $set: { status: 'seen' } }
      );

      // Notify the friend that their messages have been seen by this user
      emitToUser(friendId, 'messages-seen', { senderId: userId });
    }

    res.json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error('Get Messages Error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving messages.' });
  }
};
