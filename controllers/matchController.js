const Match = require('../models/Match');
const Player = require('../models/Player');
const User = require('../models/User');

const createMatch = async (req, res) => {
  try {
    const {
      venue,
      match_date_time,
      total_overs_per_innings,
      max_overs_per_bowler,
      ball_type,
      team_first_id,
      team_second_id,
      match_rules,
      copy_team_a_previous_squad,
      team_a_previous_match_id,
      copy_team_b_previous_squad,
      team_b_previous_match_id
    } = req.body;

    const userId = req.user.userId;

    if (!venue || !match_date_time || !total_overs_per_innings || !max_overs_per_bowler || !ball_type || !team_first_id || !team_second_id) {
      return res.status(400).json({ error: 'All configuration fields are required' });
    }

    if (team_first_id === team_second_id) {
      return res.status(400).json({ error: 'Cannot configure match with the same team twice' });
    }

    // Accept umpires from request or fallback to match creator
    const umpires = [];
    if (req.body.umpires && Array.isArray(req.body.umpires) && req.body.umpires.length > 0) {
      umpires.push(...req.body.umpires);
    } else if (req.user.associatedPlayerId) {
      umpires.push(req.user.associatedPlayerId);
    }

    // Copy squads independently per team if requested
    let playing_xi_team_first = [];
    let substitutes_team_first = [];
    let playing_xi_team_second = [];
    let substitutes_team_second = [];

    if (copy_team_a_previous_squad) {
      let matchA = team_a_previous_match_id ? await Match.findById(team_a_previous_match_id) : null;
      if (!matchA) {
        matchA = await Match.findOne({
          $or: [{ team_first_id: team_first_id }, { team_second_id: team_first_id }]
        }).sort({ match_date_time: -1 });
      }
      if (matchA) {
        const isFirst = (matchA.team_first_id?._id || matchA.team_first_id)?.toString() === team_first_id.toString();
        playing_xi_team_first = isFirst ? (matchA.playing_xi_team_first || []) : (matchA.playing_xi_team_second || []);
        substitutes_team_first = isFirst ? (matchA.substitutes_team_first || []) : (matchA.substitutes_team_second || []);

        if (matchA.umpires && Array.isArray(matchA.umpires)) {
          matchA.umpires.forEach(uId => {
            const strId = (uId._id || uId).toString();
            if (!umpires.some(existing => (existing._id || existing).toString() === strId)) {
              umpires.push(uId);
            }
          });
        }
      }
    }

    if (copy_team_b_previous_squad) {
      let matchB = team_b_previous_match_id ? await Match.findById(team_b_previous_match_id) : null;
      if (!matchB) {
        matchB = await Match.findOne({
          $or: [{ team_first_id: team_second_id }, { team_second_id: team_second_id }]
        }).sort({ match_date_time: -1 });
      }
      if (matchB) {
        const isFirst = (matchB.team_first_id?._id || matchB.team_first_id)?.toString() === team_second_id.toString();
        playing_xi_team_second = isFirst ? (matchB.playing_xi_team_first || []) : (matchB.playing_xi_team_second || []);
        substitutes_team_second = isFirst ? (matchB.substitutes_team_first || []) : (matchB.substitutes_team_second || []);

        if (matchB.umpires && Array.isArray(matchB.umpires)) {
          matchB.umpires.forEach(uId => {
            const strId = (uId._id || uId).toString();
            if (!umpires.some(existing => (existing._id || existing).toString() === strId)) {
              umpires.push(uId);
            }
          });
        }
      }
    }

    const newMatch = new Match({
      venue,
      match_date_time: new Date(match_date_time),
      total_overs_per_innings: Number(total_overs_per_innings),
      max_overs_per_bowler: Number(max_overs_per_bowler),
      ball_type,
      team_first_id,
      team_second_id,
      created_by: userId,
      umpires,
      playing_xi_team_first,
      substitutes_team_first,
      playing_xi_team_second,
      substitutes_team_second,
      match_status: 'UPCOMING',
      match_rules: match_rules || {
        wide_ball_run_added: true,
        no_ball_run_calculated: true,
        no_ball_free_hit_enabled: true,
        overthrow_runs_allowed: true,
        bye_runs_allowed: true,
        leg_bye_runs_allowed: true,
        penalty_runs_allowed: true
      }
    });

    const savedMatch = await newMatch.save();
    return res.status(201).json({
      message: 'Match configured successfully',
      match: savedMatch
    });
  } catch (error) {
    console.error('Create match error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getTeamPreviousSquad = async (req, res) => {
  try {
    const { teamId } = req.query;
    if (!teamId) {
      return res.status(400).json({ error: 'teamId is required' });
    }

    const matches = await Match.find({
      $or: [
        { team_first_id: teamId },
        { team_second_id: teamId }
      ]
    })
      .sort({ match_date_time: -1 })
      .limit(20);

    for (const m of matches) {
      const firstId = (m.team_first_id?._id || m.team_first_id)?.toString();
      const targetId = teamId.toString();

      const isTeamFirst = firstId === targetId;
      const playingXi = isTeamFirst ? (m.playing_xi_team_first || []) : (m.playing_xi_team_second || []);
      const substitutes = isTeamFirst ? (m.substitutes_team_first || []) : (m.substitutes_team_second || []);

      const count = playingXi.length + substitutes.length;
      if (count > 0) {
        return res.status(200).json({
          hasPreviousMatch: true,
          matchId: m._id,
          squadCount: count
        });
      }
    }

    return res.status(200).json({ hasPreviousMatch: false });
  } catch (error) {
    console.error('Get team previous squad error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getMatchById = async (req, res) => {
  try {
    const { matchId } = req.params;
    const match = await Match.findById(matchId)
      .populate('team_first_id')
      .populate('team_second_id')
      .populate('playing_xi_team_first')
      .populate('playing_xi_team_second')
      .populate('substitutes_team_first')
      .populate('substitutes_team_second')
      .populate('umpires')
      .populate('scorers')
      .populate('created_by', 'phone_number');

    if (!match) {
      return res.status(404).json({ error: 'Match config not found' });
    }
    return res.status(200).json(match);
  } catch (error) {
    console.error('Get match error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getShareLink = async (req, res) => {
  try {
    const { matchId } = req.params;
    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Return the local frontend redirect link
    const shareLink = `http://localhost:5173/matches/${matchId}/join`;
    return res.status(200).json({ share_link: shareLink });
  } catch (error) {
    console.error('Share link error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const joinMatchRoster = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { first_name, last_name, display_name, team_id, is_substitute } = req.body;

    if (!display_name || !team_id) {
      return res.status(400).json({ error: 'Display name and Team ID are required' });
    }

    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Verify team_id matches either team A or team B
    const isTeamFirst = match.team_first_id.toString() === team_id;
    const isTeamSecond = match.team_second_id.toString() === team_id;

    if (!isTeamFirst && !isTeamSecond) {
      return res.status(400).json({ error: 'Team ID is not part of this match' });
    }

    // Find if player with this display name exists, or create a guest profile
    let player = await Player.findOne({ display_name: display_name.trim() });
    if (!player) {
      player = new Player({
        first_name: first_name ? first_name.trim() : 'Guest',
        last_name: last_name ? last_name.trim() : 'Player',
        display_name: display_name.trim(),
        batting_style: 'RIGHT_HAND',
        bowling_style: 'NONE',
        player_roles: ['BATSMAN']
      });
      player = await player.save();
    }

    const playerId = player._id;

    // Check if player is already registered in the match lists
    const inFirstXI = match.playing_xi_team_first.includes(playerId);
    const inSecondXI = match.playing_xi_team_second.includes(playerId);
    const inFirstSubs = match.substitutes_team_first.includes(playerId);
    const inSecondSubs = match.substitutes_team_second.includes(playerId);

    if (inFirstXI || inSecondXI || inFirstSubs || inSecondSubs) {
      return res.status(400).json({ error: 'Player is already registered in this match squad' });
    }

    // Append to corresponding array
    if (isTeamFirst) {
      if (is_substitute) {
        match.substitutes_team_first.push(playerId);
      } else {
        match.playing_xi_team_first.push(playerId);
      }
    } else {
      if (is_substitute) {
        match.substitutes_team_second.push(playerId);
      } else {
        match.playing_xi_team_second.push(playerId);
      }
    }

    await match.save();

    // Populate full details for socket updates
    const populatedMatch = await Match.findById(matchId)
      .populate('team_first_id')
      .populate('team_second_id')
      .populate('playing_xi_team_first')
      .populate('playing_xi_team_second')
      .populate('substitutes_team_first')
      .populate('substitutes_team_second');

    // Emit live update event via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(matchId).emit('player_joined', {
        match: populatedMatch,
        message: `${player.display_name} has joined the roster!`
      });
    }

    return res.status(200).json({
      message: 'Joined roster successfully',
      match: populatedMatch
    });
  } catch (error) {
    console.error('Join roster error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateToss = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { toss_won_by_team_id, toss_decision } = req.body;

    if (!toss_won_by_team_id || !toss_decision) {
      return res.status(400).json({ error: 'Toss winner and decision are required' });
    }

    if (!['BAT', 'FIELD'].includes(toss_decision)) {
      return res.status(400).json({ error: 'Invalid toss decision. Must be BAT or FIELD.' });
    }

    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    match.toss_won_by_team_id = toss_won_by_team_id;
    match.toss_decision = toss_decision;
    match.match_status = 'LIVE';

    const savedMatch = await match.save();

    // Populate for socket updates
    const populatedMatch = await Match.findById(matchId)
      .populate('team_first_id')
      .populate('team_second_id')
      .populate('playing_xi_team_first')
      .populate('playing_xi_team_second')
      .populate('substitutes_team_first')
      .populate('substitutes_team_second');

    // Emit toss updated event via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(matchId).emit('toss_updated', {
        match: populatedMatch,
        message: `Toss won by team! Decision is: ${toss_decision}`
      });
    }

    return res.status(200).json({
      message: 'Toss details updated, match is now LIVE',
      match: populatedMatch
    });
  } catch (error) {
    console.error('Toss setup error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateUmpires = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { umpires } = req.body;

    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    match.umpires = umpires || [];
    await match.save();

    const populatedMatch = await Match.findById(matchId)
      .populate('team_first_id')
      .populate('team_second_id')
      .populate('playing_xi_team_first')
      .populate('playing_xi_team_second')
      .populate('substitutes_team_first')
      .populate('substitutes_team_second')
      .populate('umpires');

    const io = req.app.get('io');
    if (io) {
      io.to(matchId).emit('player_joined', {
        match: populatedMatch,
        message: 'Umpires updated'
      });
    }

    return res.status(200).json({
      message: 'Umpires updated successfully',
      match: populatedMatch
    });
  } catch (error) {
    console.error('Update umpires error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getAllMatches = async (req, res) => {
  try {
    const matches = await Match.find()
      .populate('team_first_id')
      .populate('team_second_id')
      .populate('winner_team_id')
      .populate('created_by', 'phone_number');
    
    // Status prioritization:
    // Group 0: LIVE, PAUSED, RAIN_DELAY (Live matches first at top)
    // Group 1: UPCOMING (Upcoming/created matches)
    // Group 2: COMPLETED, ABANDONED (Completed matches last at bottom)
    const getStatusGroup = (status) => {
      if (['LIVE', 'PAUSED', 'RAIN_DELAY'].includes(status)) return 0;
      if (status === 'UPCOMING') return 1;
      return 2; // COMPLETED, ABANDONED or default
    };

    matches.sort((a, b) => {
      const groupA = getStatusGroup(a.match_status);
      const groupB = getStatusGroup(b.match_status);
      
      if (groupA !== groupB) {
        return groupA - groupB;
      }
      
      // Inside same group, sort by createdAt descending (most recent first)
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return res.status(200).json(matches);
  } catch (error) {
    console.error('Get all matches error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const dropPlayerFromRoster = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { playerId } = req.body;

    if (!playerId) {
      return res.status(400).json({ error: 'Player ID is required' });
    }

    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Pull playerId from all squad lists & umpires
    match.playing_xi_team_first = match.playing_xi_team_first.filter(id => id.toString() !== playerId.toString());
    match.playing_xi_team_second = match.playing_xi_team_second.filter(id => id.toString() !== playerId.toString());
    match.substitutes_team_first = match.substitutes_team_first.filter(id => id.toString() !== playerId.toString());
    match.substitutes_team_second = match.substitutes_team_second.filter(id => id.toString() !== playerId.toString());
    match.umpires = match.umpires.filter(id => id.toString() !== playerId.toString());

    await match.save();

    const populatedMatch = await Match.findById(matchId)
      .populate('team_first_id')
      .populate('team_second_id')
      .populate('playing_xi_team_first')
      .populate('playing_xi_team_second')
      .populate('substitutes_team_first')
      .populate('substitutes_team_second')
      .populate('umpires');

    const player = await Player.findById(playerId);

    const io = req.app.get('io');
    if (io) {
      const payload = {
        matchId,
        match: populatedMatch,
        playerId: playerId.toString(),
        playerName: player ? player.display_name : 'Player',
        message: `${player ? player.display_name : 'Player'} removed from match roster`
      };
      io.to(matchId).emit('player_dropped', payload);
      io.emit('global_player_dropped', payload);
    }


    return res.status(200).json({
      message: 'Player dropped successfully',
      match: populatedMatch
    });
  } catch (error) {
    console.error('Drop player error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const movePlayerTeam = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { playerId, targetTeamId, isSubstitute } = req.body;

    if (!playerId || !targetTeamId) {
      return res.status(400).json({ error: 'Player ID and target Team ID are required' });
    }

    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const isTeamFirst = match.team_first_id.toString() === targetTeamId.toString();
    const isTeamSecond = match.team_second_id.toString() === targetTeamId.toString();

    if (!isTeamFirst && !isTeamSecond) {
      return res.status(400).json({ error: 'Target team is not part of this match' });
    }

    // Remove player from all current squad lists
    match.playing_xi_team_first = match.playing_xi_team_first.filter(id => id.toString() !== playerId.toString());
    match.playing_xi_team_second = match.playing_xi_team_second.filter(id => id.toString() !== playerId.toString());
    match.substitutes_team_first = match.substitutes_team_first.filter(id => id.toString() !== playerId.toString());
    match.substitutes_team_second = match.substitutes_team_second.filter(id => id.toString() !== playerId.toString());

    // Add to target team squad
    if (isTeamFirst) {
      if (isSubstitute) {
        match.substitutes_team_first.push(playerId);
      } else {
        match.playing_xi_team_first.push(playerId);
      }
    } else {
      if (isSubstitute) {
        match.substitutes_team_second.push(playerId);
      } else {
        match.playing_xi_team_second.push(playerId);
      }
    }

    await match.save();

    const populatedMatch = await Match.findById(matchId)
      .populate('team_first_id')
      .populate('team_second_id')
      .populate('playing_xi_team_first')
      .populate('playing_xi_team_second')
      .populate('substitutes_team_first')
      .populate('substitutes_team_second')
      .populate('umpires');

    const player = await Player.findById(playerId);
    const targetTeam = isTeamFirst ? populatedMatch.team_first_id : populatedMatch.team_second_id;

    const io = req.app.get('io');
    if (io) {
      const payload = {
        matchId,
        match: populatedMatch,
        playerId: playerId.toString(),
        targetTeamName: targetTeam ? targetTeam.team_name : 'New Team',
        playerName: player ? player.display_name : 'Player',
        message: `${player ? player.display_name : 'Player'} moved to ${targetTeam ? targetTeam.team_name : 'new team'}`
      };
      io.to(matchId).emit('player_moved', payload);
      io.emit('global_player_moved', payload);
    }


    return res.status(200).json({
      message: 'Player moved successfully',
      targetTeamName: targetTeam ? targetTeam.team_name : '',
      playerName: player ? player.display_name : '',
      match: populatedMatch
    });
  } catch (error) {
    console.error('Move player error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const deleteMatch = async (req, res) => {
  try {
    const { matchId } = req.params;
    const match = await Match.findById(matchId);

    const BallByBall = require('../models/BallByBall');
    const Partnership = require('../models/Partnership');

    await BallByBall.deleteMany({ match_id: matchId });
    await Partnership.deleteMany({ match_id: matchId });
    if (match) {
      await Match.findByIdAndDelete(matchId);
    }

    const io = req.app.get('io');
    if (io) {
      const payload = {
        matchId: matchId.toString(),
        message: 'This match has been removed or cancelled.'
      };
      io.to(matchId).emit('match_discarded', payload);
      io.emit('global_match_discarded', payload);
    }

    return res.status(200).json({ message: 'Match discarded successfully' });
  } catch (error) {
    console.error('Delete match error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};


module.exports = {
  createMatch,
  getTeamPreviousSquad,
  getMatchById,
  getShareLink,
  joinMatchRoster,
  updateToss,
  updateUmpires,
  getAllMatches,
  dropPlayerFromRoster,
  movePlayerTeam,
  deleteMatch
};


