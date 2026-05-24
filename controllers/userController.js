import User from '../models/User.js';
import { uploadImage } from '../services/cloudinaryService.js';

export const updateProfile = async (req, res) => {
  const { displayName, bio } = req.body;
  const updateData = {};

  if (displayName) updateData.displayName = displayName;
  if (bio !== undefined) updateData.bio = bio;

  try {
    // If avatar file is provided
    if (req.file) {
      const imageUrl = await uploadImage(req.file.path, 'avatars');
      if (imageUrl) {
        updateData.avatar = imageUrl;
      }
    }

    const user = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
      runValidators: true,
    }).populate('friends', 'displayName username avatar onlineStatus lastSeen');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({ success: false, message: 'Server error updating profile.' });
  }
};

export const searchUsers = async (req, res) => {
  const { query } = req.query;

  if (!query || query.trim() === '') {
    return res.json({ success: true, users: [] });
  }

  try {
    const searchRegex = new RegExp(query, 'i');
    
    // Find users matching search term (excluding self)
    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [{ username: searchRegex }, { displayName: searchRegex }],
    })
      .select('displayName username avatar bio')
      .limit(10);

    res.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error('Search Users Error:', error);
    res.status(500).json({ success: false, message: 'Server error searching users.' });
  }
};

export const getProfile = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id).select('displayName username avatar bio onlineStatus lastSeen');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving profile.' });
  }
};
