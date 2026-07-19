const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
  first_name: {
    type: String,
    required: true,
    trim: true
  },
  last_name: {
    type: String,
    required: true,
    trim: true
  },
  display_name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true
  },
  profile_picture_url: {
    type: String,
    default: ""
  },
  date_of_birth: {
    type: Date
  },
  batting_style: {
    type: String,
    enum: ['RIGHT_HAND', 'LEFT_HAND'],
    required: true
  },
  bowling_style: {
    type: String,
    enum: [
      'RIGHT_ARM_FAST', 'RIGHT_ARM_MED', 'LEFT_ARM_FAST', 'LEFT_ARM_SPIN',
      'RIGHT_ARM_OFF_BREAK', 'RIGHT_ARM_LEG_BREAK', 'LEFT_ARM_UNORTHODOX', 'NONE'
    ],
    default: 'NONE'
  },
  player_roles: [{
    type: String,
    enum: ['BATSMAN', 'BOWLER', 'ALL_ROUNDER', 'WICKET_KEEPER']
  }]
}, { timestamps: true });

// Create text index for display name search
PlayerSchema.index({ display_name: 'text' });

module.exports = mongoose.model('Player', PlayerSchema);
