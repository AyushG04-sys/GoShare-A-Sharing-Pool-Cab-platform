import { BadRequestError } from '../utils/errors.js';

/**
 * Validates request data against a Joi schema.
 * @param {object} schema Joi schema object
 * @param {'body'|'query'|'params'} [source='body']
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        message: d.message,
        path: d.path,
      }));
      const friendlyMessage = error.details.map((d) => d.message.replace(/\"/g, '')).join('. ');
      return next(new BadRequestError(friendlyMessage || 'Validation error', details));
    }

    req[source] = value;
    next();
  };
}
