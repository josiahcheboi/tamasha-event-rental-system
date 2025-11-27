const express = require('express');
const axios = require('axios');
const router = express.Router();
const supabase = require('../config/supabase');

// Callback route — handles M-Pesa payment confirmation
router.post('/callback', async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;
    const checkoutRequestId = callback?.CheckoutRequestID;

    if (!checkoutRequestId) return res.json({ ResultCode: 0, ResultDesc: 'Success' });

    if (callback.ResultCode === 0) {
      const metadata = callback.CallbackMetadata?.Item || [];
      const receipt = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
      const transactionDate = metadata.find(i => i.Name === 'TransactionDate')?.Value;

      const { data: payment, error: findError } = await supabase
        .from('payments')
        .select('booking_id')
        .eq('checkout_request_id', checkoutRequestId)
        .single();

      if (!payment?.booking_id) return res.json({ ResultCode: 0, ResultDesc: 'Success' });

      await supabase
        .from('payments')
        .update({
          status: 'completed',
          receipt_number: receipt,
          transaction_date: transactionDate,
          updated_at: new Date().toISOString()
        })
        .eq('checkout_request_id', checkoutRequestId);

      await supabase
        .from('bookings')
        .update({
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.booking_id);
    } else {
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          failure_reason: callback.ResultDesc,
          updated_at: new Date().toISOString()
        })
        .eq('checkout_request_id', checkoutRequestId);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (error) {
    console.error('Callback error:', error);
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
  }
});

module.exports = router;
