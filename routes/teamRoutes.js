const express = require('express');
const router = express.Router();
const { createTeam, getTeams, getTeamById, addSquadMember } = require('../controllers/teamController');
const { verifyToken } = require('../middleware/auth');
const { uploadLogo } = require('../middleware/upload');

router.post('/', verifyToken, uploadLogo.single('logo'), createTeam);
router.get('/', verifyToken, getTeams);
router.get('/:teamId', verifyToken, getTeamById);
router.post('/:teamId/roster', verifyToken, addSquadMember);

module.exports = router;
