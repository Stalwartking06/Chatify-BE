import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Message from '../models/Message.js';

// Map of userId -> Set of socketIds (supports multiple tabs)
export const userSockets = new Map();

export const initSocket = (io) => {
  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      let token = '';

      // Parse cookie
      const cookieHeader = socket.handshake.headers.cookie;
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split('=');
          acc[key] = value;
          return acc;
        }, {});
        token = cookies.accessToken;
      }

      // Check query parameter fallback
      if (!token && socket.handshake.auth && socket.handshake.auth.token) {
        token = socket.handshake.auth.token;
      }

      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'access_secret_12345_abcde');
      
      const user = await User.findById(decoded.id).select('_id username friends');
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
    console.log(`User connected: ${socket.user.username} (${socket.id})`);

    // Add socket to user's set of active connections
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    // If this is the user's first connection (e.g. not just another tab)
    if (userSockets.get(userId).size === 1) {
      try {
        await User.findByIdAndUpdate(userId, { onlineStatus: true });
        
        // Notify all of their friends that they are online
        await broadcastToFriends(userId, 'user-status', {
          userId,
          onlineStatus: true,
          lastSeen: new Date(),
        });
        
        // Auto-deliver pending messages sent to this user while they were offline
        await deliverPendingMessages(userId, io);
      } catch (error) {
        console.error('Error updating user online status:', error);
      }
    }

    // Trigger immediate sync of online users for the client
    socket.emit('online-users-list', Array.from(userSockets.keys()));

    // Event: Typing start
    socket.on('typing-start', ({ receiverId }) => {
      const receiverSockets = userSockets.get(receiverId);
      if (receiverSockets) {
        receiverSockets.forEach((sid) => {
          io.to(sid).emit('typing-start', { senderId: userId });
        });
      }
    });

    // Event: Typing stop
    socket.on('typing-stop', ({ receiverId }) => {
      const receiverSockets = userSockets.get(receiverId);
      if (receiverSockets) {
        receiverSockets.forEach((sid) => {
          io.to(sid).emit('typing-stop', { senderId: userId });
        });
      }
    });

    // Event: Message Seen
    socket.on('message-seen', async ({ messageId, senderId }) => {
      try {
        if (messageId) {
          await Message.findByIdAndUpdate(messageId, { status: 'seen' });
          // Notify sender
          emitToUser(senderId, 'message-seen', { messageId, receiverId: userId });
        } else if (senderId) {
          // Bulk seen
          await Message.updateMany(
            { sender: senderId, receiver: userId, status: { $ne: 'seen' } },
            { $set: { status: 'seen' } }
          );
          emitToUser(senderId, 'messages-seen', { senderId: userId });
        }
      } catch (error) {
        console.error('Seen Status Update Error:', error);
      }
    });

    // Event: Disconnect
    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: ${socket.id}`);
      
      const userConnections = userSockets.get(userId);
      if (userConnections) {
        userConnections.delete(socket.id);
        
        // If all tabs/connections of this user are closed
        if (userConnections.size === 0) {
          userSockets.delete(userId);
          
          try {
            const lastSeen = new Date();
            await User.findByIdAndUpdate(userId, { onlineStatus: false, lastSeen });
            
            // Notify friends they are now offline
            await broadcastToFriends(userId, 'user-status', {
              userId,
              onlineStatus: false,
              lastSeen,
            });
          } catch (error) {
            console.error('Error updating user offline status:', error);
          }
        }
      }
    });
  });
};

/**
 * Emit a real-time event to all active sockets of a specific user
 * @param {string} userId - Target user ID
 * @param {string} event - Event name
 * @param {object} data - Payload
 */
export const emitToUser = (userId, event, data) => {
  const socketIds = userSockets.get(userId.toString());
  if (socketIds && global.ioInstance) {
    socketIds.forEach((sid) => {
      global.ioInstance.to(sid).emit(event, data);
    });
  }
};

/**
 * Helper to emit event to all user's friends
 */
const broadcastToFriends = async (userId, event, data) => {
  try {
    const user = await User.findById(userId).select('friends');
    if (user && user.friends.length > 0) {
      user.friends.forEach((friendId) => {
        emitToUser(friendId.toString(), event, data);
      });
    }
  } catch (err) {
    console.error('Broadcast to friends error:', err);
  }
};

/**
 * Marks messages as delivered and alerts their senders when a user comes online
 */
const deliverPendingMessages = async (receiverId, io) => {
  try {
    // Find all 'sent' messages to this user
    const pendingMessages = await Message.find({ receiver: receiverId, status: 'sent' });
    
    if (pendingMessages.length > 0) {
      // Update DB to 'delivered'
      await Message.updateMany(
        { receiver: receiverId, status: 'sent' },
        { $set: { status: 'delivered' } }
      );

      // Notify each sender of the delivery
      pendingMessages.forEach((msg) => {
        emitToUser(msg.sender, 'message-delivered', {
          messageId: msg._id,
          receiverId,
        });
      });
    }
  } catch (error) {
    console.error('Deliver Pending Messages Error:', error);
  }
};
