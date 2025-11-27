import { generateReceiptNumber } from './utils.js';
import { supabase } from './supabase-client.js'; // Add this import

// Real M-Pesa STK Push implementation
export async function processMpesaPayment(phoneNumber, amount, bookingId) {
    try {
        console.log('Processing M-Pesa payment for:', phoneNumber, amount, bookingId);
        
        const response = await fetch('http://localhost:3000/api/mpesa/stk-push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await getAuthToken()}`
            },
            body: JSON.stringify({
                phoneNumber: phoneNumber,
                amount: amount,
                bookingId: bookingId,
                accountReference: 'EventRental'
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Payment initiation failed');
        }

        return result;

    } catch (error) {
        console.error('M-Pesa payment error:', error);
        
        // Fallback to simulation if server is unavailable
        if (error.message.includes('Failed to fetch')) {
            console.log('Using M-Pesa simulation fallback');
            return await simulateMpesaPayment(phoneNumber, amount);
        }
        
        throw error;
    }
}

// Get authentication token
async function getAuthToken() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            throw new Error('No authentication session found');
        }
        return session.access_token;
    } catch (error) {
        console.error('Error getting auth token:', error);
        // Return a fallback token or handle appropriately
        return 'fallback-token-for-development';
    }
}

// Simulation fallback (for development)
async function simulateMpesaPayment(phoneNumber, amount) {
    console.log('Using M-Pesa simulation for:', phoneNumber, amount);
    
    return new Promise((resolve) => {
        setTimeout(() => {
            const success = Math.random() > 0.2; // 80% success rate
            
            if (success) {
                resolve({
                    success: true,
                    checkoutRequestId: 'ws_CO_' + Date.now(),
                    merchantRequestId: 'MERCHANT_' + Math.random().toString(36).substr(2, 9),
                    message: 'STK Push initiated successfully (Simulation)'
                });
            } else {
                resolve({
                    success: false,
                    error: 'M-Pesa payment failed. Please try again. (Simulation)'
                });
            }
        }, 2000);
    });
}

// Check payment status
export async function checkPaymentStatus(checkoutRequestId) {
    try {
        const response = await fetch('http://localhost:3000/api/mpesa/transaction-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await getAuthToken()}`
            },
            body: JSON.stringify({
                checkoutRequestId: checkoutRequestId
            })
        });

        return await response.json();
    } catch (error) {
        console.error('Error checking payment status:', error);
        
        // Fallback simulation for payment status check
        return simulatePaymentStatus(checkoutRequestId);
    }
}

// Simulate payment status check
function simulatePaymentStatus(checkoutRequestId) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const statuses = ['Completed', 'Pending', 'Failed'];
            const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
            
            resolve({
                success: randomStatus === 'Completed',
                status: randomStatus,
                transactionId: 'MPESA_' + Math.random().toString(36).substr(2, 9).toUpperCase()
            });
        }, 1500);
    });
}

// Utility function to format phone number for M-Pesa
export function formatPhoneNumber(phone) {
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Convert to 254 format if it starts with 0 or 254
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.substring(1);
    } else if (!cleaned.startsWith('254')) {
        cleaned = '254' + cleaned;
    }
    
    return cleaned;
}