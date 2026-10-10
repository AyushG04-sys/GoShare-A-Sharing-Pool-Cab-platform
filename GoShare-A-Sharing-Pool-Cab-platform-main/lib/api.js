const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const COLLECTIONS = new Set(['users', 'drivers', 'bookings', 'sosAlerts']);
const PAGE_SIZE = 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

async function runHandler(res, handler) {
  try {
    await handler();
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    console.error('API request failed:', error);
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
  }

  return {
    url: url.replace(/\/+$/, ''),
    serviceRoleKey
  };
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters.');
  }

  return secret;
}

async function databaseRequest(query, options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const endpoint = new URL(`${url}/rest/v1/app_records`);
  endpoint.search = new URLSearchParams(query).toString();

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...options.headers
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers.Prefer = options.prefer || 'return=representation';
  }

  const response = await fetch(endpoint, {
    method: options.method || 'GET',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  const responseText = await response.text();
  let data = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error('Supabase returned an invalid response.');
    }
  }

  if (!response.ok) {
    if (data?.code === '23505') {
      throw new HttpError(409, 'An account with this phone number already exists.');
    }
    throw new Error(`Supabase request failed with status ${response.status}.`);
  }

  return data;
}

function collectionQuery(collection, extra = {}) {
  if (!COLLECTIONS.has(collection)) {
    throw new Error(`Unsupported data collection: ${collection}`);
  }
  return { collection: `eq.${collection}`, ...extra };
}

async function findAccount(collection, phone) {
  const rows = await databaseRequest(collectionQuery(collection, {
    phone: `eq.${phone}`,
    select: 'id,payload',
    limit: '1'
  }));
  return rows?.[0] || null;
}

async function findRecord(collection, id) {
  const rows = await databaseRequest(collectionQuery(collection, {
    id: `eq.${id}`,
    select: 'id,payload',
    limit: '1'
  }));
  return rows?.[0] || null;
}

async function saveRecord(collection, payload, phone = null, existingId = null) {
  const row = { collection, id: payload.id, phone, payload };
  const result = await databaseRequest(collectionQuery(collection, existingId
    ? { id: `eq.${existingId}`, select: 'id,payload' }
    : { select: 'id,payload' }), {
    method: existingId ? 'PATCH' : 'POST',
    body: existingId ? { phone, payload } : row
  });

  if (!result?.length) {
    throw new HttpError(existingId ? 404 : 500, existingId ? 'Record not found' : 'Failed to save record');
  }

  return result[0].payload;
}

async function listRecords(collection) {
  const records = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await databaseRequest(collectionQuery(collection, {
      select: 'payload',
      order: 'created_at.asc'
    }), {
      headers: {
        'Range-Unit': 'items',
        Range: `${offset}-${offset + PAGE_SIZE - 1}`
      }
    });

    if (!Array.isArray(page)) {
      throw new Error('Supabase returned an invalid record list.');
    }

    records.push(...page.map(row => row.payload));
    if (page.length < PAGE_SIZE) return records;
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') {
    if (Array.isArray(req.body)) throw new HttpError(400, 'Request body must be a JSON object.');
    return req.body;
  }

  let rawBody = '';
  for await (const chunk of req) {
    rawBody += chunk;
    if (rawBody.length > 1024 * 1024) {
      throw new HttpError(413, 'Request body is too large.');
    }
  }

  if (!rawBody) return {};
  try {
    const body = JSON.parse(rawBody);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'Request body must be a JSON object.');
    }
    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function requireMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  sendJson(res, 405, { error: 'Method not allowed' });
  return false;
}

