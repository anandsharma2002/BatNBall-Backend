const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Player = require('../models/Player');

// Simple in-memory storage for OTPs (phone_number -> { otp, expires })
const otpStore = new Map();

const login = async (req, res) => {
  try {
    const { phone_number, password } = req.body;

    if (!phone_number || !password) {
      return res.status(400).json({ error: 'Username/Phone number and password are required' });
    }

    // Try to find user by phone number
    let user = await User.findOne({ phone_number: phone_number.trim() });
    
    // If not found, try to find player by username (case-insensitive) and link to user
    if (!user) {
      const player = await Player.findOne({ username: phone_number.trim().toLowerCase() });
      if (player) {
        user = await User.findOne({ associated_player_id: player._id });
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid username/phone number or password' });
    }

    if (user.account_status !== 'ACTIVE') {
      return res.status(403).json({ error: `Account status is ${user.account_status}. Please contact an administrator.` });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    const token = jwt.sign(
      { 
        userId: user._id, 
        role: user.role, 
        associatedPlayerId: user.associated_player_id 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      token,
      role: user.role,
      user: {
        id: user._id,
        phone_number: user.phone_number,
        associated_player_id: user.associated_player_id
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const forgotPasswordRequest = async (req, res) => {
  try {
    const { phone_number } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const user = await User.findOne({ phone_number });
    if (!user) {
      return res.status(404).json({ error: 'Phone number is not registered' });
    }

    // Generate simulated 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes expiration

    // Store in memory
    otpStore.set(phone_number, { otp, expires });

    // Print to console log for testing verification
    console.log(`\n========================================`);
    console.log(`[SMS MOCK] Send OTP to: ${phone_number}`);
    console.log(`[SMS MOCK] Verification Code: ${otp}`);
    console.log(`========================================\n`);

    return res.status(200).json({ message: 'OTP code generated and sent successfully' });
  } catch (error) {
    console.error('Forgot password request error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const forgotPasswordVerify = async (req, res) => {
  try {
    const { phone_number, otp, new_password } = req.body;

    if (!phone_number || !otp || !new_password) {
      return res.status(400).json({ error: 'Phone number, OTP, and new password are required' });
    }

    const storedData = otpStore.get(phone_number);
    if (!storedData) {
      return res.status(400).json({ error: 'No OTP requested for this phone number' });
    }

    if (Date.now() > storedData.expires) {
      otpStore.delete(phone_number);
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({ error: 'Invalid verification OTP code' });
    }

    const user = await User.findOne({ phone_number });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update password
    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(new_password, salt);
    await user.save();

    // Clean up memory store
    otpStore.delete(phone_number);

    return res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Forgot password verify error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  login,
  forgotPasswordRequest,
  forgotPasswordVerify
};
