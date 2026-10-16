import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

/**
 * Role-based authorization middleware.
 * @param {string|string[]} allowedRoles
 */
export function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.profile) {
      return next(new UnauthorizedError('User authentication profile not found'));
    }

    if (!roles.includes(req.profile.role)) {
      return next(
        new ForbiddenError(
          `Access denied. Requires one of [${roles.join(', ')}], but your role is '${req.profile.role}'`
        )
      );
    }

    next();
  };
}