function authenticate(req) {
  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw new HttpError(401, 'Access denied. No token provided.');
  }

  try {
    return jwt.verify(match[1], getJwtSecret());
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, 'Invalid or expired token.');
  }
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${require('crypto').randomBytes(4).toString('hex')}`;
}

async function handleLogin(req, res) {
  await runHandler(res, async () => {
    if (!requireMethod(req, res, 'POST')) return;

    const { phone, name, password, role = 'user', vehicleType, vehicleNumber } = await readBody(req);
    if (typeof phone !== 'string' || !phone.trim() || typeof password !== 'string' || !password) {
      throw new HttpError(400, 'Phone and password are required.');
    }
    if (!['user', 'driver', 'admin'].includes(role)) {
      throw new HttpError(400, 'Invalid account role.');
    }

    const normalizedPhone = phone.trim();
    const collection = role === 'driver' ? 'drivers' : 'users';
    const existing = await findAccount(collection, normalizedPhone);
    let account = existing?.payload;

    if (account) {
      if (account.password) {
        if (!await bcrypt.compare(password, account.password)) {
          throw new HttpError(401, 'Invalid credentials.');
        }
      } else {
        account.password = await bcrypt.hash(password, 10);
      }

      if (typeof name === 'string' && name.trim()) account.name = name.trim();
      if (role === 'driver') {
        if (vehicleType) account.vehicleType = vehicleType;
        if (vehicleNumber) account.vehicleNumber = vehicleNumber;
      }
      account = await saveRecord(collection, account, normalizedPhone, existing.id);
    } else {
      if (role === 'admin') throw new HttpError(401, 'Invalid credentials.');
      if (typeof name !== 'string' || !name.trim()) {
        throw new HttpError(400, 'Name is required for registration.');
      }

      account = {
        id: makeId(role === 'driver' ? 'drv' : 'usr'),
        phone: normalizedPhone,
        name: name.trim(),
        role,
        password: await bcrypt.hash(password, 10)
      };
      if (role === 'driver') {
        account.vehicleType = vehicleType || '';
        account.vehicleNumber = vehicleNumber || '';
      }
      account = await saveRecord(collection, account, normalizedPhone);
    }

    const token = jwt.sign(
      { id: account.id, role: account.role },
      getJwtSecret(),
      { expiresIn: '24h' }
    );
    const { password: _password, ...safeAccount } = account;
    sendJson(res, 200, {
      message: 'Authentication successful',
      token,
      user: safeAccount
    });
  });
}

async function handleBookings(req, res) {
  await runHandler(res, async () => {
    const user = authenticate(req);

    if (req.method === 'GET') {
      const { userId } = req.query || {};
      let bookings = await listRecords('bookings');
      if (userId) {
        bookings = bookings.filter(booking =>
          booking.userId === userId ||
          booking.driverId === userId ||
          booking.driverPhone === userId
        );
      }
      sendJson(res, 200, bookings);
      return;
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const booking = {
        ...body,
        id: makeId('bk'),
        createdAt: Date.now(),
        userId: user.id
      };
      const saved = await saveRecord('bookings', booking);
      sendJson(res, 201, saved);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    sendJson(res, 405, { error: 'Method not allowed' });
  });
}

function getBookingId(req) {
  if (typeof req.query?.id === 'string' && req.query.id) return req.query.id;
  const pathname = new URL(req.url, 'http://localhost').pathname;
  return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
}

async function handleBookingById(req, res) {
  await runHandler(res, async () => {
    authenticate(req);
    const id = getBookingId(req);
    if (!id) throw new HttpError(400, 'Booking ID is required.');

    const record = await findRecord('bookings', id);
    if (!record) throw new HttpError(404, 'Booking not found.');

    if (req.method === 'PATCH') {
      const changes = await readBody(req);
      const { id: _id, createdAt: _createdAt, ...safeChanges } = changes;
      const updated = { ...record.payload, ...safeChanges };
      const saved = await saveRecord('bookings', updated, null, record.id);
      sendJson(res, 200, saved);
      return;
    }

    if (req.method === 'DELETE') {
      await databaseRequest(collectionQuery('bookings', {
        id: `eq.${id}`
      }), { method: 'DELETE', prefer: 'return=minimal' });
      sendJson(res, 200, { message: 'Booking deleted successfully' });
      return;
    }

    res.setHeader('Allow', 'PATCH, DELETE');
    sendJson(res, 405, { error: 'Method not allowed' });
  });
}

async function handleSos(req, res) {
  await runHandler(res, async () => {
    const user = authenticate(req);
    if (!requireMethod(req, res, 'POST')) return;

    const body = await readBody(req);
    const alert = {
      ...body,
      userId: user.id,
      id: makeId('sos'),
      timestamp: Date.now()
    };
    const saved = await saveRecord('sosAlerts', alert);
    sendJson(res, 201, saved);
  });
}

async function handleAdminStats(req, res) {
  await runHandler(res, async () => {
    const user = authenticate(req);
    if (user.role !== 'admin') {
      throw new HttpError(403, 'Access denied. Admin role required.');
    }
    if (!requireMethod(req, res, 'GET')) return;

    const [bookings, drivers, users, sosAlerts] = await Promise.all([
      listRecords('bookings'),
      listRecords('drivers'),
      listRecords('users'),
      listRecords('sosAlerts')
    ]);

    sendJson(res, 200, {
      bookings,
      drivers: drivers.map(({ password: _password, ...driver }) => driver),
      users: users
        .filter(account => account.role !== 'admin')
        .map(({ password: _password, ...account }) => account),
      sosAlerts
    });
  });
}

module.exports = {
  handleAdminStats,
  handleBookingById,
  handleBookings,
  handleLogin,
  handleSos
};
