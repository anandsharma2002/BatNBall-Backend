const express = require('express');
const router = express.Router();
const { createUser } = require('../controllers/adminController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.post('/users/create', verifyToken, requireRole('SUPER_ADMIN'), createUser);

module.exports = router;
