const Player = require('../models/Player');
const Match = require('../models/Match');
const BallByBall = require('../models/BallByBall');

const searchPlayers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(200).json([]);
    }

    // Search by display name, first name, last name, or username (case-insensitive regex)
    const regex = new RegExp(q, 'i');
    const players = await Player.find({
      $or: [
        { display_name: regex },
        { first_name: regex },
        { last_name: regex },
        { username: regex }
      ]
    }).limit(15);

    return res.status(200).json(players);
  } catch (error) {
    console.error('Search players error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getPlayerById = async (req, res) => {
  try {
    const { playerId } = req.params;
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player profile not found' });
    }
    return res.status(200).json(player);
  } catch (error) {
    console.error('Get player error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updatePlayer = async (req, res) => {
  try {
    const { playerId } = req.params;

    // Check auth rules: only Super Admins or the player themselves can edit their profile
    if (req.user.role !== 'SUPER_ADMIN' && req.user.associatedPlayerId !== playerId) {
      return res.status(403).json({ error: 'Access Denied: You can only edit your own profile' });
    }

    const { first_name, last_name, display_name, username, date_of_birth, batting_style, bowling_style, player_roles } = req.body;

    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player profile not found' });
    }

    // Update username with uniqueness check
    if (username) {
      const cleanUsername = username.trim().toLowerCase();
      if (cleanUsername !== player.username) {
        const existing = await Player.findOne({ username: cleanUsername });
        if (existing) {
          return res.status(409).json({ error: 'Username is already taken' });
        }
        player.username = cleanUsername;
      }
    }

    // Update basic biographical details if supplied
    if (first_name) player.first_name = first_name.trim();
    if (last_name) player.last_name = last_name.trim();
    if (display_name) player.display_name = display_name.trim();
    if (date_of_birth) player.date_of_birth = new Date(date_of_birth);
    if (batting_style) player.batting_style = batting_style;
    if (bowling_style) player.bowling_style = bowling_style;
    
    // Parse roles array (handling both JSON payload arrays and multer text fields)
    if (player_roles) {
      player.player_roles = Array.isArray(player_roles) 
        ? player_roles 
        : typeof player_roles === 'string' 
          ? player_roles.split(',').map(r => r.trim()) 
          : player.player_roles;
    }

    // Handle profile image upload
    if (req.file) {
      // Build dynamic local URL path
      player.profile_picture_url = `http://localhost:5000/uploads/avatars/${req.file.filename}`;
    }

    const updatedPlayer = await player.save();
    return res.status(200).json({
      message: 'Player profile updated successfully',
      player: updatedPlayer
    });
  } catch (error) {
    console.error('Update player error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const formatOvers = (legal_balls) => {
  const overs = Math.floor(legal_balls / 6);
  const balls = legal_balls % 6;
  return `${overs}.${balls}`;
};

const getPlayerCharts = async (req, res) => {
  try {
    const { playerId } = req.params;
    
    // Find all completed matches where the player was in squad / played
    const completedMatches = await Match.find({
      match_status: 'COMPLETED',
      $or: [
        { playing_xi_team_first: playerId },
        { playing_xi_team_second: playerId },
        { substitutes_team_first: playerId },
        { substitutes_team_second: playerId }
      ]
    }).sort({ match_date_time: 1 })
      .populate('team_first_id', 'team_short_name')
      .populate('team_second_id', 'team_short_name');

    const chartData = [];

    for (const match of completedMatches) {
      const matchId = match._id;

      // 1. Batting runs in this match
      const strikerBalls = await BallByBall.find({ match_id: matchId, striker_id: playerId });
      let runs = 0;
      let ballsFaced = 0;
      let didBat = strikerBalls.length > 0;

      strikerBalls.forEach(b => {
        runs += b.runs_from_bat;
        if (b.extra_type !== 'WIDE') {
          ballsFaced += 1;
        }
      });

      let isOut = false;
      if (didBat) {
        const wicket = await BallByBall.findOne({
          match_id: matchId,
          'dismissal.is_wicket': true,
          'dismissal.dismissed_player_id': playerId
        });
        if (wicket) isOut = true;
      }

      // 2. Bowling in this match
      const bowlerBalls = await BallByBall.find({ match_id: matchId, bowler_id: playerId });
      let runsConceded = 0;
      let wickets = 0;
      let ballsBowled = 0;
      let didBowl = bowlerBalls.length > 0;

      bowlerBalls.forEach(b => {
        let con = 0;
        if (b.is_extra) {
          if (['WIDE', 'NO_BALL'].includes(b.extra_type)) {
            con = b.extra_runs + b.runs_from_bat;
          }
        } else {
          con = b.runs_from_bat;
        }
        runsConceded += con;

        if (b.is_legal_delivery) {
          ballsBowled += 1;
        }

        if (b.dismissal?.is_wicket && ['BOWLED', 'CAUGHT', 'CAUGHT_AND_BOWLED', 'LBW', 'STUMPED', 'HIT_WICKET'].includes(b.dismissal.wicket_type)) {
          wickets += 1;
        }
      });

      // 3. Opponent team name
      let opponent = 'Opponent';
      const isTeamFirst = match.playing_xi_team_first.some(id => id.toString() === playerId) || 
                          match.substitutes_team_first.some(id => id.toString() === playerId);
      if (isTeamFirst) {
        opponent = match.team_second_id?.team_short_name || 'OPP';
      } else {
        opponent = match.team_first_id?.team_short_name || 'OPP';
      }

      const matchDateStr = new Date(match.match_date_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      chartData.push({
        matchId,
        date: matchDateStr,
        opponent,
        batting: didBat ? { runs, balls: ballsFaced, isNotOut: !isOut } : null,
        bowling: didBowl ? { wickets, runsConceded, overs: formatOvers(ballsBowled) } : null
      });
    }

    // Resolve pacer vs spinner splits for batting (career-wide)
    const allStrikerBalls = await BallByBall.find({ striker_id: playerId })
      .populate('bowler_id', 'bowling_style');

    let runsVsPacers = 0;
    let ballsVsPacers = 0;
    let runsVsSpinners = 0;
    let ballsVsSpinners = 0;

    allStrikerBalls.forEach(b => {
      const bStyle = (b.bowler_id?.bowling_style || 'NONE').toUpperCase();
      const isSpinner = bStyle.includes('SPIN') || bStyle.includes('BREAK') || bStyle.includes('UNORTHODOX') || bStyle.includes('SLOW');

      if (isSpinner) {
        runsVsSpinners += b.runs_from_bat || 0;
        if (b.extra_type !== 'WIDE') ballsVsSpinners += 1;
      } else {
        runsVsPacers += b.runs_from_bat || 0;
        if (b.extra_type !== 'WIDE') ballsVsPacers += 1;
      }
    });

    const allWickets = await BallByBall.find({
      'dismissal.is_wicket': true,
      'dismissal.dismissed_player_id': playerId
    }).populate('bowler_id', 'bowling_style');

    let outsVsPacers = 0;
    let outsVsSpinners = 0;

    allWickets.forEach(w => {
      const bStyle = (w.bowler_id?.bowling_style || 'NONE').toUpperCase();
      const isSpinner = bStyle.includes('SPIN') || bStyle.includes('BREAK') || bStyle.includes('UNORTHODOX') || bStyle.includes('SLOW');

      if (isSpinner) outsVsSpinners += 1;
      else outsVsPacers += 1;
    });

    return res.status(200).json({
      timeline: chartData,
      splits: {
        runsVsPacers,
        ballsVsPacers,
        outsVsPacers,
        runsVsSpinners,
        ballsVsSpinners,
        outsVsSpinners
      }
    });

  } catch (error) {
    console.error('Get player charts error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  searchPlayers,
  getPlayerById,
  updatePlayer,
  getPlayerCharts
};
