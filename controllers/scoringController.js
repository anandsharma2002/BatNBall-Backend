const Match = require('../models/Match');
const BallByBall = require('../models/BallByBall');
const Partnership = require('../models/Partnership');
const { updateCareerStatsForMatch } = require('../services/statsService');
const { invalidateLeaderboardCache } = require('./leaderboardController');

const getPopulatedMatch = async (matchId) => {
  return await Match.findById(matchId)
    .populate('crease_state.striker_id', 'display_name first_name last_name')
    .populate('crease_state.non_striker_id', 'display_name first_name last_name')
    .populate('crease_state.bowler_id', 'display_name first_name last_name')
    .populate('current_innings_batting_team_id', 'team_name team_short_name')
    .populate('current_innings_bowling_team_id', 'team_name team_short_name')
    .populate('playing_xi_team_first', 'display_name first_name last_name')
    .populate('playing_xi_team_second', 'display_name first_name last_name')
    .populate('substitutes_team_first', 'display_name first_name last_name')
    .populate('substitutes_team_second', 'display_name first_name last_name')
    .populate('team_first_id', 'team_name team_short_name')
    .populate('team_second_id', 'team_name team_short_name')
    .populate('winner_team_id', 'team_name team_short_name')
    .populate('umpires', 'display_name first_name last_name')
    .populate('active_umpire_id', 'display_name first_name last_name')
    .populate('scorers', 'phone_number');
};

// ─── Helper: Determine Match Phase ────────────────────────────────────────────
const getMatchPhase = (overNumber, totalOvers) => {
  const powerplayEnd = Math.min(6, totalOvers);
  const deathStart = totalOvers - Math.floor(totalOvers * 0.2);
  if (overNumber < powerplayEnd) return 'POWERPLAY';
  if (overNumber >= deathStart) return 'DEATH_OVERS';
  return 'MIDDLE_OVERS';
};

// ─── Helper: Recalculate Partnerships ─────────────────────────────────────────
const recalculatePartnerships = async (matchId) => {
  await Partnership.deleteMany({ match_id: matchId });

  // Fetch all balls in chronological order
  const balls = await BallByBall.find({ match_id: matchId }).sort({ _id: 1 });

  for (const ball of balls) {
    const isLegal = ball.is_legal_delivery;
    if (isLegal) {
      const { striker_id, non_striker_id, runs_from_bat, is_extra, extra_type, extra_runs, dismissal } = ball;
      const isWicket = dismissal?.is_wicket === true;

      let partnership = await Partnership.findOne({
        match_id: matchId,
        batsman_1_id: striker_id,
        batsman_2_id: non_striker_id,
        is_unbroken: true
      }) || await Partnership.findOne({
        match_id: matchId,
        batsman_1_id: non_striker_id,
        batsman_2_id: striker_id,
        is_unbroken: true
      });

      if (!partnership) {
        partnership = new Partnership({
          match_id: matchId,
          batsman_1_id: striker_id,
          batsman_2_id: non_striker_id
        });
      }

      partnership.total_runs_scored += runs_from_bat + (is_extra && ['BYE', 'LEG_BYE'].includes(extra_type) ? extra_runs : 0);
      partnership.total_balls_faced += 1;
      const isStrikerBatsman1 = partnership.batsman_1_id.toString() === striker_id.toString();
      if (isStrikerBatsman1) {
        partnership.runs_by_batsman_1 += runs_from_bat;
        partnership.balls_by_batsman_1 += 1;
      } else {
        partnership.runs_by_batsman_2 += runs_from_bat;
        partnership.balls_by_batsman_2 += 1;
      }
      partnership.extras_in_partnership += extra_runs;
      if (isWicket) partnership.is_unbroken = false;
      await partnership.save();
    }
  }
};

// ─── Helper: Emit Score Update ────────────────────────────────────────────────
const emitScoreUpdate = async (req, matchId, populatedMatch) => {
  try {
    const io = req.app.get('io');
    if (!io) return;

    const balls = await BallByBall.find({ match_id: matchId })
      .sort({ innings_number: 1, over_number: 1, ball_number_in_over: 1 });

    const partnership = await Partnership.findOne({ match_id: matchId, is_unbroken: true })
      .populate('batsman_1_id', 'display_name')
      .populate('batsman_2_id', 'display_name');

    const payload = {
      match: populatedMatch,
      balls,
      partnership
    };

    io.to(matchId).emit('match:score_update', payload);
    io.to(`match_room_${matchId}`).emit('match:score_update', payload);

    if (populatedMatch.match_status === 'COMPLETED') {
      invalidateLeaderboardCache();
      io.emit('global_leaderboard_updated');
    }
  } catch (err) {
    console.error('Error emitting score update:', err);
  }
};

