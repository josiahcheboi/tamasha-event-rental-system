const express = require('express');
const supabase = require('../config/supabase.js'); // centralized supabase client

const router = express.Router();

// Webhook signature verification
const verifyWebhookSignature = (req) => {
  const signature = req.headers['supabase-signature'];
  const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;

  // In production, verify the webhook signature properly
  // For now, always return true (development mode)
  return true;
};

// Handle Supabase webhooks for real-time updates
router.post('/supabase', async (req, res) => {
  try {
    if (!verifyWebhookSignature(req)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const { type, table, record, old_record } = req.body;
    console.log(`Webhook received: ${type} on ${table}`);

    switch (table) {
      case 'payments':
        await handlePaymentWebhook(type, record, old_record);
        break;

      case 'bookings':
        await handleBookingWebhook(type, record, old_record);
        break;

      case 'rental_items':
        await handleInventoryWebhook(type, record, old_record);
        break;

      default:
        console.log(`Unhandled webhook for table: ${table}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Payment webhook handler
async function handlePaymentWebhook(type, record, oldRecord) {
  try {
    switch (type) {
      case 'INSERT':
        console.log(`New payment created: ${record.receipt_number}`);
        await sendPaymentNotification(record);
        break;

      case 'UPDATE':
        if (record.status !== oldRecord.status) {
          console.log(`Payment status changed: ${oldRecord.status} -> ${record.status}`);
          await sendPaymentStatusUpdate(record);
        }
        break;
    }
  } catch (error) {
    console.error('Payment webhook error:', error);
  }
}

// Booking webhook handler
async function handleBookingWebhook(type, record, oldRecord) {
  try {
    switch (type) {
      case 'INSERT':
        console.log(`New booking created for: ${record.customer_name}`);
        break;

      case 'UPDATE':
        if (record.status !== oldRecord.status) {
          console.log(`Booking status changed: ${oldRecord.status} -> ${record.status}`);
          await sendBookingStatusUpdate(record);
        }
        break;
    }
  } catch (error) {
    console.error('Booking webhook error:', error);
  }
}

// Inventory webhook handler
async function handleInventoryWebhook(type, record, oldRecord) {
  try {
    if (type === 'UPDATE' && record.quantity !== oldRecord.quantity) {
      console.log(`Inventory updated: ${record.name} - ${oldRecord.quantity} -> ${record.quantity}`);

      if (record.quantity < 5) {
        await sendLowStockAlert(record);
      }
    }
  } catch (error) {
    console.error('Inventory webhook error:', error);
  }
}

// Notification stubs
async function sendPaymentNotification(payment) {
  console.log(`Sending payment confirmation for receipt: ${payment.receipt_number}`);
}

async function sendPaymentStatusUpdate(payment) {
  console.log(`Sending payment status update: ${payment.receipt_number} - ${payment.status}`);
}

async function sendBookingStatusUpdate(booking) {
  console.log(`Sending booking status update: ${booking.id} - ${booking.status}`);
}

async function sendLowStockAlert(item) {
  console.log(`Sending low stock alert: ${item.name} - ${item.quantity} remaining`);
}

// Simple test endpoint
router.get('/test', (req, res) => {
  res.json({
    message: 'Webhooks route is working',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
