const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  phone_number: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
    match: [/^\+[1-9]\d{1,14}$/, 'Please enter a valid E.164 phone number']
  },
  password_hash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['SUPER_ADMIN', 'USER'],
    default: 'USER'
  },
  associated_player_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    default: null
  },
  account_status: {
    type: String,
    enum: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'],
    default: 'ACTIVE'
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
