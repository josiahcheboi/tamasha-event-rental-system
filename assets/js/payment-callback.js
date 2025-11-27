import { supabase } from './supabase-client.js';
import { formatCurrency, formatDate } from './utils.js';

document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const receipt = urlParams.get('receipt');
    const amount = urlParams.get('amount');
    
    showCallbackMessage(status, receipt, amount);
    setupCallbackButtons();
});

function showCallbackMessage(status, receipt, amount) {
    const successDiv = document.getElementById('successCallback');
    const errorDiv = document.getElementById('errorCallback');
    const processingDiv = document.getElementById('processingCallback');
    
    // Hide all first
    successDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    processingDiv.style.display = 'none';
    
    if (status === 'success') {
        successDiv.style.display = 'block';
        document.getElementById('receiptNumber').textContent = receipt || 'N/A';
        document.getElementById('paymentAmount').textContent = formatCurrency(parseFloat(amount) || 0);
        document.getElementById('paymentDate').textContent = formatDate(new Date());
    } else if (status === 'error') {
        errorDiv.style.display = 'block';
        const errorMessage = getErrorMessage(receipt);
        document.getElementById('errorMessageText').textContent = errorMessage;
    } else {
        processingDiv.style.display = 'block';
        // Simulate processing completion after 3 seconds
        setTimeout(() => {
            showCallbackMessage('success', 'RCP' + Date.now(), amount);
        }, 3000);
    }
}

function getErrorMessage(errorCode) {
    const errors = {
        'insufficient_funds': 'Insufficient funds in your M-Pesa account.',
        'timeout': 'Payment request timed out. Please try again.',
        'cancelled': 'Payment was cancelled.',
        'invalid_number': 'Invalid phone number provided.',
        'default': 'There was an error processing your payment. Please try again.'
    };
    
    return errors[errorCode] || errors.default;
}

function setupCallbackButtons() {
    document.getElementById('goToBookingsBtn').addEventListener('click', () => {
        window.location.href = 'user-dashboard.html?page=bookings';
    });
    
    document.getElementById('goToDashboardBtn').addEventListener('click', () => {
        window.location.href = 'user-dashboard.html';
    });
    
    document.getElementById('retryPaymentBtn').addEventListener('click', () => {
        window.location.href = 'checkout.html';
    });
    
    document.getElementById('goBackBtn').addEventListener('click', () => {
        window.history.back();
    });
}