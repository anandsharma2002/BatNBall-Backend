const express = require('express');
const router = express.Router();
const { changePassword } = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');

router.put('/change-password', verifyToken, changePassword);

module.exports = router;
