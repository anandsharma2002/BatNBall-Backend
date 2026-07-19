const bcrypt = require('bcryptjs');
const User = require('../models/User');

const changePassword = async (req, res) => {
  try {
    const { current_password, new_password, confirm_new_password } = req.body;
    const userId = req.user.userId;

    if (!current_password || !new_password || !confirm_new_password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (new_password !== confirm_new_password) {
      return res.status(400).json({ error: 'New password and confirmation password do not match' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect current password' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(new_password, salt);
    await user.save();

    return res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  changePassword
};
