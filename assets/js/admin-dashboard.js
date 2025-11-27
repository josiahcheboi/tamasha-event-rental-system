// routes/adminDashboard.js
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// ✅ Initialize Supabase client (replace with your actual keys)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ✅ Dashboard route
router.get('/admin-dashboard-data', async (req, res) => {
  try {
    // Total bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact' });

    if (bookingsError) throw bookingsError;

    // Total revenue (confirmed payments)
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('amount')
      .eq('status', 'confirmed');

    if (paymentsError) throw paymentsError;

    const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Active rentals
    const { data: rentals, error: rentalsError } = await supabase
      .from('rentals')
      .select('id', { count: 'exact' })
      .eq('status', 'active');

    if (rentalsError) throw rentalsError;

    res.json({
      totalBookings: bookings.length,
      totalRevenue,
      activeRentals: rentals.length
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

module.exports = router;
