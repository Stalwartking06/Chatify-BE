import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    text: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'seen'],
      default: 'sent',
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 86400, // 24 hours in seconds (86400 seconds) - TTL Index
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to speed up message retrieval for conversations
messageSchema.index({ sender: 1, receiver: 1, createdAt: 1 });

const Message = mongoose.model('Message', messageSchema);

export default Message;
