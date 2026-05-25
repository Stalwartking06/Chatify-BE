import User from '../models/User.js';
import { uploadImage } from '../services/cloudinaryService.js';

export const updateProfile = async (req, res) => {

  const { displayName, bio } = req.body;

  const updateData = {};

  // Clean display name
  if (displayName?.trim()) {
    updateData.displayName = displayName.trim();
  }

  // Clean bio
  if (bio !== undefined) {
    updateData.bio = bio.trim();
  }

  try {

    // Upload avatar
    if (req.file?.buffer) {

      const imageUrl = await uploadImage(
        req.file.buffer,
        'avatars'
      );

      // Upload failed
      if (!imageUrl) {
        return res.status(500).json({
          success: false,
          message: 'Avatar upload failed.',
        });
      }

      updateData.avatar = imageUrl;
    }

    // Update profile
    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate(
        'friends',
        'displayName username avatar onlineStatus lastSeen'
      )
      .lean();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user,
    });

  } catch (error) {

    console.error(
      'Update Profile Error:',
      error.message
    );

    res.status(500).json({
      success: false,
      message: 'Server error updating profile.',
    });
  }
};

export const searchUsers = async (req, res) => {

  const query = req.query.query?.trim();

  // Empty query
  if (!query) {
    return res.json({
      success: true,
      users: [],
    });
  }

  // Prevent tiny expensive searches
  if (query.length < 2) {
    return res.json({
      success: true,
      users: [],
    });
  }

  try {

    // Escape regex chars
    const escapedQuery = query.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

    // Prefix search
    const searchRegex = new RegExp(
      `^${escapedQuery}`,
      'i'
    );

    const users = await User.find({
      _id: {
        $ne: req.user._id,
      },

      $or: [
        {
          username: searchRegex,
        },
        {
          displayName: searchRegex,
        },
      ],
    })
      .select(
        'displayName username avatar bio onlineStatus'
      )
      .limit(10)
      .lean();

    res.json({
      success: true,
      users,
    });

  } catch (error) {

    console.error(
      'Search Users Error:',
      error.message
    );

    res.status(500).json({
      success: false,
      message: 'Server error searching users.',
    });
  }
};

export const getProfile = async (req, res) => {

  const { id } = req.params;

  try {

    const user = await User.findById(id)
      .select(
        'displayName username avatar bio onlineStatus lastSeen'
      )
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      user,
    });

  } catch (error) {

    console.error(
      'Get Profile Error:',
      error.message
    );

    res.status(500).json({
      success: false,
      message: 'Server error retrieving profile.',
    });
  }
};