const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Access Denied: No Token Provided' });
  }

  // Token is expected in format "Bearer <token>"
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified; // verified contains userId, role, associatedPlayerId
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Access Denied: Invalid or Expired Token' });
  }
};

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Access Denied: No Role Profile Found' });
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access Denied: Insufficient Permissions' });
    }

    next();
  };
};

module.exports = {
  verifyToken,
  requireRole
};