const autoCalculateMatchResult = (match) => {
  const score1 = match.innings1?.score || 0;
  const score2 = match.innings2?.score || 0;
  const wickets2 = match.innings2?.wickets || 0;
  
  const team2ndBatting = match.current_innings_batting_team_id;
  const team1stBatting = match.current_innings_bowling_team_id;
  
  if (score2 > score1) {
    match.winner_team_id = team2ndBatting;
    match.result_type = 'WICKETS';
    match.win_margin = 10 - wickets2;
  } else if (score1 > score2) {
    match.winner_team_id = team1stBatting;
    match.result_type = 'RUNS';
    match.win_margin = score1 - score2;
  } else {
    match.winner_team_id = null;
    match.result_type = 'TIE';
    match.win_margin = 0;
  }
};

const verifyScoringPermission = (match, req) => {
  if (req.user.role === 'SUPER_ADMIN') return true;
  const userId = req.user.userId;
  const playerProfileId = req.user.associatedPlayerId;

  if (match.active_umpire_id) {
    return playerProfileId && match.active_umpire_id.toString() === playerProfileId.toString();
  }

  // Default: if no active_umpire_id is set, only the match creator can score
  return match.created_by?.toString() === userId;
};

// ─── POST /score/initialize ───────────────────────────────────────────────────
const initializeCrease = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { striker_id, non_striker_id, bowler_id } = req.body;

    if (!striker_id || !non_striker_id || !bowler_id) {
      return res.status(400).json({ error: 'striker_id, non_striker_id, and bowler_id are required' });
    }

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (!verifyScoringPermission(match, req)) {
      return res.status(403).json({ error: 'Access Denied: You are not authorized to score this match' });
    }
    if (match.match_status !== 'LIVE') {
      return res.status(400).json({ error: 'Match must be LIVE to start scoring' });
    }

    // Determine batting and bowling teams from toss decision
    if (!match.current_innings_batting_team_id) {
      const tossWonById = match.toss_won_by_team_id?.toString();
      const teamFirst = match.team_first_id?.toString();
      const teamSecond = match.team_second_id?.toString();

      let battingTeam, bowlingTeam;
      if (match.toss_decision === 'BAT') {
        battingTeam = tossWonById;
        bowlingTeam = tossWonById === teamFirst ? teamSecond : teamFirst;
      } else {
        battingTeam = tossWonById === teamFirst ? teamSecond : teamFirst;
        bowlingTeam = tossWonById;
      }
      match.current_innings_batting_team_id = battingTeam;
      match.current_innings_bowling_team_id = bowlingTeam;
    }

    match.crease_state = {
      striker_id,
      non_striker_id,
      bowler_id,
      legal_balls_this_over: 0
    };
    match.undo_actions_remaining = 0;

    await match.save();

    const populated = await getPopulatedMatch(matchId);

    // Emit WebSocket updates
    const io = req.app.get('io');
    if (io) io.to(matchId).emit('match_state_update', { match: populated });
    await emitScoreUpdate(req, matchId, populated);

    return res.status(200).json({ message: 'Crease initialized', match: populated });
  } catch (error) {
    console.error('Initialize crease error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── POST /score/ball ─────────────────────────────────────────────────────────
const logBall = async (req, res) => {
  try {
    const { matchId } = req.params;
    const {
      runs_from_bat = 0,
      is_boundary = false,
      boundary_type = null,
      is_extra = false,
      extra_type = null,
      extra_runs = 0,
      is_control_shot = true,
      dismissal = {}
    } = req.body;

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (!verifyScoringPermission(match, req)) {
      return res.status(403).json({ error: 'Access Denied: You are not authorized to score this match' });
    }
    if (match.match_status !== 'LIVE') {
      return res.status(400).json({ error: 'Match is not LIVE' });
    }
    if (!match.crease_state?.striker_id) {
      return res.status(400).json({ error: 'Crease must be initialized before logging balls' });
    }

    const { striker_id, non_striker_id, bowler_id, legal_balls_this_over } = match.crease_state;
    const innings = match.current_innings;
    const inningsKey = `innings${innings}`;
    const currentInnings = match[inningsKey];

    // ── Business Rule: Wicket ──────────────────────────────────────────────
    const isWicket = dismissal?.is_wicket === true;

    // ── Check Free Hit Wicket Validity ──────────────────────────────────────
    if (isWicket) {
      const lastBall = await BallByBall.findOne({ match_id: matchId, innings_number: innings }).sort({ _id: -1 });
      const isFreeHit = lastBall && lastBall.is_extra && lastBall.extra_type === 'NO_BALL' && match.match_rules?.no_ball_free_hit_enabled === true;
      if (isFreeHit) {
        const allowedDismissals = ['RUN_OUT', 'RETIRED_HURT', 'RETIRED_OUT', 'OBSTRUCTING_FIELD'];
        if (!allowedDismissals.includes(dismissal.wicket_type)) {
          return res.status(400).json({
            error: `Batsman cannot be dismissed ${dismissal.wicket_type} on a Free Hit. (Only Run Out, Retired Hurt, etc. are allowed)`
          });
        }
      }
    }

    // ── Business Rule: Legality ────────────────────────────────────────────
    const isLegal = !['WIDE', 'NO_BALL'].includes(extra_type);

    // ── Apply Match Rules on Score Increment ────────────────────────────────
    let runsAdded = runs_from_bat;
    let extraRunsAdded = extra_runs;

    if (is_extra) {
      if (extra_type === 'WIDE') {
        if (match.match_rules?.wide_ball_run_added === false) {
          extraRunsAdded = Math.max(0, extra_runs - 1);
        }
      } else if (extra_type === 'NO_BALL') {
        if (match.match_rules?.no_ball_run_calculated === false) {
          extraRunsAdded = Math.max(0, extra_runs - 1);
        }
      } else if (extra_type === 'BYE') {
        if (match.match_rules?.bye_runs_allowed === false) {
          extraRunsAdded = 0;
        }
      } else if (extra_type === 'LEG_BYE') {
        if (match.match_rules?.leg_bye_runs_allowed === false) {
          extraRunsAdded = 0;
        }
      } else if (extra_type === 'PENALTY') {
        if (match.match_rules?.penalty_runs_allowed === false) {
          extraRunsAdded = 0;
        }
      }
    }

    // ── Business Rule: Dot ball ────────────────────────────────────────────
    const totalRunsThisBall = runsAdded + extraRunsAdded;
    const isDot = totalRunsThisBall === 0 && !isWicket;

    // ── Business Rule: Score increment ────────────────────────────────────
    const scoreIncrement = runsAdded + extraRunsAdded;

    // ── Legal balls & over counter ─────────────────────────────────────────
    let newLegalBallsThisOver = legal_balls_this_over;
    let overCompleted = false;
    if (isLegal) {
      newLegalBallsThisOver += 1;
      currentInnings.total_legal_balls += 1;
    }
    if (newLegalBallsThisOver >= 6) {
      overCompleted = true;
      newLegalBallsThisOver = 0;
      currentInnings.overs_completed += 1;
    }

    // ── Update innings score & wickets ────────────────────────────────────
    currentInnings.score += scoreIncrement;
    if (isWicket) currentInnings.wickets += 1;
    match[inningsKey] = currentInnings;

    // ── Match phase ────────────────────────────────────────────────────────
    const matchPhase = getMatchPhase(currentInnings.overs_completed, match.total_overs_per_innings);

    // ── Over & innings numbers ─────────────────────────────────────────────
    const overNumber = currentInnings.overs_completed - (overCompleted ? 0 : 0);
    const priorOversCompleted = currentInnings.overs_completed - (overCompleted ? 1 : 0);
    const ballNumberInOver = overCompleted ? 6 : newLegalBallsThisOver;

    // ── Required runs (only innings 2) ─────────────────────────────────────
    let requiredRuns = null;
    if (innings === 2) {
      const target = match.innings1.score + 1;
      requiredRuns = target - currentInnings.score;
    }

    // ── Log ball document ──────────────────────────────────────────────────
    const ballDoc = new BallByBall({
      match_id: matchId,
      innings_number: innings,
      over_number: priorOversCompleted,
      ball_number_in_over: overCompleted ? 6 : newLegalBallsThisOver,
      total_legal_balls_in_innings: currentInnings.total_legal_balls,
      batting_team_id: match.current_innings_batting_team_id,
      bowling_team_id: match.current_innings_bowling_team_id,
      striker_id,
      non_striker_id,
      bowler_id,
      runs_from_bat: runsAdded,
      is_boundary,
      boundary_type: is_boundary ? boundary_type : null,
      is_extra,
      extra_type: is_extra ? extra_type : null,
      extra_runs: extraRunsAdded,
      is_legal_delivery: isLegal,
      is_dot_ball: isDot,
      is_control_shot,
      match_phase: matchPhase,
      dismissal: {
        is_wicket: isWicket,
        dismissed_player_id: isWicket ? (dismissal.dismissed_player_id || striker_id) : null,
        wicket_type: isWicket ? dismissal.wicket_type : null,
        fielder_involved_id: isWicket ? (dismissal.fielder_involved_id || null) : null,
        is_direct_hit: dismissal.is_direct_hit || false
      },
      current_total_score: currentInnings.score,
      current_wickets_down: currentInnings.wickets,
      required_runs: requiredRuns
    });
    await ballDoc.save();

    // ── Update Partnership ─────────────────────────────────────────────────
    if (isLegal) {
      let partnership = await Partnership.findOne({
        match_id: matchId,
        batsman_1_id: striker_id,
        batsman_2_id: non_striker_id,
        is_unbroken: true
      }) || await Partnership.findOne({
        match_id: matchId,
        batsman_1_id: non_striker_id,
        batsman_2_id: striker_id,
        is_unbroken: true
      });

      if (!partnership) {
        partnership = new Partnership({
          match_id: matchId,
          batsman_1_id: striker_id,
          batsman_2_id: non_striker_id
        });
      }

      partnership.total_runs_scored += runs_from_bat + (is_extra && ['BYE', 'LEG_BYE'].includes(extra_type) ? extra_runs : 0);
      partnership.total_balls_faced += 1;
      const isStrikerBatsman1 = partnership.batsman_1_id.toString() === striker_id.toString();
      if (isStrikerBatsman1) {
        partnership.runs_by_batsman_1 += runs_from_bat;
        partnership.balls_by_batsman_1 += 1;
      } else {
        partnership.runs_by_batsman_2 += runs_from_bat;
        partnership.balls_by_batsman_2 += 1;
      }
      partnership.extras_in_partnership += extra_runs;
      if (isWicket) partnership.is_unbroken = false;
      await partnership.save();
    }

    // ── Strike Rotation ────────────────────────────────────────────────────
    let newStriker = striker_id;
    let newNonStriker = non_striker_id;

    if (!isWicket) {
      // Odd runs rotate strike
      if (runs_from_bat % 2 === 1) {
        [newStriker, newNonStriker] = [non_striker_id, striker_id];
      }
      // End of over always rotates strike
      if (overCompleted) {
        [newStriker, newNonStriker] = [non_striker_id, striker_id];
      }
    } else {
      // On wicket: striker is dismissed; next batter must be set by frontend prompt
      // We keep non_striker in place, clear striker until next batter is picked
      newStriker = null;
    }

    // ── Check Innings Transition ────────────────────────────────────────────
    let inningsTransition = false;
    const maxOvers = match.total_overs_per_innings;
    const allOut = currentInnings.wickets >= 10;
    const oversUp = currentInnings.overs_completed >= maxOvers;

    if (allOut || oversUp) {
      currentInnings.is_complete = true;
      match[inningsKey] = currentInnings;

      if (innings === 1) {
        inningsTransition = true;
        match.current_innings = 2;
        match.current_innings_batting_team_id = match.current_innings_bowling_team_id;
        match.current_innings_bowling_team_id = innings === 1
          ? match.team_first_id?.toString() === match.current_innings_batting_team_id?.toString()
            ? match.team_second_id
            : match.team_first_id
          : match.current_innings_bowling_team_id;
        newStriker = null;
        newNonStriker = null;
        match.crease_state = { striker_id: null, non_striker_id: null, bowler_id: null, legal_balls_this_over: 0 };
      } else {
        // Match complete
        match.match_status = 'COMPLETED';
        autoCalculateMatchResult(match);
        newStriker = null;
        match.crease_state = { striker_id: null, non_striker_id: null, bowler_id: null, legal_balls_this_over: 0 };
      }
    }

    // ── Check innings2 target achieved ──────────────────────────────────────
    if (innings === 2 && requiredRuns !== null && requiredRuns <= 0) {
      currentInnings.is_complete = true;
      match[inningsKey] = currentInnings;
      match.match_status = 'COMPLETED';
      autoCalculateMatchResult(match);
      newStriker = null;
      match.crease_state = { striker_id: null, non_striker_id: null, bowler_id: null, legal_balls_this_over: 0 };
    }

    // ── Save Crease State ──────────────────────────────────────────────────
    if (match.match_status !== 'COMPLETED' && !inningsTransition) {
      match.crease_state = {
        striker_id: newStriker,
        non_striker_id: newNonStriker,
        bowler_id: overCompleted ? null : bowler_id, // bowler clears on over end for prompt
        legal_balls_this_over: newLegalBallsThisOver
      };
    }

    // Stack size limit capped at 5
    match.undo_actions_remaining = Math.min(5, (match.undo_actions_remaining || 0) + 1);

    await match.save();

    if (match.match_status === 'COMPLETED') {
      await updateCareerStatsForMatch(matchId);
    }

    const populated = await getPopulatedMatch(matchId);

    // ── Emit Socket Updates ────────────────────────────────────────────────
    const io = req.app.get('io');
    if (io) {
      io.to(matchId).emit('ball_logged', {
        ball: ballDoc,
        match: populated,
        over_completed: overCompleted,
        innings_transition: inningsTransition,
        wicket: isWicket
      });
    }
    await emitScoreUpdate(req, matchId, populated);

    return res.status(201).json({
      message: 'Ball logged successfully',
      ball: ballDoc,
      match: populated,
      over_completed: overCompleted,
      innings_transition: inningsTransition,
      wicket: isWicket,
      required_runs: requiredRuns
    });
  } catch (error) {
    console.error('Log ball error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── POST /score/set-next-batter ──────────────────────────────────────────────
const setNextBatter = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { new_striker_id } = req.body;

    if (!new_striker_id) return res.status(400).json({ error: 'new_striker_id required' });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (!verifyScoringPermission(match, req)) {
      return res.status(403).json({ error: 'Access Denied: You are not authorized to score this match' });
    }

    match.crease_state.striker_id = new_striker_id;
    match.undo_actions_remaining = 0; // reset undo on new batter entry
    await match.save();

    const populated = await getPopulatedMatch(matchId);

    const io = req.app.get('io');
    if (io) {
      const balls = await BallByBall.find({ match_id: matchId }).sort({ _id: 1 });
      io.to(matchId).emit('match_state_update', { match: populated, balls });
    }
    await emitScoreUpdate(req, matchId, populated);

    return res.status(200).json({ message: 'Next batter set', match: populated });
  } catch (error) {
    console.error('Set next batter error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── POST /score/set-next-bowler ──────────────────────────────────────────────
const setNextBowler = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { new_bowler_id } = req.body;

    if (!new_bowler_id) return res.status(400).json({ error: 'new_bowler_id required' });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (!verifyScoringPermission(match, req)) {
      return res.status(403).json({ error: 'Access Denied: You are not authorized to score this match' });
    }

    match.crease_state.bowler_id = new_bowler_id;
    match.crease_state.legal_balls_this_over = 0; // reset legal balls count for new over
    match.undo_actions_remaining = 0; // reset undo on new bowler/over start
    await match.save();

    const populated = await getPopulatedMatch(matchId);

    const io = req.app.get('io');
    if (io) {
      const balls = await BallByBall.find({ match_id: matchId }).sort({ _id: 1 });
      io.to(matchId).emit('match_state_update', { match: populated, balls });
    }
    await emitScoreUpdate(req, matchId, populated);

    return res.status(200).json({ message: 'Next bowler set', match: populated });
  } catch (error) {
    console.error('Set next bowler error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── GET /score/scorecard ─────────────────────────────────────────────────────
const getScorecard = async (req, res) => {
  try {
    const { matchId } = req.params;

    const match = await getPopulatedMatch(matchId);

    if (!match) return res.status(404).json({ error: 'Match not found' });

    // Fetch all balls for both innings
    const balls = await BallByBall.find({ match_id: matchId })
      .sort({ innings_number: 1, over_number: 1, ball_number_in_over: 1 });

    return res.status(200).json({ match, balls });
  } catch (error) {
    console.error('Get scorecard error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── POST /score/undo ─────────────────────────────────────────────────────────
const undoLastBall = async (req, res) => {
  try {
    const { matchId } = req.params;
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (!verifyScoringPermission(match, req)) {
      return res.status(403).json({ error: 'Access Denied: You are not authorized to score this match' });
    }

    if (!match.undo_actions_remaining || match.undo_actions_remaining <= 0) {
      return res.status(400).json({ error: 'No undo actions remaining' });
    }

    const undoneBall = await BallByBall.findOne({ match_id: matchId }).sort({ _id: -1 });
    if (!undoneBall) {
      return res.status(400).json({ error: 'No balls logged to undo' });
    }

    const previousBall = await BallByBall.findOne({
      match_id: matchId,
      _id: { $ne: undoneBall._id }
    }).sort({ _id: -1 });

    if (previousBall) {
      match.current_innings = previousBall.innings_number;
      
      if (undoneBall.innings_number === 2 && previousBall.innings_number === 1) {
        match.innings2 = {
          score: 0,
          wickets: 0,
          total_legal_balls: 0,
          overs_completed: 0,
          is_complete: false
        };
        match.innings1.is_complete = false;
      } else {
        const prevInningsKey = `innings${previousBall.innings_number}`;
        match[prevInningsKey] = {
          score: previousBall.current_total_score,
          wickets: previousBall.current_wickets_down,
          total_legal_balls: previousBall.total_legal_balls_in_innings,
          overs_completed: Math.floor(previousBall.total_legal_balls_in_innings / 6),
          is_complete: false
        };
      }

      match.crease_state.striker_id = undoneBall.striker_id;
      match.crease_state.non_striker_id = undoneBall.non_striker_id;
      match.crease_state.bowler_id = undoneBall.bowler_id;

      let prevLegalBalls = 0;
      if (previousBall.over_number === undoneBall.over_number) {
        prevLegalBalls = previousBall.ball_number_in_over;
      }
      match.crease_state.legal_balls_this_over = prevLegalBalls;

    } else {
      match.current_innings = 1;
      match.innings1 = {
        score: 0,
        wickets: 0,
        total_legal_balls: 0,
        overs_completed: 0,
        is_complete: false
      };
      match.innings2 = {
        score: 0,
        wickets: 0,
        total_legal_balls: 0,
        overs_completed: 0,
        is_complete: false
      };
      
      match.crease_state.striker_id = undoneBall.striker_id;
      match.crease_state.non_striker_id = undoneBall.non_striker_id;
      match.crease_state.bowler_id = undoneBall.bowler_id;
      match.crease_state.legal_balls_this_over = 0;
    }

    const tossWonById = match.toss_won_by_team_id?.toString();
    const teamFirst = match.team_first_id?.toString();
    const teamSecond = match.team_second_id?.toString();

    let battingTeam, bowlingTeam;
    if (match.toss_decision === 'BAT') {
      battingTeam = tossWonById;
      bowlingTeam = tossWonById === teamFirst ? teamSecond : teamFirst;
    } else {
      battingTeam = tossWonById === teamFirst ? teamSecond : teamFirst;
      bowlingTeam = tossWonById;
    }

    if (match.current_innings === 1) {
      match.current_innings_batting_team_id = battingTeam;
      match.current_innings_bowling_team_id = bowlingTeam;
    } else {
      match.current_innings_batting_team_id = bowlingTeam;
      match.current_innings_bowling_team_id = battingTeam;
    }

    match.match_status = 'LIVE';

    await BallByBall.deleteOne({ _id: undoneBall._id });
    match.undo_actions_remaining = Math.max(0, match.undo_actions_remaining - 1);
    await match.save();

    await updateCareerStatsForMatch(matchId);

    await recalculatePartnerships(matchId);

    const populated = await getPopulatedMatch(matchId);

    const io = req.app.get('io');
    if (io) {
      const balls = await BallByBall.find({ match_id: matchId }).sort({ _id: 1 });
      io.to(matchId).emit('match_state_update', { match: populated, balls });
    }
    await emitScoreUpdate(req, matchId, populated);

    return res.status(200).json({
      message: 'Undo successful',
      match: populated,
      undone_ball: undoneBall
    });

  } catch (error) {
    console.error('Undo error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── POST /score/substitute ───────────────────────────────────────────────────
const substitutePlayer = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { role, existing_player_id, new_player_id, sub_type } = req.body;

    if (!role || !existing_player_id || !new_player_id || !sub_type) {
      return res.status(400).json({ error: 'role, existing_player_id, new_player_id, and sub_type are required' });
    }

    if (!['striker', 'non_striker', 'bowler'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (!['correction', 'tactical'].includes(sub_type)) {
      return res.status(400).json({ error: 'Invalid sub_type' });
    }

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (!verifyScoringPermission(match, req)) {
      return res.status(403).json({ error: 'Access Denied: You are not authorized to score this match' });
    }
    if (match.match_status !== 'LIVE') {
      return res.status(400).json({ error: 'Match is not LIVE' });
    }

    const currentInnings = match.current_innings;
    const inningsKey = `innings${currentInnings}`;
    const overNumber = match[inningsKey].overs_completed;

    if (sub_type === 'correction') {
      const query = {
        match_id: matchId,
        innings_number: currentInnings,
        over_number: overNumber
      };

      if (role === 'bowler') {
        await BallByBall.updateMany({ ...query, bowler_id: existing_player_id }, { bowler_id: new_player_id });
      } else if (role === 'striker') {
        await BallByBall.updateMany({ ...query, striker_id: existing_player_id }, { striker_id: new_player_id });
        await BallByBall.updateMany({ ...query, 'dismissal.dismissed_player_id': existing_player_id }, { 'dismissal.dismissed_player_id': new_player_id });
      } else if (role === 'non_striker') {
        await BallByBall.updateMany({ ...query, non_striker_id: existing_player_id }, { non_striker_id: new_player_id });
        await BallByBall.updateMany({ ...query, 'dismissal.dismissed_player_id': existing_player_id }, { 'dismissal.dismissed_player_id': new_player_id });
      }

      await recalculatePartnerships(matchId);
    } else {
      if (role === 'striker' || role === 'non_striker') {
        const p = await Partnership.findOne({
          match_id: matchId,
          batsman_1_id: match.crease_state.striker_id,
          batsman_2_id: match.crease_state.non_striker_id,
          is_unbroken: true
        }) || await Partnership.findOne({
          match_id: matchId,
          batsman_1_id: match.crease_state.non_striker_id,
          batsman_2_id: match.crease_state.striker_id,
          is_unbroken: true
        });

        if (p) {
          p.is_unbroken = false;
          await p.save();
        }
      }
    }

    if (role === 'striker' && match.crease_state.striker_id?.toString() === existing_player_id) {
      match.crease_state.striker_id = new_player_id;
    } else if (role === 'non_striker' && match.crease_state.non_striker_id?.toString() === existing_player_id) {
      match.crease_state.non_striker_id = new_player_id;
    } else if (role === 'bowler' && match.crease_state.bowler_id?.toString() === existing_player_id) {
      match.crease_state.bowler_id = new_player_id;
    }

    await match.save();

    const populated = await getPopulatedMatch(matchId);

    const io = req.app.get('io');
    if (io) {
      const balls = await BallByBall.find({ match_id: matchId }).sort({ _id: 1 });
      io.to(matchId).emit('match_state_update', { match: populated, balls });
    }
    await emitScoreUpdate(req, matchId, populated);

    return res.status(200).json({
      message: 'Substitution successful',
      match: populated
    });

  } catch (error) {
    console.error('Substitution error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const endMatch = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { winner_team_id, result_type, win_margin } = req.body;

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (!verifyScoringPermission(match, req)) {
      return res.status(403).json({ error: 'Access Denied: You are not authorized to score this match' });
    }

    match.match_status = 'COMPLETED';
    if (winner_team_id === 'DRAW' || !winner_team_id) {
      match.winner_team_id = null;
      match.result_type = 'TIE';
      match.win_margin = 0;
    } else {
      match.winner_team_id = winner_team_id;
      match.result_type = result_type || 'RUNS';
      match.win_margin = Number(win_margin) || 0;
    }

    // Set innings complete
    if (match.innings1) match.innings1.is_complete = true;
    if (match.innings2) match.innings2.is_complete = true;

    // Reset crease
    match.crease_state = { striker_id: null, non_striker_id: null, bowler_id: null, legal_balls_this_over: 0 };
    match.undo_actions_remaining = 0;

    await match.save();

    // Trigger stats calculation
    await updateCareerStatsForMatch(matchId);

    const populated = await getPopulatedMatch(matchId);

    // Emit live update
    const io = req.app.get('io');
    if (io) {
      const balls = await BallByBall.find({ match_id: matchId }).sort({ _id: 1 });
      io.to(matchId).emit('match_state_update', { match: populated, balls });
    }
    await emitScoreUpdate(req, matchId, populated);

    return res.status(200).json({
      message: 'Match ended successfully',
      match: populated
    });
  } catch (error) {
    console.error('End match error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── POST /score/declare-innings ──────────────────────────────────────────────
const declareInnings = async (req, res) => {
  try {
    const { matchId } = req.params;

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (!verifyScoringPermission(match, req)) {
      return res.status(403).json({ error: 'Access Denied: You are not authorized to score this match' });
    }
    if (match.match_status !== 'LIVE') {
      return res.status(400).json({ error: 'Match is not live' });
    }

    const innings = match.current_innings || 1;
    const inningsKey = `innings${innings}`;

    // Mark current innings complete
    if (!match[inningsKey]) match[inningsKey] = {};
    match[inningsKey].is_complete = true;

    let inningsTransition = false;

    if (innings === 1) {
      inningsTransition = true;
      match.current_innings = 2;
      const prevBattingTeam = match.current_innings_batting_team_id;
      match.current_innings_batting_team_id = match.current_innings_bowling_team_id;
      match.current_innings_bowling_team_id = prevBattingTeam;
      match.crease_state = { striker_id: null, non_striker_id: null, bowler_id: null, legal_balls_this_over: 0 };
    } else {
      match.match_status = 'COMPLETED';
      autoCalculateMatchResult(match);
      match.crease_state = { striker_id: null, non_striker_id: null, bowler_id: null, legal_balls_this_over: 0 };
      match.undo_actions_remaining = 0;
    }

    await match.save();

    if (match.match_status === 'COMPLETED') {
      await updateCareerStatsForMatch(matchId);
    }

    const populated = await getPopulatedMatch(matchId);

    const io = req.app.get('io');
    if (io) {
      io.to(matchId).emit('ball_logged', {
        ball: null,
        match: populated,
        over_completed: false,
        innings_transition: inningsTransition,
        wicket: false
      });
    }
    await emitScoreUpdate(req, matchId, populated);

    return res.status(200).json({
      message: innings === 1 ? 'Innings declared — starting innings 2' : 'Match concluded via declaration',
      match: populated,
      innings_transition: inningsTransition
    });
  } catch (error) {
    console.error('Declare innings error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── POST /score/request-umpire ──────────────────────────────────────────────
const requestUmpire = async (req, res) => {
  try {
    const { matchId } = req.params;
    const playerProfileId = req.user.associatedPlayerId;

    if (!playerProfileId) {
      return res.status(403).json({ error: 'You do not have an associated player profile' });
    }

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });

    // Verify requester is listed as an umpire for this match
    const isUmpire = match.umpires?.some(id => id.toString() === playerProfileId.toString());
    if (!isUmpire) {
      return res.status(403).json({ error: 'You are not a registered umpire for this match' });
    }

    const Player = require('../models/Player');
    const player = await Player.findById(playerProfileId);
    const requesterName = player ? player.display_name : 'Umpire';

    const io = req.app.get('io');
    if (io) {
      io.to(matchId).emit('match:umpire_request', {
        matchId,
        requesterPlayerId: playerProfileId.toString(),
        requesterName,
        targetUmpirePlayerId: match.active_umpire_id ? match.active_umpire_id.toString() : null
      });
    }

    return res.status(200).json({ message: 'Umpire request sent successfully' });
  } catch (error) {
    console.error('Request umpire error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── POST /score/accept-umpire ───────────────────────────────────────────────
const acceptUmpire = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { requesterPlayerId } = req.body;

    if (!requesterPlayerId) {
      return res.status(400).json({ error: 'requesterPlayerId is required' });
    }

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });

    // Only the current active umpire (or creator if none active) can accept
    if (!verifyScoringPermission(match, req)) {
      return res.status(403).json({ error: 'Only the active umpire can accept requests' });
    }

    // Verify requester is listed in umpires
    const isUmpire = match.umpires?.some(id => id.toString() === requesterPlayerId.toString());
    if (!isUmpire) {
      return res.status(403).json({ error: 'Requester is not a registered umpire for this match' });
    }

    // Capture old umpire before overwriting
    const oldUmpireId = match.active_umpire_id
      ? match.active_umpire_id.toString()
      : match.created_by?.toString();

    match.active_umpire_id = requesterPlayerId;
    await match.save();

    const populated = await getPopulatedMatch(matchId);

    const io = req.app.get('io');
    if (io) {
      const balls = await BallByBall.find({ match_id: matchId }).sort({ _id: 1 });
      io.to(matchId).emit('match_state_update', { match: populated, balls });
      io.to(matchId).emit('match:umpire_accepted', {
        matchId,
        newActiveUmpireId: requesterPlayerId,
        oldUmpireId
      });
    }
    await emitScoreUpdate(req, matchId, populated);

    return res.status(200).json({ message: 'Umpire handover accepted', match: populated });
  } catch (error) {
    console.error('Accept umpire error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─── POST /score/appoint-umpire ──────────────────────────────────────────────
const appointUmpire = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { targetPlayerId } = req.body;

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });

    // Only the match creator can appoint directly
    if (match.created_by?.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Only the match creator can appoint umpires directly' });
    }

    if (targetPlayerId && targetPlayerId !== 'creator') {
      // Verify target player is in umpires
      const isUmpire = match.umpires?.some(id => id.toString() === targetPlayerId.toString());
      if (!isUmpire) {
        return res.status(403).json({ error: 'Target player is not a registered umpire for this match' });
      }
      match.active_umpire_id = targetPlayerId;
    } else {
      // Reset to match creator
      match.active_umpire_id = null;
    }

    await match.save();

    const populated = await getPopulatedMatch(matchId);

    const io = req.app.get('io');
    if (io) {
      const balls = await BallByBall.find({ match_id: matchId }).sort({ _id: 1 });
      io.to(matchId).emit('match_state_update', { match: populated, balls });
      if (targetPlayerId && targetPlayerId !== 'creator') {
        io.to(matchId).emit('match:umpire_accepted', {
          matchId,
          newActiveUmpireId: targetPlayerId,
          oldUmpireId: null  // creator demotes themselves, no redirect needed for creator here
        });
      }
    }
    await emitScoreUpdate(req, matchId, populated);

    return res.status(200).json({ message: 'Umpire appointed successfully', match: populated });
  } catch (error) {
    console.error('Appoint umpire error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  initializeCrease,
  logBall,
  setNextBatter,
  setNextBowler,
  getScorecard,
  undoLastBall,
  substitutePlayer,
  endMatch,
  declareInnings,
  requestUmpire,
  acceptUmpire,
  appointUmpire
};

