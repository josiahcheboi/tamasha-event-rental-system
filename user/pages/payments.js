// payments.js - USER VERSION
import { supabase } from "../../assets/js/supabase-client.js";
import { formatDate, formatCurrency } from "../../assets/js/utils.js";

let currentUser = null;
let allPayments = [];

document.addEventListener("DOMContentLoaded", async () => {
    await checkAuth();
    await loadPayments();
    setupEventListeners();
});

async function checkAuth() {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session?.user) {
        window.location.href = "/auth/login.html";
        return;
    }
    
    currentUser = session.user;
    console.log('Current user:', currentUser.id);
}

async function loadPayments() {
    showLoading();
    
    try {
        console.log('Loading payments for user:', currentUser.id);
        
        // First get user's bookings
        const { data: userBookings, error: bookingsError } = await supabase
            .from("bookings")
            .select("id")
            .eq("user_id", currentUser.id);

        console.log('User bookings:', userBookings);

        if (!userBookings || userBookings.length === 0) {
            console.log('No bookings found for user');
            allPayments = [];
            displayPayments(allPayments);
            updateStats(allPayments);
            return;
        }

        // Get payments for these bookings
        const bookingIds = userBookings.map(b => b.id);
        const { data: payments, error: paymentsError } = await supabase
            .from("payments")
            .select(`
                *,
                bookings (
                    id,
                    customer_name,
                    start_date,
                    end_date,
                    items_json,
                    total_price
                )
            `)
            .in("booking_id", bookingIds)
            .order("created_at", { ascending: false });

        console.log('Payments found:', payments);
        
        allPayments = payments || [];
        displayPayments(allPayments);
        updateStats(allPayments);
        
    } catch (error) {
        console.error("Error loading payments:", error);
        showError("Failed to load payments: " + error.message);
    }
}

function displayPayments(payments) {
    const tableBody = document.getElementById("paymentsTableBody");
    const noPayments = document.getElementById("noPayments");
    
    if (!payments || payments.length === 0) {
        tableBody.innerHTML = '';
        noPayments.style.display = 'block';
        return;
    }
    
    noPayments.style.display = 'none';
    
    tableBody.innerHTML = payments.map(payment => {
        const booking = payment.bookings || {};
        return `
        <tr>
            <td class="receipt-number">${payment.receipt_number || 'N/A'}</td>
            <td class="booking-id">#${getShortId(payment.booking_id)}</td>
            <td class="amount">${formatCurrency(payment.amount || 0)}</td>
            <td>
                <span class="method-badge method-${payment.payment_method}">
                    ${formatPaymentMethod(payment.payment_method)}
                </span>
            </td>
            <td>${formatDate(payment.created_at)}</td>
            <td>
                <span class="status-badge status-${payment.status}">
                    ${formatPaymentStatus(payment.status)}
                </span>
            </td>
            <td class="actions">
                <button class="btn-view" onclick="viewPaymentDetails('${payment.id}')">
                    View Details
                </button>
                ${payment.status === 'pending' ? `
                    <button class="btn-retry" onclick="retryPayment('${payment.id}')">
                        Retry Payment
                    </button>
                ` : ''}
                ${payment.status === 'completed' ? `
                    <button class="btn-receipt" onclick="downloadReceipt('${payment.id}')">
                        Download Receipt
                    </button>
                ` : ''}
            </td>
        </tr>
        `;
    }).join('');
}

function getShortId(id) {
    if (!id) return 'N/A';
    return id.substring(0, 8).toUpperCase();
}

function formatPaymentMethod(method) {
    if (!method) return 'Unknown';
    
    const methodMap = {
        'mpesa': 'M-Pesa',
        'card': 'Credit Card',
        'cash': 'Cash'
    };
    
    return methodMap[method] || method.charAt(0).toUpperCase() + method.slice(1);
}

function formatPaymentStatus(status) {
    if (!status) return 'Unknown';
    
    const statusMap = {
        'completed': 'Completed',
        'pending': 'Pending',
        'failed': 'Failed',
        'refunded': 'Refunded'
    };
    
    return statusMap[status] || status.charAt(0).toUpperCase() + status.slice(1);
}

function updateStats(payments) {
    const total = payments.length;
    const completed = payments.filter(p => p.status === 'completed').length;
    const pending = payments.filter(p => p.status === 'pending').length;
    const totalAmount = payments
        .filter(p => p.status === 'completed')
        .reduce((sum, payment) => sum + (payment.amount || 0), 0);
    
    document.getElementById('totalPayments').textContent = total;
    document.getElementById('totalAmount').textContent = formatCurrency(totalAmount);
    document.getElementById('completedPayments').textContent = completed;
    document.getElementById('pendingPayments').textContent = pending;
}

function setupEventListeners() {
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = '/user/user-dashboard.html';
    });
    
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadPayments();
    });
    
    document.getElementById('statusFilter').addEventListener('change', filterPayments);
    document.getElementById('methodFilter').addEventListener('change', filterPayments);
}

