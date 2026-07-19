const mongoose = require('mongoose');

const PlayerCareerStatsSchema = new mongoose.Schema({
  player_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true,
    unique: true,
    index: true
  },
  batting: {
    matches_played: { type: Number, default: 0 },
    innings_batted: { type: Number, default: 0 },
    not_outs: { type: Number, default: 0 },
    total_runs: { type: Number, default: 0 },
    highest_score: {
      runs: { type: Number, default: 0 },
      is_not_out: { type: Boolean, default: false }
    },
    balls_faced: { type: Number, default: 0 },
    centuries_100s: { type: Number, default: 0 },
    half_centuries_50s: { type: Number, default: 0 },
    ducks_total: { type: Number, default: 0 },
    golden_ducks: { type: Number, default: 0 },
    fours_count: { type: Number, default: 0 },
    sixes_count: { type: Number, default: 0 }
  },
  bowling: {
    innings_bowled: { type: Number, default: 0 },
    balls_bowled: { type: Number, default: 0 },
    maidens_overs: { type: Number, default: 0 },
    runs_conceded: { type: Number, default: 0 },
    wickets_taken: { type: Number, default: 0 },
    best_bowling_figures: {
      wickets: { type: Number, default: 0 },
      runs: { type: Number, default: 0 }
    },
    wides_conceded: { type: Number, default: 0 },
    no_balls_conceded: { type: Number, default: 0 },
    dot_balls_bowled_count: { type: Number, default: 0 }
  },
  fielding: {
    catches_total: { type: Number, default: 0 },
    stumpings: { type: Number, default: 0 },
    run_outs_assisted: { type: Number, default: 0 },
    run_outs_unassisted: { type: Number, default: 0 }
  }
}, { timestamps: true, collection: 'player_career_stats' });

module.exports = mongoose.model('PlayerCareerStats', PlayerCareerStatsSchema);
