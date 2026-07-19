const express = require('express');
const router = express.Router();
const { login, forgotPasswordRequest, forgotPasswordVerify } = require('../controllers/authController');

router.post('/login', login);
router.post('/forgot-password/request', forgotPasswordRequest);
router.post('/forgot-password/verify', forgotPasswordVerify);

module.exports = router;
