const Team = require('../models/Team');

const createTeam = async (req, res) => {
  try {
    const { team_name, team_short_name, squad_members } = req.body;
    const userId = req.user.userId;

    if (!team_name || !team_short_name) {
      return res.status(400).json({ error: 'Team name and short name are required' });
    }

    const existingTeam = await Team.findOne({ team_name });
    if (existingTeam) {
      return res.status(409).json({ error: 'Team name is already registered' });
    }

    let members = [];
    if (squad_members) {
      try {
        members = typeof squad_members === 'string' ? JSON.parse(squad_members) : squad_members;
      } catch (e) {
        console.error('Failed to parse squad members:', e);
      }
    }

    const newTeam = new Team({
      team_name: team_name.trim(),
      team_short_name: team_short_name.trim().toUpperCase(),
      created_by_user_id: userId,
      squad_members: members
    });

    if (req.file) {
      newTeam.logo_url = `http://localhost:5000/uploads/logos/${req.file.filename}`;
    }

    const savedTeam = await newTeam.save();
    return res.status(201).json({
      message: 'Team created successfully',
      team: savedTeam
    });
  } catch (error) {
    console.error('Create team error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getTeams = async (req, res) => {
  try {
    const teams = await Team.find().populate('squad_members.player_id', 'first_name last_name display_name profile_picture_url');
    return res.status(200).json(teams);
  } catch (error) {
    console.error('Get teams error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getTeamById = async (req, res) => {
  try {
    const { teamId } = req.params;
    const team = await Team.findById(teamId).populate('squad_members.player_id');
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    return res.status(200).json(team);
  } catch (error) {
    console.error('Get team details error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const addSquadMember = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { player_id, role_in_team } = req.body;

    if (!player_id) {
      return res.status(400).json({ error: 'Player ID is required' });
    }

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Verify permissions: only Super Admin or the team creator can alter the squad list
    if (req.user.role !== 'SUPER_ADMIN' && team.created_by_user_id.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Access Denied: Only team creators or admins can add members' });
    }

    // Check if player is already a member
    const alreadyMember = team.squad_members.some(member => member.player_id.toString() === player_id);
    if (alreadyMember) {
      return res.status(400).json({ error: 'Player is already a member of this team squad' });
    }

    team.squad_members.push({
      player_id,
      role_in_team: role_in_team || 'MEMBER',
      joined_date: new Date()
    });

    const updatedTeam = await team.save();
    const populatedTeam = await Team.findById(updatedTeam._id).populate('squad_members.player_id');

    return res.status(200).json({
      message: 'Player successfully added to squad roster',
      team: populatedTeam
    });
  } catch (error) {
    console.error('Add squad member error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  createTeam,
  getTeams,
  getTeamById,
  addSquadMember
};
