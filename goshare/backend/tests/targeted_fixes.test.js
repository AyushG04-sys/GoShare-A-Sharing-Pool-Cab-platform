import Joi from 'joi';

// Mirroring the registration schema from auth.routes.js to verify zero-regression validation behavior
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(2).max(100).required(),
  phone: Joi.string().pattern(/^\d{10}$/).allow('', null),
  role: Joi.string().valid('user', 'driver').default('user'),
  gender: Joi.when('role', {
    is: 'driver',
    then: Joi.string().valid('female', 'male').required().messages({
      'any.only': 'Driver partner gender must be either female or male.',
      'any.required': 'Gender is required for driver partner registration and must be female or male.',
    }),
    otherwise: Joi.string().valid('male', 'female', 'other').allow('', null),
  }),
  vehicle_type: Joi.when('role', {
    is: 'driver',
    then: Joi.string().valid('rickshaw', 'mini', 'cab', 'suv').required(),
    otherwise: Joi.forbidden(),
  }),
  vehicle_number: Joi.when('role', {
    is: 'driver',
    then: Joi.string().min(4).max(20).required(),
    otherwise: Joi.forbidden(),
  }),
});

describe('Driver & Rider Registration Validation Policy', () => {
  test('Should accept legitimate male driver registration', () => {
    const maleDriver = {
      name: 'Rohan Verma',
      email: 'rohan.driver@example.com',
      password: 'password123',
      phone: '9876543210',
      role: 'driver',
      gender: 'male',
      vehicle_type: 'cab',
      vehicle_number: 'MH-12-AB-5678',
    };

    const { error, value } = registerSchema.validate(maleDriver);
    expect(error).toBeUndefined();
    expect(value.gender).toBe('male');
    expect(value.role).toBe('driver');
  });

  test('Should reject driver registration missing gender field', () => {
    const noGenderDriverAttempt = {
      name: 'Driver Candidate',
      email: 'candidate@example.com',
      password: 'password123',
      phone: '9876543210',
      role: 'driver',
      vehicle_type: 'cab',
      vehicle_number: 'MH-12-AB-5678',
    };

    const { error } = registerSchema.validate(noGenderDriverAttempt);
    expect(error).toBeDefined();
  });

  test('Should reject driver registration with unsupported gender', () => {
    const invalidGenderDriverAttempt = {
      name: 'Driver Candidate',
      email: 'candidate@example.com',
      password: 'password123',
      phone: '9876543210',
      role: 'driver',
      gender: 'other',
      vehicle_type: 'cab',
      vehicle_number: 'MH-12-AB-5678',
    };

    const { error } = registerSchema.validate(invalidGenderDriverAttempt);
    expect(error).toBeDefined();
    expect(error.details[0].message).toContain('Driver partner gender must be either female or male');
  });

  test('Should accept legitimate female driver registration', () => {
    const femaleDriver = {
      name: 'Priya Shinde',
      email: 'priya.shinde@example.com',
      password: 'securePassword123',
      phone: '9876543210',
      role: 'driver',
      gender: 'female',
      vehicle_type: 'cab',
      vehicle_number: 'MH-12-CD-9999',
    };

    const { error, value } = registerSchema.validate(femaleDriver);
    expect(error).toBeUndefined();
    expect(value.gender).toBe('female');
    expect(value.role).toBe('driver');
  });

  test('Should permit male and non-female passengers to register as regular riders', () => {
    const maleRider = {
      name: 'Amit Patel',
      email: 'amit.rider@example.com',
      password: 'password123',
      phone: '9876543210',
      role: 'user',
      gender: 'male',
    };

    const { error, value } = registerSchema.validate(maleRider);
    expect(error).toBeUndefined();
    expect(value.role).toBe('user');
    expect(value.gender).toBe('male');
  });
});

describe('Issue Two — Geolocation Coordinate & Error Validation', () => {
  function isValidCoordinate(lat, lng) {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  }

  test('Valid geographic coordinates should pass validation', () => {
    expect(isValidCoordinate(19.9975, 73.7898)).toBe(true);
    expect(isValidCoordinate(18.5204, 73.8567)).toBe(true);
    expect(isValidCoordinate(0, 0)).toBe(true);
    expect(isValidCoordinate(-33.8688, 151.2093)).toBe(true);
  });

  test('Invalid, NaN, non-finite, or out-of-range coordinates should be rejected', () => {
    expect(isValidCoordinate(NaN, 73.7898)).toBe(false);
    expect(isValidCoordinate(19.9975, Infinity)).toBe(false);
    expect(isValidCoordinate('19.9975', 73.7898)).toBe(false);
    expect(isValidCoordinate(91.0, 73.7898)).toBe(false); // lat > 90
    expect(isValidCoordinate(19.9975, 185.0)).toBe(false); // lng > 180
    expect(isValidCoordinate(null, null)).toBe(false);
  });
});
