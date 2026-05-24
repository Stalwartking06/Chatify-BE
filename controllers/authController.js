import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  generateRefreshToken,
  setTokenCookies,
  clearTokenCookies,
} from '../utils/token.js';

export const register = async (req, res) => {
  const { username, email, password, displayName } = req.body;

  try {
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists.',
      });
    }

    // Create user (pre-save hook hashes password)
    const user = await User.create({
      username,
      email,
      password,
      displayName,
    });

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Set HTTP-only cookies
    setTokenCookies(res, accessToken, refreshToken);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        bio: user.bio,
        friends: user.friends,
      },
      token: accessToken, // Also return access token in response for flexibility
    });
  } catch (error) {
    console.error('Register Error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
};

export const login = async (req, res) => {
  const { emailOrUsername, password } = req.body;

  try {
    // Find user by username or email and select password
    const user = await User.findOne({
      $or: [
        { email: emailOrUsername.toLowerCase() },
        { username: emailOrUsername.toLowerCase() },
      ],
    }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Set cookies
    setTokenCookies(res, accessToken, refreshToken);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        bio: user.bio,
        friends: user.friends,
      },
      token: accessToken,
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

export const logout = async (req, res) => {
  try {
    if (req.user) {
      // Mark offline on logout
      await User.findByIdAndUpdate(req.user._id, { onlineStatus: false, lastSeen: new Date() });
    }
    
    clearTokenCookies(res);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    console.error('Logout Error:', error);
    res.status(500).json({ success: false, message: 'Server error during logout.' });
  }
};

export const refreshToken = async (req, res) => {
  const token = req.cookies.refreshToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Refresh token not found',
      code: 'REFRESH_TOKEN_MISSING',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'refresh_secret_12345_abcde');
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });
    }

    const accessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Set new cookies (rolling session)
    setTokenCookies(res, accessToken, newRefreshToken);

    res.json({
      success: true,
      token: accessToken,
    });
  } catch (error) {
    console.error('Refresh Token Verification Error:', error.message);
    clearTokenCookies(res);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token',
      code: 'REFRESH_TOKEN_EXPIRED',
    });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('friends', 'displayName username avatar onlineStatus lastSeen');
    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Get Me Error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
