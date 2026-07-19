const Match = require('../models/Match');
const BallByBall = require('../models/BallByBall');
const PlayerCareerStats = require('../models/PlayerCareerStats');

const recalculatePlayerCareerStats = async (playerId) => {
  try {
    // 1. Get all completed matches where the player was in the playing XI or substitutes
    const completedMatches = await Match.find({
      match_status: 'COMPLETED',
      $or: [
        { playing_xi_team_first: playerId },
        { playing_xi_team_second: playerId },
        { substitutes_team_first: playerId },
        { substitutes_team_second: playerId }
      ]
    });

    const completedMatchIds = completedMatches.map(m => m._id);

    // If player has no completed matches, clear/reset their career stats
    if (completedMatchIds.length === 0) {
      await PlayerCareerStats.findOneAndDelete({ player_id: playerId });
      return;
    }

    // 2. Fetch all balls in completed matches where player was striker, non-striker, bowler, or fielder
    const strikerBalls = await BallByBall.find({
      match_id: { $in: completedMatchIds },
      striker_id: playerId
    });

    const nonStrikerBalls = await BallByBall.find({
      match_id: { $in: completedMatchIds },
      non_striker_id: playerId
    });

    const bowlerBalls = await BallByBall.find({
      match_id: { $in: completedMatchIds },
      bowler_id: playerId
    });

    const fieldingBalls = await BallByBall.find({
      match_id: { $in: completedMatchIds },
      'dismissal.fielder_involved_id': playerId
    });

    // ── Batting Stats ──
    const matchesPlayed = completedMatches.length;

    // Group striker & non-striker balls by match_id to count innings batted
    const battedMatches = new Set();
    strikerBalls.forEach(b => battedMatches.add(b.match_id.toString()));
    nonStrikerBalls.forEach(b => battedMatches.add(b.match_id.toString()));
    const inningsBatted = battedMatches.size;

    // Runs per match to find highest score and centuries/50s/ducks
    const runsPerMatch = {};
    battedMatches.forEach(mId => { 
      runsPerMatch[mId] = { runs: 0, faced: 0, dismissed: false };
    });

    let totalRuns = 0;
    let ballsFaced = 0;
    let foursCount = 0;
    let sixesCount = 0;

    strikerBalls.forEach(b => {
      const mId = b.match_id.toString();
      if (runsPerMatch[mId]) {
        runsPerMatch[mId].runs += b.runs_from_bat;
      }
      totalRuns += b.runs_from_bat;

      // Balls faced excludes Wides
      if (b.extra_type !== 'WIDE') {
        if (runsPerMatch[mId]) {
          runsPerMatch[mId].faced += 1;
        }
        ballsFaced += 1;
      }

      if (b.is_boundary) {
        if (b.boundary_type === 'FOUR') foursCount += 1;
        if (b.boundary_type === 'SIX') sixesCount += 1;
      }
    });

    // Mark dismissals
    let totalDismissals = 0;
    const wicketBalls = await BallByBall.find({
      match_id: { $in: completedMatchIds },
      'dismissal.is_wicket': true,
      'dismissal.dismissed_player_id': playerId
    });

    wicketBalls.forEach(b => {
      const mId = b.match_id.toString();
      if (runsPerMatch[mId]) {
        runsPerMatch[mId].dismissed = true;
      }
      totalDismissals += 1;
    });

    const notOuts = Math.max(0, inningsBatted - totalDismissals);

    // Highest score, centuries, half-centuries, ducks, golden ducks
    let highestRuns = 0;
    let highestIsNotOut = false;
    let centuries = 0;
    let halfCenturies = 0;
    let ducksTotal = 0;
    let goldenDucks = 0;

    Object.keys(runsPerMatch).forEach(mId => {
      const { runs, faced, dismissed } = runsPerMatch[mId];
      if (runs > highestRuns) {
        highestRuns = runs;
        highestIsNotOut = !dismissed;
      } else if (runs === highestRuns) {
        if (!dismissed) highestIsNotOut = true;
      }

      if (runs >= 100) centuries += 1;
      else if (runs >= 50) halfCenturies += 1;

      if (runs === 0 && dismissed) {
        ducksTotal += 1;
        if (faced === 1) {
          goldenDucks += 1;
        }
      }
    });

    // ── Bowling Stats ──
    const bowledMatches = new Set(bowlerBalls.map(b => b.match_id.toString()));
    const inningsBowled = bowledMatches.size;

    let ballsBowled = 0;
    let runsConceded = 0;
    let wicketsTaken = 0;
    let widesConceded = 0;
    let noBallsConceded = 0;
    let dotBallsBowled = 0;

    const bowlingPerMatch = {};
    bowledMatches.forEach(mId => { 
      bowlingPerMatch[mId] = { wickets: 0, runs: 0 };
    });

    bowlerBalls.forEach(b => {
      const mId = b.match_id.toString();
      
      // Conceded runs
      let runConceded = 0;
      if (b.is_extra) {
        if (['WIDE', 'NO_BALL'].includes(b.extra_type)) {
          runConceded = b.extra_runs + b.runs_from_bat;
        }
        if (b.extra_type === 'WIDE') widesConceded += b.extra_runs;
        if (b.extra_type === 'NO_BALL') noBallsConceded += b.extra_runs;
      } else {
        runConceded = b.runs_from_bat;
      }
      runsConceded += runConceded;
      if (bowlingPerMatch[mId]) {
        bowlingPerMatch[mId].runs += runConceded;
      }

      // Legal balls
      if (b.is_legal_delivery) {
        ballsBowled += 1;
        if (runConceded === 0) {
          dotBallsBowled += 1;
        }
      }

      // Wickets
      if (b.dismissal?.is_wicket && ['BOWLED', 'CAUGHT', 'CAUGHT_AND_BOWLED', 'LBW', 'STUMPED', 'HIT_WICKET'].includes(b.dismissal.wicket_type)) {
        wicketsTaken += 1;
        if (bowlingPerMatch[mId]) {
          bowlingPerMatch[mId].wickets += 1;
        }
      }
    });

    // Maidens calculation
    let maidensOvers = 0;
    const oversConceded = {}; 
    const oversBalls = {}; 
    bowlerBalls.forEach(b => {
      const key = `${b.match_id}_${b.over_number}`;
      let runConceded = 0;
      if (b.is_extra) {
        if (['WIDE', 'NO_BALL'].includes(b.extra_type)) {
          runConceded = b.extra_runs + b.runs_from_bat;
        }
      } else {
        runConceded = b.runs_from_bat;
      }
      oversConceded[key] = (oversConceded[key] || 0) + runConceded;
      oversBalls[key] = (oversBalls[key] || 0) + (b.is_legal_delivery ? 1 : 0);
    });
    Object.keys(oversBalls).forEach(key => {
      if (oversBalls[key] === 6 && (oversConceded[key] || 0) === 0) {
        maidensOvers += 1;
      }
    });

    // Best bowling figures
    let bestWickets = 0;
    let bestRuns = 0;
    let hasBowling = false;

    Object.keys(bowlingPerMatch).forEach(mId => {
      hasBowling = true;
      const { wickets, runs } = bowlingPerMatch[mId];
      if (wickets > bestWickets) {
        bestWickets = wickets;
        bestRuns = runs;
      } else if (wickets === bestWickets) {
        if (runs < bestRuns || (bestWickets === 0 && bestRuns === 0)) {
          bestRuns = runs;
        }
      }
    });

    // ── Fielding Stats ──
    let catchesTotal = 0;
    let stumpings = 0;
    let runOutsAssisted = 0;
    let runOutsUnassisted = 0;

    fieldingBalls.forEach(b => {
      if (b.dismissal?.is_wicket) {
        const wType = b.dismissal.wicket_type;
        if (wType === 'CAUGHT' || wType === 'CAUGHT_AND_BOWLED') {
          catchesTotal += 1;
        } else if (wType === 'STUMPED') {
          stumpings += 1;
        } else if (wType === 'RUN_OUT') {
          if (b.dismissal.is_direct_hit) {
            runOutsUnassisted += 1;
          } else {
            runOutsAssisted += 1;
          }
        }
      }
    });

    // Compile career stats document
    const computedStats = {
      player_id: playerId,
      batting: {
        matches_played: matchesPlayed,
        innings_batted: inningsBatted,
        not_outs: notOuts,
        total_runs: totalRuns,
        highest_score: {
          runs: highestRuns,
          is_not_out: highestIsNotOut
        },
        balls_faced: ballsFaced,
        centuries_100s: centuries,
        half_centuries_50s: halfCenturies,
        ducks_total: ducksTotal,
        golden_ducks: goldenDucks,
        fours_count: foursCount,
        sixes_count: sixesCount
      },
      bowling: {
        innings_bowled: inningsBowled,
        balls_bowled: ballsBowled,
        maidens_overs: maidensOvers,
        runs_conceded: runsConceded,
        wickets_taken: wicketsTaken,
        best_bowling_figures: hasBowling ? { wickets: bestWickets, runs: bestRuns } : { wickets: 0, runs: 0 },
        wides_conceded: widesConceded,
        no_balls_conceded: noBallsConceded,
        dot_balls_bowled_count: dotBallsBowled
      },
      fielding: {
        catches_total: catchesTotal,
        stumpings: stumpings,
        run_outs_assisted: runOutsAssisted,
        run_outs_unassisted: runOutsUnassisted
      }
    };

    await PlayerCareerStats.findOneAndUpdate(
      { player_id: playerId },
      computedStats,
      { upsert: true, new: true }
    );

  } catch (error) {
    console.error(`Error recalculating stats for player ${playerId}:`, error);
  }
};

const updateCareerStatsForMatch = async (matchId) => {
  try {
    const match = await Match.findById(matchId);
    if (!match) return;

    // Get all player IDs involved in the match
    const playerIdsSet = new Set();
    match.playing_xi_team_first?.forEach(id => playerIdsSet.add(id.toString()));
    match.playing_xi_team_second?.forEach(id => playerIdsSet.add(id.toString()));
    match.substitutes_team_first?.forEach(id => playerIdsSet.add(id.toString()));
    match.substitutes_team_second?.forEach(id => playerIdsSet.add(id.toString()));

    const playerIds = Array.from(playerIdsSet);

    // Run recalculation in parallel
    await Promise.all(playerIds.map(id => recalculatePlayerCareerStats(id)));
    console.log(`Career stats updated for match ${matchId} completed.`);
  } catch (error) {
    console.error(`Error updating stats for match ${matchId}:`, error);
  }
};

module.exports = {
  recalculatePlayerCareerStats,
  updateCareerStatsForMatch
};
