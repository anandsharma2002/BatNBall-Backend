const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { getCapsLeaderboard, getChaseMastersLeaderboard } = require('../controllers/leaderboardController');

router.get('/caps', verifyToken, getCapsLeaderboard);
router.get('/chase-masters', verifyToken, getChaseMastersLeaderboard);

module.exports = router;
