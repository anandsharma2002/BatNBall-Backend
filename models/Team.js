const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
  team_name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  team_short_name: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  logo_url: {
    type: String,
    default: ""
  },
  created_by_user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  squad_members: [{
    player_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player'
    },
    joined_date: {
      type: Date,
      default: Date.now
    },
    role_in_team: {
      type: String,
      enum: ['CAPTAIN', 'WICKET_KEEPER', 'MEMBER'],
      default: 'MEMBER'
    }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Team', TeamSchema);
