import { Router } from 'express';
import Joi from 'joi';
import { SosService } from '../services/sos.service.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

const triggerSosSchema = Joi.object({
  booking_id: Joi.string().uuid().allow(null, ''),
  current_lat: Joi.number().min(-90).max(90).required(),
  current_lng: Joi.number().min(-180).max(180).required(),
  alert_type: Joi.string().valid('medical', 'safety', 'accident', 'general').default('safety'),
  details: Joi.string().max(500).allow('', null),
});

const updateSosSchema = Joi.object({
  status: Joi.string().valid('acknowledged', 'resolved').required(),
  notes: Joi.string().max(500).allow('', null),
});

/**
 * Route: POST /api/sos
 * Any passenger or driver triggers an SOS emergency broadcast.
 */
router.post('/', validate(triggerSosSchema), async (req, res, next) => {
  try {
    const alert = await SosService.triggerSos(req.body, req.user.id);

    res.status(201).json({
      success: true,
      message: '🚨 Emergency SOS broadcast registered! Emergency services & admin notified.',
      data: { alert },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: GET /api/sos
 * Admin monitors active/recent SOS alerts.
 */
router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const alerts = await SosService.getActiveAlerts();

    res.json({
      success: true,
      data: { alerts },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: PATCH /api/sos/:id
 * Admin acknowledges or resolves an SOS incident.
 */
router.patch('/:id', requireRole('admin'), validate(updateSosSchema), async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const updated = await SosService.updateAlertStatus(
      req.params.id,
      req.user.id,
      status,
      notes
    );

    res.json({
      success: true,
      message: `SOS alert marked as ${status}`,
      data: { alert: updated },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
