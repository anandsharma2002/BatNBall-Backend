const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams to access :matchId from parent
const { verifyToken } = require('../middleware/auth');
const {
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
} = require('../controllers/scoringController');

// GET scorecard (public-ish, no auth needed for spectators)
router.get('/scorecard', getScorecard);

// All scoring actions require authentication
router.post('/initialize', verifyToken, initializeCrease);
router.post('/ball', verifyToken, logBall);
router.post('/set-next-batter', verifyToken, setNextBatter);
router.post('/set-next-bowler', verifyToken, setNextBowler);
router.post('/undo', verifyToken, undoLastBall);
router.post('/substitute', verifyToken, substitutePlayer);
router.post('/end', verifyToken, endMatch);
router.post('/declare-innings', verifyToken, declareInnings);
router.post('/request-umpire', verifyToken, requestUmpire);
router.post('/accept-umpire', verifyToken, acceptUmpire);
router.post('/appoint-umpire', verifyToken, appointUmpire);

module.exports = router;

