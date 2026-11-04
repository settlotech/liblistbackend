/**
 * Role-based access guard middleware factory.
 * Usage: router.post('/some-route', roleGuard(['manager', 'admin']), controller)
 *
 * Reads user_role from:
 *   - req.body.user_role (JSON body)
 *   - req.query.user_role (query string)
 *   - req.headers['x-user-role'] (custom header)
 *
 * Allowed role_type values: 'manager', 'employee', 'admin'
 */
function roleGuard(allowedRoles = []) {
  return (req, res, next) => {
    const userRole =
      req.body?.user_role ||
      req.query?.user_role ||
      req.headers['x-user-role'] ||
      'employee';

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${userRole}`
      });
    }

    // Attach to req for downstream use
    req.userRole = userRole;
    next();
  };
}

module.exports = { roleGuard };

