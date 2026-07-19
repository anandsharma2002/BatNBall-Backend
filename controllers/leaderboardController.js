const PlayerCareerStats = require('../models/PlayerCareerStats');
const Match = require('../models/Match');
const BallByBall = require('../models/BallByBall');

const getCapsLeaderboard = async (req, res) => {
  try {
    // Find top 5 batters sorted by total runs descending
    const topBatters = await PlayerCareerStats.find()
      .sort({ 'batting.total_runs': -1, 'batting.balls_faced': 1 })
      .limit(5)
      .populate('player_id', 'display_name first_name last_name profile_picture_url');

    // Find top 5 bowlers sorted by wickets taken descending, tie break by runs conceded ascending
    const topBowlers = await PlayerCareerStats.find()
      .sort({ 'bowling.wickets_taken': -1, 'bowling.runs_conceded': 1 })
      .limit(5)
      .populate('player_id', 'display_name first_name last_name profile_picture_url');

    return res.status(200).json({ batters: topBatters, bowlers: topBowlers });
  } catch (error) {
    console.error('Get caps leaderboard error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getChaseMastersLeaderboard = async (req, res) => {
  try {
    // Get all completed matches
    const completedMatches = await Match.find({ match_status: 'COMPLETED' });

    // Get all player stats
    const stats = await PlayerCareerStats.find()
      .populate('player_id', 'display_name first_name last_name profile_picture_url username');

    const list = [];

    for (const stat of stats) {
      const playerId = stat.player_id?._id;
      if (!playerId) continue;

      let chaseRuns = 0;
      let chaseTotal = 0;
      let chaseWins = 0;
      let notOutsInSuccessfulChases = 0;

      for (const match of completedMatches) {
        // Check if player was in the playing XI or substitutes of either team in this match
        const isTeamFirst = (match.playing_xi_team_first || []).some(id => id.toString() === playerId.toString()) ||
          (match.substitutes_team_first || []).some(id => id.toString() === playerId.toString());
        const isTeamSecond = (match.playing_xi_team_second || []).some(id => id.toString() === playerId.toString()) ||
          (match.substitutes_team_second || []).some(id => id.toString() === playerId.toString());

        if (!isTeamFirst && !isTeamSecond) {
          // Player was not in this match
          continue;
        }

        const playerTeamId = isTeamFirst ? match.team_first_id?.toString() : match.team_second_id?.toString();

        // Robust determination: Find who batted in Innings 2 using BallByBall
        let playerTeamChased = false;
        const sampleBall = await BallByBall.findOne({ match_id: match._id, innings_number: 2 });
        if (sampleBall) {
          playerTeamChased = playerTeamId === sampleBall.batting_team_id.toString();
        } else if (match.toss_won_by_team_id) {
          // Fallback to toss decision if no balls are logged yet
          const inn1BatTeamId = match.toss_won_by_team_id.toString() === match.team_first_id?.toString()
            ? (match.toss_decision === 'BAT' ? match.team_first_id?.toString() : match.team_second_id?.toString())
            : (match.toss_decision === 'BAT' ? match.team_second_id?.toString() : match.team_first_id?.toString());
          playerTeamChased = playerTeamId !== inn1BatTeamId;
        }

        if (playerTeamChased) {
          chaseTotal += 1;

          // Fetch runs scored by this player in the 2nd innings of this match
          const strikerBalls = await BallByBall.find({
            match_id: match._id,
            innings_number: 2,
            striker_id: playerId
          });

          let matchRuns = 0;
          strikerBalls.forEach(b => {
            matchRuns += b.runs_from_bat;
          });
          chaseRuns += matchRuns;

          // Did player's team win?
          const teamWon = match.winner_team_id?.toString() === playerTeamId;

          if (teamWon) {
            chaseWins += 1;

            // Check if player was dismissed in the 2nd innings of this match
            const dismissedBall = await BallByBall.findOne({
              match_id: match._id,
              innings_number: 2,
              'dismissal.is_wicket': true,
              'dismissal.dismissed_player_id': playerId
            });

            if (!dismissedBall) {
              notOutsInSuccessfulChases += 1;
            }
          }
        }
      }

      if (chaseTotal > 0) {
        const cmi = chaseRuns + (5 * chaseWins) + (5 * notOutsInSuccessfulChases);
        const winPct = chaseTotal > 0 ? ((chaseWins / chaseTotal) * 100).toFixed(0) : '0';

        list.push({
          player: stat.player_id,
          chaseRuns,
          chaseTotal,
          chaseWins,
          notOutsInSuccessfulChases,
          winPct,
          score: cmi
        });
      }
    }

    // Sort by CMI score descending
    list.sort((a, b) => b.score - a.score);
    const topChaseMasters = list.slice(0, 5);

    return res.status(200).json(topChaseMasters);
  } catch (error) {
    console.error('Get chase masters error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getCapsLeaderboard,
  getChaseMastersLeaderboard
};
