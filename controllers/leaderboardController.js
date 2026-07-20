const PlayerCareerStats = require('../models/PlayerCareerStats');
const Match = require('../models/Match');
const BallByBall = require('../models/BallByBall');

// In-Memory Caching for Instant Sub-5ms Responses
let cachedCaps = null;
let cachedCapsTime = 0;
let cachedChase = null;
let cachedChaseTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute TTL fallback

const invalidateLeaderboardCache = () => {
  cachedCaps = null;
  cachedChase = null;
};

const getCapsLeaderboard = async (req, res) => {
  try {
    const now = Date.now();
    if (cachedCaps && (now - cachedCapsTime < CACHE_TTL_MS)) {
      return res.status(200).json(cachedCaps);
    }

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

    const result = { batters: topBatters, bowlers: topBowlers };
    cachedCaps = result;
    cachedCapsTime = now;

    return res.status(200).json(result);
  } catch (error) {
    console.error('Get caps leaderboard error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getChaseMastersLeaderboard = async (req, res) => {
  try {
    const now = Date.now();
    if (cachedChase && (now - cachedChaseTime < CACHE_TTL_MS)) {
      return res.status(200).json(cachedChase);
    }

    // 1. Fetch completed matches in 1 query
    const completedMatches = await Match.find({ match_status: 'COMPLETED' }).lean();

    if (!completedMatches.length) {
      cachedChase = [];
      cachedChaseTime = now;
      return res.status(200).json([]);
    }

    const matchIds = completedMatches.map(m => m._id);

    // 2. Aggregate ALL second innings runs by (match_id, striker_id) in 1 DB query
    const runsAgg = await BallByBall.aggregate([
      { $match: { match_id: { $in: matchIds }, innings_number: 2 } },
      {
        $group: {
          _id: { match_id: '$match_id', striker_id: '$striker_id' },
          matchRuns: { $sum: '$runs_from_bat' },
          battingTeamId: { $first: '$batting_team_id' }
        }
      }
    ]);

    // 3. Aggregate ALL second innings wickets by (match_id, dismissed_player_id) in 1 DB query
    const wicketsAgg = await BallByBall.aggregate([
      {
        $match: {
          match_id: { $in: matchIds },
          innings_number: 2,
          'dismissal.is_wicket': true,
          'dismissal.dismissed_player_id': { $ne: null }
        }
      },
      {
        $group: {
          _id: { match_id: '$match_id', dismissed_player_id: '$dismissal.dismissed_player_id' }
        }
      }
    ]);

    // Fast lookup maps
    const matchInnings2TeamMap = new Map();
    const playerMatchRunsMap = new Map();
    runsAgg.forEach(r => {
      if (r._id && r._id.match_id && r._id.striker_id) {
        const key = `${r._id.match_id}_${r._id.striker_id}`;
        playerMatchRunsMap.set(key, r.matchRuns || 0);
        if (r.battingTeamId) {
          matchInnings2TeamMap.set(r._id.match_id.toString(), r.battingTeamId.toString());
        }
      }
    });

    const playerDismissedMap = new Map();
    wicketsAgg.forEach(w => {
      if (w._id && w._id.match_id && w._id.dismissed_player_id) {
        const key = `${w._id.match_id}_${w._id.dismissed_player_id}`;
        playerDismissedMap.set(key, true);
      }
    });

    // 4. Fetch all player stats
    const stats = await PlayerCareerStats.find()
      .populate('player_id', 'display_name first_name last_name profile_picture_url username')
      .lean();

    const list = [];

    for (const stat of stats) {
      const playerObj = stat.player_id;
      if (!playerObj || !playerObj._id) continue;
      const playerIdStr = playerObj._id.toString();

      let chaseRuns = 0;
      let chaseTotal = 0;
      let chaseWins = 0;
      let notOutsInSuccessfulChases = 0;

      for (const match of completedMatches) {
        const matchIdStr = match._id.toString();
        const team1Str = match.team_first_id ? match.team_first_id.toString() : '';
        const team2Str = match.team_second_id ? match.team_second_id.toString() : '';

        const isTeamFirst = (match.playing_xi_team_first || []).some(id => id.toString() === playerIdStr) ||
          (match.substitutes_team_first || []).some(id => id.toString() === playerIdStr);
        const isTeamSecond = (match.playing_xi_team_second || []).some(id => id.toString() === playerIdStr) ||
          (match.substitutes_team_second || []).some(id => id.toString() === playerIdStr);

        if (!isTeamFirst && !isTeamSecond) continue;

        const playerTeamId = isTeamFirst ? team1Str : team2Str;

        // Determine if player's team chased (batted 2nd)
        let playerTeamChased = false;
        if (matchInnings2TeamMap.has(matchIdStr)) {
          playerTeamChased = matchInnings2TeamMap.get(matchIdStr) === playerTeamId;
        } else if (match.toss_won_by_team_id) {
          const tossWonStr = match.toss_won_by_team_id.toString();
          const inn1BatTeamId = tossWonStr === team1Str
            ? (match.toss_decision === 'BAT' ? team1Str : team2Str)
            : (match.toss_decision === 'BAT' ? team2Str : team1Str);
          playerTeamChased = playerTeamId !== inn1BatTeamId;
        }

        if (playerTeamChased) {
          chaseTotal += 1;
          const key = `${matchIdStr}_${playerIdStr}`;
          const matchRuns = playerMatchRunsMap.get(key) || 0;
          chaseRuns += matchRuns;

          const winnerStr = match.winner_team_id ? match.winner_team_id.toString() : '';
          const teamWon = winnerStr === playerTeamId;

          if (teamWon) {
            chaseWins += 1;
            const isDismissed = playerDismissedMap.has(key);
            if (!isDismissed) {
              notOutsInSuccessfulChases += 1;
            }
          }
        }
      }

      if (chaseTotal > 0) {
        const cmi = chaseRuns + (5 * chaseWins) + (5 * notOutsInSuccessfulChases);
        const winPct = chaseTotal > 0 ? ((chaseWins / chaseTotal) * 100).toFixed(0) : '0';

        list.push({
          player: playerObj,
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

    cachedChase = topChaseMasters;
    cachedChaseTime = now;

    return res.status(200).json(topChaseMasters);
  } catch (error) {
    console.error('Get chase masters error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Called once at server startup to pre-populate in-memory cache
const warmLeaderboardCache = async () => {
  console.log('[Leaderboard] Warming cache...');
  try {
    // Temporarily clear TTL guard so warm-up always runs
    cachedCaps = null;
    cachedChase = null;

    // Reuse existing fetch logic via fake req/res
    const fakeRes = {
      status: () => ({ json: () => {} }),
    };
    await getCapsLeaderboard({ headers: {} }, fakeRes);
    await getChaseMastersLeaderboard({ headers: {} }, fakeRes);
    console.log('[Leaderboard] Cache warmed successfully ✓');
  } catch (err) {
    console.warn('[Leaderboard] Cache warm-up error:', err.message);
  }
};

module.exports = {
  getCapsLeaderboard,
  getChaseMastersLeaderboard,
  invalidateLeaderboardCache,
  warmLeaderboardCache
};
