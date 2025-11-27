const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY);

const config = {
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  shortcode: process.env.MPESA_SHORTCODE || '174379',
  passkey: process.env.MPESA_PASSKEY,
  callbackUrl: process.env.MPESA_CALLBACK_URL
};

async function getAccessToken() {
  const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  const response = await axios.get(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return response.data.access_token;
}

function getTimestamp() {
  const d = new Date();
  return d.getFullYear() +
    ("0" + (d.getMonth() + 1)).slice(-2) +
    ("0" + d.getDate()).slice(-2) +
    ("0" + d.getHours()).slice(-2) +
    ("0" + d.getMinutes()).slice(-2) +
    ("0" + d.getSeconds()).slice(-2);
}

function generatePassword() {
  const timestamp = getTimestamp();
  const password = Buffer.from(config.shortcode + config.passkey + timestamp).toString('base64');
  return { password, timestamp };
}

async function stkPush(req, res) {
  try {
    const { phone, amount, bookingId } = req.body;
    const accessToken = await getAccessToken();
    const { password, timestamp } = generatePassword();

    const cleanedPhone = phone.replace(/\D/g, '');
    const stkPayload = {
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: cleanedPhone,
      PartyB: config.shortcode,
      PhoneNumber: cleanedPhone,
      CallBackURL: config.callbackUrl,
      AccountReference: bookingId,
      TransactionDesc: 'Event Equipment Rental'
    };

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      stkPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.ResponseCode === '0') {
      await supabase.from('payments').insert([{
        booking_id: bookingId,
        amount: Math.round(amount),
        phone: cleanedPhone,
        checkout_request_id: response.data.CheckoutRequestID,
        merchant_request_id: response.data.MerchantRequestID,
        status: 'pending',
        payment_method: 'mpesa',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]);
    }

    res.json({
      success: true,
      checkoutRequestID: response.data.CheckoutRequestID,
      merchantRequestID: response.data.MerchantRequestID
    });
  } catch (error) {
    console.error('STK Push error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = { stkPush };
