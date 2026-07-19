const express = require('express');
const router = express.Router();
const { searchPlayers, getPlayerById, updatePlayer, getPlayerCharts } = require('../controllers/playerController');
const { verifyToken } = require('../middleware/auth');
const { uploadAvatar } = require('../middleware/upload');

router.get('/search', verifyToken, searchPlayers);
router.get('/:playerId', verifyToken, getPlayerById);
router.get('/:playerId/stats/charts', verifyToken, getPlayerCharts);
router.put('/:playerId', verifyToken, uploadAvatar.single('profile_picture'), updatePlayer);

module.exports = router;
