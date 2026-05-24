import FriendRequest from '../models/FriendRequest.js';
import User from '../models/User.js';
import { emitToUser } from '../sockets/socketHandler.js';

export const sendFriendRequest = async (req, res) => {
  const { receiverId } = req.body;
  const senderId = req.user._id;

  if (senderId.toString() === receiverId) {
    return res.status(400).json({ success: false, message: 'You cannot send a request to yourself.' });
  }

  try {
    // Check if target user exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ success: false, message: 'Target user not found.' });
    }

    // Check if they are already friends
    const sender = await User.findById(senderId);
    const isAlreadyFriend = sender.friends.some((friend) => friend.toString() === receiverId.toString());
    if (isAlreadyFriend) {
      return res.status(400).json({ success: false, message: 'You are already friends with this user.' });
    }

    // Check if a request already exists in either direction
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId },
      ],
    });

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.status(400).json({ success: false, message: 'A pending friend request already exists.' });
      } else {
        // If rejected, let them send it again by deleting or resetting it
        await FriendRequest.findByIdAndDelete(existingRequest._id);
      }
    }

    // Create the request
    const request = await FriendRequest.create({
      sender: senderId,
      receiver: receiverId,
      status: 'pending',
    });

    // Populate sender details for the response
    const populatedRequest = await FriendRequest.findById(request._id)
      .populate('sender', 'displayName username avatar bio')
      .populate('receiver', 'displayName username avatar bio');

    // Notify receiver in real-time
    emitToUser(receiverId, 'friend-request-received', populatedRequest);

    res.status(201).json({
      success: true,
      message: 'Friend request sent successfully',
      friendRequest: populatedRequest,
    });
  } catch (error) {
    console.error('Send Friend Request Error:', error);
    res.status(500).json({ success: false, message: 'Server error sending request.' });
  }
};

export const respondToFriendRequest = async (req, res) => {
  const { requestId, action } = req.body; // Action can be 'accepted' or 'rejected'
  const userId = req.user._id;

  if (!['accepted', 'rejected'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Invalid action. Must be accepted or rejected.' });
  }

  try {
    const request = await FriendRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Friend request not found.' });
    }

    // Make sure the current user is the receiver of the request
    if (request.receiver.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'You are not authorized to respond to this request.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'This request has already been processed.' });
    }

    if (action === 'accepted') {
      request.status = 'accepted';
      await request.save();

      // Add to each other's friends lists
      await User.findByIdAndUpdate(request.sender, { $addToSet: { friends: request.receiver } });
      await User.findByIdAndUpdate(request.receiver, { $addToSet: { friends: request.sender } });

      const senderUser = await User.findById(request.sender).select('displayName username avatar bio onlineStatus lastSeen');
      const receiverUser = await User.findById(request.receiver).select('displayName username avatar bio onlineStatus lastSeen');

      // Notify the sender that the request was accepted (and send the receiver's details)
      emitToUser(request.sender, 'friend-request-accepted', {
        requestId,
        friend: receiverUser,
      });

      // Also notify the receiver (this user)'s other sockets to update list
      emitToUser(request.receiver, 'friend-request-accepted', {
        requestId,
        friend: senderUser,
      });

      res.json({
        success: true,
        message: 'Friend request accepted.',
        status: 'accepted',
        friend: senderUser,
      });
    } else {
      // If rejected, delete the request document to allow sending request again later
      await FriendRequest.findByIdAndDelete(requestId);

      // Notify the sender that the request was rejected/declined
      emitToUser(request.sender, 'friend-request-rejected', { requestId });

      res.json({
        success: true,
        message: 'Friend request rejected.',
        status: 'rejected',
      });
    }
  } catch (error) {
    console.error('Respond Friend Request Error:', error);
    res.status(500).json({ success: false, message: 'Server error responding to request.' });
  }
};

export const getFriendRequests = async (req, res) => {
  try {
    // Get requests sent to the user
    const incoming = await FriendRequest.find({ receiver: req.user._id, status: 'pending' })
      .populate('sender', 'displayName username avatar bio');

    // Get requests sent by the user
    const outgoing = await FriendRequest.find({ sender: req.user._id, status: 'pending' })
      .populate('receiver', 'displayName username avatar bio');

    res.json({
      success: true,
      incoming,
      outgoing,
    });
  } catch (error) {
    console.error('Get Friend Requests Error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving requests.' });
  }
};

export const getFriends = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      'friends',
      'displayName username avatar bio onlineStatus lastSeen'
    );
    res.json({
      success: true,
      friends: user.friends,
    });
  } catch (error) {
    console.error('Get Friends Error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving friends.' });
  }
};
