const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
  venue: {
    type: String,
    required: true,
    trim: true
  },
  match_date_time: {
    type: Date,
    required: true
  },
  total_overs_per_innings: {
    type: Number,
    required: true
  },
  max_overs_per_bowler: {
    type: Number,
    required: true
  },
  ball_type: {
    type: String,
    enum: ['LEATHER_RED', 'LEATHER_WHITE', 'LEATHER_PINK', 'TENNIS', 'TAPE_TENNIS', 'COSCO'],
    required: true
  },
  match_status: {
    type: String,
    enum: ['UPCOMING', 'LIVE', 'PAUSED', 'RAIN_DELAY', 'COMPLETED', 'ABANDONED'],
    default: 'UPCOMING',
    index: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  umpires: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }],
  scorers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  team_first_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  team_second_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  playing_xi_team_first: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }],
  playing_xi_team_second: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }],
  substitutes_team_first: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }],
  substitutes_team_second: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }],
  match_rules: {
    wide_ball_run_added: { type: Boolean, default: true },
    no_ball_run_calculated: { type: Boolean, default: true },
    no_ball_free_hit_enabled: { type: Boolean, default: true },
    overthrow_runs_allowed: { type: Boolean, default: true },
    bye_runs_allowed: { type: Boolean, default: true },
    leg_bye_runs_allowed: { type: Boolean, default: true },
    penalty_runs_allowed: { type: Boolean, default: true }
  },
  toss_won_by_team_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    default: null
  },
  toss_decision: {
    type: String,
    enum: ['BAT', 'FIELD', null],
    default: null
  },
  winner_team_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    default: null
  },
  result_type: {
    type: String,
    enum: ['RUNS', 'WICKETS', 'SUPER_OVER', 'TIE', 'NO_RESULT', 'DLS_METHOD', null],
    default: null
  },
  win_margin: {
    type: Number,
    default: 0
  },
  player_of_the_match: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    default: null
  },
  active_umpire_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    default: null
  },

  // Live scoring engine state (updated each ball)
  current_innings: {
    type: Number,
    default: 1  // 1 or 2
  },
  current_innings_batting_team_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    default: null
  },
  current_innings_bowling_team_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    default: null
  },
  crease_state: {
    striker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
    non_striker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
    bowler_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
    legal_balls_this_over: { type: Number, default: 0 }
  },
  innings1: {
    score: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    overs_completed: { type: Number, default: 0 },
    total_legal_balls: { type: Number, default: 0 },
    is_complete: { type: Boolean, default: false }
  },
  innings2: {
    score: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    overs_completed: { type: Number, default: 0 },
    total_legal_balls: { type: Number, default: 0 },
    is_complete: { type: Boolean, default: false }
  },
  undo_actions_remaining: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('Match', MatchSchema);
