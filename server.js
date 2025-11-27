const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
app.use(cors({
  origin: [
    'https://sunday-uninterrupting-edelmira.ngrok-free.dev',
    'http://localhost:5500', 
    'http://localhost',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5500'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(__dirname));

// Import and register M-Pesa routes
try {
  console.log('Loading M-Pesa routes...');
  
  const stkPushPath = path.join(__dirname, 'api', 'mpesa', 'stk-push.js');
  console.log('STK Push file path:', stkPushPath);
  console.log('File exists:', fs.existsSync(stkPushPath));
  
  if (fs.existsSync(stkPushPath)) {
    const mpesaRoutes = require(stkPushPath);
    
    // Register the routes
    app.post('/api/mpesa/stk-push', mpesaRoutes.stkPush);
    app.post('/api/mpesa/callback', mpesaRoutes.stkCallback);
    
    console.log('M-Pesa routes registered successfully');
  } else {
    throw new Error('STK Push file not found at: ' + stkPushPath);
  }
} catch (error) {
  console.error('Error setting up M-Pesa routes:', error.message);
  
  // Fallback routes
  app.post('/api/mpesa/stk-push', (req, res) => {
    console.log('STK Push fallback called with:', req.body);
    res.status(500).json({
      success: false,
      error: 'M-Pesa routes not properly configured. Check server logs.'
    });
  });
  
  app.post('/api/mpesa/callback', (req, res) => {
    console.log('Callback fallback called with:', req.body);
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    mpesa: 'Check server logs for configuration status'
  });
});

// Test M-Pesa configuration
app.get('/api/mpesa/config', (req, res) => {
  res.json({
    consumerKey: process.env.MPESA_CONSUMER_KEY ? 'Set' : 'Missing',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET ? 'Set' : 'Missing',
    shortcode: process.env.MPESA_SHORTCODE || '174379',
    callbackURL: 'https://sunday-uninterrupting-edelmira.ngrok-free.dev/api/mpesa/callback'
  });
});

// Debug endpoint to test database
app.get('/api/debug/payments', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // Test if we can insert a payment
    const testPayment = {
      checkout_request_id: 'test_' + Date.now(),
      amount: 100,
      status: 'pending',
      phone: '254700000000',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('payments')
      .insert([testPayment])
      .select();

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Database error: ' + error.message,
        details: error
      });
    }

    res.json({
      success: true,
      message: 'Payment created successfully',
      payment: data[0]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
});

// Serve pages
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'auth', 'login.html'));
});

app.get('/user-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'user', 'user-dashboard.html'));
});

app.get('/checkout', (req, res) => {
  res.sendFile(path.join(__dirname, 'checkout.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`M-Pesa STK Push: http://localhost:${PORT}/api/mpesa/stk-push`);
  console.log(`M-Pesa Callback: http://localhost:${PORT}/api/mpesa/callback`);
  console.log(`Check config: http://localhost:${PORT}/api/mpesa/config`);
  console.log(`Debug payments: http://localhost:${PORT}/api/debug/payments`);
});