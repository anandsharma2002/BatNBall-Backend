const mongoose = require('mongoose');

const PartnershipSchema = new mongoose.Schema({
  match_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true,
    index: true
  },
  batsman_1_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  batsman_2_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  total_runs_scored: {
    type: Number,
    default: 0
  },
  total_balls_faced: {
    type: Number,
    default: 0
  },
  runs_by_batsman_1: {
    type: Number,
    default: 0
  },
  runs_by_batsman_2: {
    type: Number,
    default: 0
  },
  balls_by_batsman_1: {
    type: Number,
    default: 0
  },
  balls_by_batsman_2: {
    type: Number,
    default: 0
  },
  extras_in_partnership: {
    type: Number,
    default: 0
  },
  is_unbroken: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Partnership', PartnershipSchema);
