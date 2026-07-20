const express = require('express');
const router = express.Router();
const { createMatch, getMatchById, getShareLink, joinMatchRoster, updateToss, updateUmpires, getAllMatches, dropPlayerFromRoster, movePlayerTeam, deleteMatch } = require('../controllers/matchController');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, createMatch);
router.get('/', verifyToken, getAllMatches);
router.get('/:matchId', verifyToken, getMatchById);
router.get('/:matchId/share-link', verifyToken, getShareLink);
router.post('/:matchId/join', joinMatchRoster); // Publicly accessible to allow guests to join roster via invite links
router.post('/:matchId/drop-player', dropPlayerFromRoster);
router.post('/:matchId/move-player', movePlayerTeam);
router.put('/:matchId/toss', verifyToken, updateToss);
router.put('/:matchId/umpires', verifyToken, updateUmpires);
router.delete('/:matchId', deleteMatch);

module.exports = router;


