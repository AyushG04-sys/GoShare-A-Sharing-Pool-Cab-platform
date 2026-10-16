import { getSupabaseAdmin } from '../config/supabase.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export class SosService {
  /**
   * Creates a new emergency SOS alert.
   */
  static async triggerSos(data, userId) {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Database client not initialized');

    const {
      booking_id = null,
      current_lat,
      current_lng,
      alert_type = 'safety',
      details = 'Emergency SOS triggered from mobile client',
    } = data;

    // If booking_id provided, verify relationship
    if (booking_id) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, created_by, driver_id')
        .eq('id', booking_id)
        .maybeSingle();

      if (!booking) {
        throw new NotFoundError('Associated booking not found');
      }
    }

    const { data: alert, error } = await supabase
      .from('sos_alerts')
      .insert({
        booking_id,
        user_id: userId,
        current_lat,
        current_lng,
        alert_type,
        details,
        status: 'active',
      })
      .select(`
        *,
        user:profiles!sos_alerts_user_id_fkey(name, phone),
        booking:bookings(id, status, vehicle_category, pickup_label, destination_label)
      `)
      .single();

    if (error) {
      console.error('Error recording SOS alert:', error);
      throw new BadRequestError(error.message);
    }

    return alert;
  }

  /**
   * Admin fetches all active and unresolved SOS alerts.
   */
  static async getActiveAlerts() {
    const supabase = getSupabaseAdmin();
    if (!supabase) return [];

    const { data: alerts, error } = await supabase
      .from('sos_alerts')
      .select(`
        *,
        user:profiles!sos_alerts_user_id_fkey(name, phone, role),
        booking:bookings(
          id,
          status,
          vehicle_category,
          pickup_label,
          destination_label,
          driver:profiles!bookings_driver_id_fkey(name, phone, vehicle_number)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching SOS alerts:', error);
      return [];
    }

    return alerts || [];
  }

  /**
   * Updates status of an SOS alert (acknowledge / resolve).
   */
  static async updateAlertStatus(alertId, adminId, status, notes = '') {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Database client not initialized');

    const updatePayload = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'acknowledged') {
      updatePayload.acknowledged_by = adminId;
      updatePayload.acknowledged_at = new Date().toISOString();
    } else if (status === 'resolved') {
      updatePayload.resolved_by = adminId;
      updatePayload.resolved_at = new Date().toISOString();
      updatePayload.resolution_notes = notes;
    }

    const { data: updated, error } = await supabase
      .from('sos_alerts')
      .update(updatePayload)
      .eq('id', alertId)
      .select()
      .maybeSingle();

    if (error) throw new BadRequestError(error.message);

    return updated;
  }
}
