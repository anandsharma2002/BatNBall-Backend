const mongoose = require('mongoose');

const BallByBallSchema = new mongoose.Schema({
  match_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true,
    index: true
  },
  innings_number: {
    type: Number,
    required: true
  },
  over_number: {
    type: Number,
    required: true
  },
  ball_number_in_over: {
    type: Number,
    required: true
  },
  total_legal_balls_in_innings: {
    type: Number,
    required: true
  },
  batting_team_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  bowling_team_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  striker_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  non_striker_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  bowler_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  runs_from_bat: {
    type: Number,
    min: 0,
    max: 6,
    default: 0
  },
  is_boundary: {
    type: Boolean,
    default: false
  },
  boundary_type: {
    type: String,
    enum: ['FOUR', 'SIX', null],
    default: null
  },
  is_extra: {
    type: Boolean,
    default: false
  },
  extra_type: {
    type: String,
    enum: ['WIDE', 'NO_BALL', 'BYE', 'LEG_BYE', 'PENALTY', null],
    default: null
  },
  extra_runs: {
    type: Number,
    default: 0
  },
  is_legal_delivery: {
    type: Boolean,
    default: true
  },
  is_dot_ball: {
    type: Boolean,
    default: true
  },
  is_control_shot: {
    type: Boolean,
    default: true
  },
  match_phase: {
    type: String,
    enum: ['POWERPLAY', 'MIDDLE_OVERS', 'DEATH_OVERS'],
    required: true
  },
  dismissal: {
    is_wicket: { type: Boolean, default: false },
    dismissed_player_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
    wicket_type: { type: String, enum: [
      'BOWLED', 'CAUGHT', 'CAUGHT_AND_BOWLED', 'LBW', 'RUN_OUT',
      'STUMPED', 'HIT_WICKET', 'RETIRED_HURT', 'RETIRED_OUT', 'OBSTRUCTING_FIELD', null
    ], default: null },
    fielder_involved_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
    is_direct_hit: { type: Boolean, default: false }
  },
  current_total_score: {
    type: Number,
    required: true
  },
  current_wickets_down: {
    type: Number,
    required: true
  },
  required_runs: {
    type: Number,
    default: null
  }
}, { timestamps: true, collection: 'ball_by_ball' });

// Compound index to speed up scorecard queries per innings
BallByBallSchema.index({ match_id: 1, innings_number: 1 });

module.exports = mongoose.model('BallByBall', BallByBallSchema);
