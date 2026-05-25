import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Message from '../models/Message.js';

// Map of userId -> Set of socketIds
export const userSockets = new Map();

export const initSocket = (io) => {
  // Socket Authentication Middleware
  io.use(async (socket, next) => {
    try {
      let token = '';

      // Parse cookies
      const cookieHeader = socket.handshake.headers.cookie;

      if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split('=');
          acc[key] = value;
          return acc;
        }, {});

        token = cookies.accessToken;
      }

      // Fallback auth token
      if (!token && socket.handshake.auth?.token) {
        token = socket.handshake.auth.token;
      }

      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET || 'access_secret_12345_abcde'
      );

      // Minimal user fetch for performance
      const user = await User.findById(decoded.id)
        .select('_id username friends')
        .lean();

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;

      next();
    } catch (error) {
      console.error('Socket Auth Error:', error.message);
      next(new Error('Authentication error: Token invalid'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();

    if (process.env.NODE_ENV !== 'production') {
      console.log(`User connected: ${socket.user.username} (${socket.id})`);
    }

    // Create socket set if not exists
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }

    userSockets.get(userId).add(socket.id);

    // First active connection
    if (userSockets.get(userId).size === 1) {
      try {
        await User.findByIdAndUpdate(userId, {
          onlineStatus: true,
        });

        // Notify friends
        broadcastToFriends(socket.user.friends, 'user-status', {
          userId,
          onlineStatus: true,
          lastSeen: new Date(),
        });

        // Deliver pending messages
        await deliverPendingMessages(userId);
      } catch (error) {
        console.error('Online Status Error:', error.message);
      }
    }

    // Send online users
    socket.emit('online-users-list', Array.from(userSockets.keys()));

    // Typing Start
    socket.on('typing-start', ({ receiverId }) => {
      emitToUser(receiverId, 'typing-start', {
        senderId: userId,
      });
    });

    // Typing Stop
    socket.on('typing-stop', ({ receiverId }) => {
      emitToUser(receiverId, 'typing-stop', {
        senderId: userId,
      });
    });

    // Message Seen
    socket.on('message-seen', async ({ messageId, senderId }) => {
      try {
        if (messageId) {
          await Message.findByIdAndUpdate(messageId, {
            status: 'seen',
          });

          emitToUser(senderId, 'message-seen', {
            messageId,
            receiverId: userId,
          });
        }

        else if (senderId) {
          await Message.updateMany(
            {
              sender: senderId,
              receiver: userId,
              status: { $ne: 'seen' },
            },
            {
              $set: { status: 'seen' },
            }
          );

          emitToUser(senderId, 'messages-seen', {
            senderId: userId,
          });
        }
      } catch (error) {
        console.error('Seen Status Update Error:', error.message);
      }
    });

    // Disconnect
    socket.on('disconnect', async () => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`Socket disconnected: ${socket.id}`);
      }

      const userConnections = userSockets.get(userId);

      if (!userConnections) return;

      userConnections.delete(socket.id);

      // If no active connections remain
      if (userConnections.size === 0) {
        userSockets.delete(userId);

        try {
          const lastSeen = new Date();

          await User.findByIdAndUpdate(userId, {
            onlineStatus: false,
            lastSeen,
          });

          // Notify friends
          broadcastToFriends(socket.user.friends, 'user-status', {
            userId,
            onlineStatus: false,
            lastSeen,
          });

        } catch (error) {
          console.error('Offline Status Error:', error.message);
        }
      }
    });
  });
};

/**
 * Emit event to specific user
 */
export const emitToUser = (userId, event, data) => {
  const socketIds = userSockets.get(userId.toString());

  if (!socketIds || !global.ioInstance) return;

  socketIds.forEach((socketId) => {
    global.ioInstance.to(socketId).emit(event, data);
  });
};

/**
 * Broadcast event to friends
 */
const broadcastToFriends = (friends = [], event, data) => {
  if (!friends.length) return;

  friends.forEach((friendId) => {
    emitToUser(friendId.toString(), event, data);
  });
};

/**
 * Deliver pending messages
 */
const deliverPendingMessages = async (receiverId) => {
  try {
    const pendingMessages = await Message.find({
      receiver: receiverId,
      status: 'sent',
    })
      .select('_id sender')
      .lean();

    if (!pendingMessages.length) return;

    // Bulk update
    await Message.updateMany(
      {
        receiver: receiverId,
        status: 'sent',
      },
      {
        $set: {
          status: 'delivered',
        },
      }
    );

    // Notify senders
    pendingMessages.forEach((msg) => {
      emitToUser(msg.sender.toString(), 'message-delivered', {
        messageId: msg._id,
        receiverId,
      });
    });

  } catch (error) {
    console.error('Deliver Pending Messages Error:', error.message);
  }
};