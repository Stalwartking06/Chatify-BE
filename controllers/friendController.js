import FriendRequest from '../models/FriendRequest.js';
import User from '../models/User.js';
import { emitToUser } from '../sockets/socketHandler.js';
import Message from '../models/Message.js';
import mongoose from 'mongoose';

export const sendFriendRequest = async (req, res) => {
  const { receiverId } = req.body;

  const senderId = req.user._id;

  // Prevent self request
  if (senderId.toString() === receiverId) {
    return res.status(400).json({
      success: false,
      message: 'You cannot send a request to yourself.',
    });
  }

  try {
    // Verify receiver exists
    const receiverExists = await User.exists({
      _id: receiverId,
    });

    if (!receiverExists) {
      return res.status(404).json({
        success: false,
        message: 'Target user not found.',
      });
    }

    // Check existing friendship efficiently
    const isAlreadyFriend = await User.exists({
      _id: senderId,
      friends: receiverId,
    });

    if (isAlreadyFriend) {
      return res.status(400).json({
        success: false,
        message: 'You are already friends with this user.',
      });
    }

    // Existing request check
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

      if (existingRequest.status === 'pending') {
        return res.status(400).json({
          success: false,
          message: 'A pending friend request already exists.',
        });
      }

      // Remove old rejected request
      await FriendRequest.findByIdAndDelete(existingRequest._id);
    }

    // Create request
    const request = await FriendRequest.create({
      sender: senderId,
      receiver: receiverId,
      status: 'pending',
    });

    // Lightweight populated response
    const populatedRequest = await FriendRequest.findById(request._id)
      .populate('sender', 'displayName username avatar bio')
      .populate('receiver', 'displayName username avatar bio')
      .lean();

    // Realtime notify
    emitToUser(receiverId, 'friend-request-received', populatedRequest);

    res.status(201).json({
      success: true,
      message: 'Friend request sent successfully',
      friendRequest: populatedRequest,
    });

  } catch (error) {

    console.error('Send Friend Request Error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Server error sending request.',
    });
  }
};

export const respondToFriendRequest = async (req, res) => {
  const { requestId, action } = req.body;

  const userId = req.user._id;

  // Validate action
  if (!['accepted', 'rejected'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid action. Must be accepted or rejected.',
    });
  }

  try {

    const request = await FriendRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found.',
      });
    }

    // Security check
    if (request.receiver.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to respond to this request.',
      });
    }

    // Already processed
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'This request has already been processed.',
      });
    }

    // ACCEPT
    if (action === 'accepted') {

      request.status = 'accepted';

      await request.save();

      // Add both users as friends
      await Promise.all([
        User.findByIdAndUpdate(
          request.sender,
          {
            $addToSet: {
              friends: request.receiver,
            },
          }
        ),

        User.findByIdAndUpdate(
          request.receiver,
          {
            $addToSet: {
              friends: request.sender,
            },
          }
        ),
      ]);

      // Fetch minimal profiles
      const [senderUser, receiverUser] = await Promise.all([

        User.findById(request.sender)
          .select(
            'displayName username avatar bio onlineStatus lastSeen'
          )
          .lean(),

        User.findById(request.receiver)
          .select(
            'displayName username avatar bio onlineStatus lastSeen'
          )
          .lean(),
      ]);

      // Notify sender
      emitToUser(request.sender.toString(), 'friend-request-accepted', {
        requestId,
        friend: receiverUser,
      });

      // Notify receiver tabs
      emitToUser(request.receiver.toString(), 'friend-request-accepted', {
        requestId,
        friend: senderUser,
      });

      return res.json({
        success: true,
        message: 'Friend request accepted.',
        status: 'accepted',
        friend: senderUser,
      });
    }

    // REJECT
    await FriendRequest.findByIdAndDelete(requestId);

    emitToUser(request.sender.toString(), 'friend-request-rejected', {
      requestId,
    });

    res.json({
      success: true,
      message: 'Friend request rejected.',
      status: 'rejected',
    });

  } catch (error) {

    console.error('Respond Friend Request Error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Server error responding to request.',
    });
  }
};

export const getFriendRequests = async (req, res) => {
  try {

    // Parallel queries
    const [incoming, outgoing] = await Promise.all([

      FriendRequest.find({
        receiver: req.user._id,
        status: 'pending',
      })
        .populate(
          'sender',
          'displayName username avatar bio'
        )
        .lean(),

      FriendRequest.find({
        sender: req.user._id,
        status: 'pending',
      })
        .populate(
          'receiver',
          'displayName username avatar bio'
        )
        .lean(),
    ]);

    res.json({
      success: true,
      incoming,
      outgoing,
    });

  } catch (error) {

    console.error('Get Friend Requests Error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Server error retrieving requests.',
    });
  }
};

export const getFriends = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('friends')
      .populate(
        'friends',
        '_id displayName username avatar bio onlineStatus lastSeen'
      )
      .lean();

    if (!user || !user.friends || user.friends.length === 0) {
      return res.json({
        success: true,
        friends: [],
      });
    }

    const friendIds = user.friends.map((f) => f._id);
    
    // Explicitly cast string/raw IDs to Mongoose ObjectIds for reliable Aggregation matching
    const friendObjectIds = friendIds.map((fId) => new mongoose.Types.ObjectId(fId));
    const userObjectId = new mongoose.Types.ObjectId(req.user._id);

    // High performance aggregation to fetch the last message for all friends
    const lastMessages = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: userObjectId, receiver: { $in: friendObjectIds } },
            { receiver: userObjectId, sender: { $in: friendObjectIds } },
          ],
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', userObjectId] },
              '$receiver',
              '$sender',
            ],
          },
          lastMessage: { $first: '$$ROOT' },
        },
      },
    ]);

    const lastMessagesMap = new Map(
      lastMessages.map((item) => [item._id.toString(), item.lastMessage])
    );

    const friendsWithLastMessage = user.friends.map((friend) => ({
      ...friend,
      lastMessage: lastMessagesMap.get(friend._id.toString()) || null,
    }));

    res.json({
      success: true,
      friends: friendsWithLastMessage,
    });

  } catch (error) {
    console.error('Get Friends Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving friends.',
    });
  }
};