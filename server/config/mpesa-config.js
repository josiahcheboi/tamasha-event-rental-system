require('dotenv').config();

const mpesaConfig = {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortcode: process.env.MPESA_SHORTCODE,
    passkey: process.env.MPESA_PASSKEY,
    callbackUrl: process.env.MPESA_CALLBACK_URL,
    environment: process.env.MPESA_ENVIRONMENT || 'sandbox'
};

// M-Pesa API URLs
const mpesaUrls = {
    auth: mpesaConfig.environment === 'production' 
        ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
        : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    
    stkPush: mpesaConfig.environment === 'production'
        ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
        : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
    
    transactionStatus: mpesaConfig.environment === 'production'
        ? 'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query'
        : 'https://sandbox.safaricom.co.ke/mpesa/transactionstatus/v1/query'
};

// Generate password for STK Push - FIXED TIMESTAMP
function generatePassword() {
    // Create timestamp in YYYYMMDDHHmmss format (Kenya time)
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
    
    const password = Buffer.from(`${mpesaConfig.shortcode}${mpesaConfig.passkey}${timestamp}`).toString('base64');
    return { password, timestamp };
}

// Format phone number for M-Pesa
function formatPhoneNumber(phone) {
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Convert to 254 format if it starts with 0 or 7
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('7')) {
        cleaned = '254' + cleaned;
    }
    
    return cleaned;
}

module.exports = {
    mpesaConfig,
    mpesaUrls,
    generatePassword,
    formatPhoneNumber
};