function filterPayments() {
    const statusFilter = document.getElementById('statusFilter').value;
    const methodFilter = document.getElementById('methodFilter').value;
    
    let filtered = [...allPayments];
    
    if (statusFilter !== 'all') {
        filtered = filtered.filter(payment => payment.status === statusFilter);
    }
    
    if (methodFilter !== 'all') {
        filtered = filtered.filter(payment => payment.payment_method === methodFilter);
    }
    
    displayPayments(filtered);
}

function showLoading() {
    const tableBody = document.getElementById("paymentsTableBody");
    tableBody.innerHTML = `
        <tr>
            <td colspan="7" class="loading-cell">Loading payments...</td>
        </tr>
    `;
}

function showError(message) {
    document.getElementById('errorText').textContent = message;
    document.getElementById('errorMessage').style.display = 'block';
}

window.viewPaymentDetails = async function(paymentId) {
    try {
        const { data: payment, error } = await supabase
            .from('payments')
            .select(`
                *,
                bookings (
                    customer_name,
                    customer_email,
                    customer_phone,
                    start_date,
                    end_date,
                    items_json,
                    total_price
                )
            `)
            .eq('id', paymentId)
            .single();

        if (error) throw error;

        if (payment) {
            showPaymentModal(payment);
        }
    } catch (error) {
        console.error('Error fetching payment details:', error);
        alert('Failed to load payment details.');
    }
};

function showPaymentModal(payment) {
    const modalHtml = `
        <div class="modal-overlay" id="paymentModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Payment Details</h3>
                    <button class="modal-close" onclick="closePaymentModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="payment-details-grid">
                        <div class="detail-item">
                            <label>Receipt Number:</label>
                            <span>${payment.receipt_number || 'N/A'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Amount:</label>
                            <span class="amount">${formatCurrency(payment.amount)}</span>
                        </div>
                        <div class="detail-item">
                            <label>Status:</label>
                            <span class="status-badge status-${payment.status}">${formatPaymentStatus(payment.status)}</span>
                        </div>
                        <div class="detail-item">
                            <label>Payment Method:</label>
                            <span>${formatPaymentMethod(payment.payment_method)}</span>
                        </div>
                        <div class="detail-item">
                            <label>Date:</label>
                            <span>${formatDate(payment.created_at)}</span>
                        </div>
                        ${payment.mpesa_checkout_id ? `
                            <div class="detail-item">
                                <label>M-Pesa Checkout ID:</label>
                                <span>${payment.mpesa_checkout_id}</span>
                            </div>
                        ` : ''}
                    </div>
                    ${payment.bookings ? `
                    <div class="booking-details" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
                        <h4>Booking Information</h4>
                        <div class="payment-details-grid">
                            <div class="detail-item">
                                <label>Customer:</label>
                                <span>${payment.bookings.customer_name || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Dates:</label>
                                <span>${formatDate(payment.bookings.start_date)} - ${formatDate(payment.bookings.end_date)}</span>
                            </div>
                            <div class="detail-item">
                                <label>Total Price:</label>
                                <span>${formatCurrency(payment.bookings.total_price || 0)}</span>
                            </div>
                        </div>
                    </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn-close" onclick="closePaymentModal()">Close</button>
                </div>
            </div>
        </div>
    `;

    const existingModal = document.getElementById('paymentModal');
    if (existingModal) existingModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    addModalStyles();
}

function addModalStyles() {
    if (document.getElementById('modal-styles')) return;

    const styles = `
        <style id="modal-styles">
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
            }
            .modal-content {
                background: white;
                border-radius: 8px;
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
            }
            .modal-header {
                padding: 20px;
                border-bottom: 1px solid #ecf0f1;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .modal-header h3 {
                margin: 0;
                color: #2c3e50;
            }
            .modal-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #7f8c8d;
            }
            .modal-body {
                padding: 20px;
            }
            .modal-footer {
                padding: 20px;
                border-top: 1px solid #ecf0f1;
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            }
            .payment-details-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
            }
            .detail-item {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            .detail-item label {
                font-weight: 600;
                color: #7f8c8d;
                font-size: 12px;
            }
            .btn-close {
                padding: 10px 20px;
                background: #3498db;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            .booking-details h4 {
                margin: 0 0 15px 0;
                color: #2c3e50;
            }
        </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
}

window.closePaymentModal = function() {
    const modal = document.getElementById('paymentModal');
    if (modal) modal.remove();
};

window.retryPayment = async function(paymentId) {
    if (!confirm('Retry this payment?')) return;
    alert('Payment retry would be implemented here.');
};

window.downloadReceipt = function(paymentId) {
    alert(`Receipt download for: ${paymentId}`);
};

// Debug function
window.debugPayments = async function() {
    console.log('=== PAYMENTS DEBUG INFO ===');
    console.log('Current user ID:', currentUser?.id);
    
    const { data: allPayments, error } = await supabase
        .from('payments')
        .select('*')
        .limit(10);
    
    console.log('All payments in database:', allPayments);
    
    const { data: userBookings } = await supabase
        .from('bookings')
        .select('id, user_id, created_at')
        .eq('user_id', currentUser.id)
        .limit(5);
    
    console.log('User bookings:', userBookings);
    
    alert('Check console for debug information');
};