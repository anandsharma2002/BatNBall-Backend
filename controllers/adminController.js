const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Player = require('../models/Player');

const createUser = async (req, res) => {
  try {
    const { phone_number, password, username, first_name, last_name, display_name, batting_style } = req.body;

    if (!phone_number || !password || !username) {
      return res.status(400).json({ error: 'Phone number, password, and username are required' });
    }

    // Check if username is already taken
    const existingPlayer = await Player.findOne({ username: username.trim().toLowerCase() });
    if (existingPlayer) {
      return res.status(409).json({ error: 'Username is already taken' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phone_number });
    if (existingUser) {
      return res.status(409).json({ error: 'Phone number is already registered' });
    }

    // Create a linked placeholder player profile first
    // Use details from body or fall back to generic defaults
    const newPlayer = new Player({
      first_name: first_name || 'New',
      last_name: last_name || 'Player',
      display_name: display_name || `Player-${phone_number.slice(-4)}`,
      username: username.trim().toLowerCase(),
      batting_style: batting_style || 'RIGHT_HAND',
      bowling_style: 'NONE',
      player_roles: ['BATSMAN']
    });
    const savedPlayer = await newPlayer.save();

    // Hash user password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create User record
    const newUser = new User({
      phone_number,
      password_hash,
      role: 'USER', // Admin creates standard USERs. Seed scripts can be used to set SUPER_ADMIN roles.
      associated_player_id: savedPlayer._id,
      account_status: 'ACTIVE'
    });
    const savedUser = await newUser.save();

    return res.status(201).json({
      message: 'User account and player profile created successfully',
      user: {
        id: savedUser._id,
        phone_number: savedUser.phone_number,
        role: savedUser.role,
        associated_player_id: savedUser.associated_player_id
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  createUser
};
