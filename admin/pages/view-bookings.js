import { supabase } from "../../assets/js/supabase-client.js";
import { formatDate, formatCurrency } from "../../assets/js/utils.js";

let allBookings = [];
let currentFilter = 'all';
let currentDateFilter = 'all';
let currentSearch = '';

document.addEventListener("DOMContentLoaded", async () => {
    await checkAdminAuth();
    await loadBookings();
    setupEventListeners();
});

async function checkAdminAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = '/auth/admin-login.html';
        return;
    }
}

async function loadBookings() {
    showLoading();
    
    try {
        console.log("Loading bookings from Supabase...");
        
        const { data: bookings, error } = await supabase
            .from("bookings")
            .select(`
                *,
                booking_items (
                    rental_items (
                        name,
                        price
                    )
                ),
                payments (
                    id,
                    receipt_number,
                    payment_method,
                    status,
                    amount,
                    created_at,
                    mpesa_checkout_id,
                    merchant_request_id,
                    mpesa_phone,
                    mpesa_amount,
                    mpesa_transaction_date,
                    checkout_request_id
                )
            `)
            .order("created_at", { ascending: false });

        if (error) throw error;

        console.log("Bookings loaded:", bookings);
        allBookings = bookings || [];
        applyFilters();
        
    } catch (error) {
        console.error("Error loading bookings:", error);
        showError("Failed to load bookings: " + error.message);
    }
}

function displayBookings(bookings) {
    const tableBody = document.getElementById("bookingsTableBody");
    const noBookings = document.getElementById("noBookings");
    
    if (!bookings || bookings.length === 0) {
        tableBody.innerHTML = '';
        noBookings.style.display = 'block';
        updateStats([]);
        return;
    }
    
    noBookings.style.display = 'none';
    
    tableBody.innerHTML = bookings.map(booking => {
        // Find the latest payment for this booking
        const latestPayment = booking.payments && booking.payments.length > 0 
            ? booking.payments[booking.payments.length - 1] 
            : null;
        
        // Determine booking status based on payment status
        let displayStatus = booking.status;
        if (latestPayment && latestPayment.status === 'completed' && booking.status === 'pending') {
            displayStatus = 'confirmed';
        }
        
        return `
        <tr>
            <td class="booking-id">#${booking.id.substring(0, 8).toUpperCase()}</td>
            <td>${booking.customer_name || 'N/A'}</td>
            <td>${booking.customer_phone || 'N/A'}</td>
            <td>${formatDate(booking.start_date)}</td>
            <td>${formatDate(booking.end_date)}</td>
            <td>
                <span class="status-badge status-${displayStatus}">
                    ${displayStatus}
                </span>
                ${latestPayment && latestPayment.status === 'completed' ? ' ✅' : ''}
            </td>
            <td class="actions">
                <button class="btn-view" onclick="viewBookingDetails('${booking.id}')">
                    View Details
                </button>
                ${displayStatus === 'active' ? `
                    <button class="btn-complete" onclick="completeBooking('${booking.id}')">
                        Complete
                    </button>
                ` : ''}
            </td>
        </tr>
        `;
    }).join('');
    
    updateStats(bookings);
}

function updateStats(bookings) {
    const total = bookings.length;
    const active = bookings.filter(b => b.status === 'active').length;
    const completed = bookings.filter(b => b.status === 'completed').length;
    
    // Count confirmed bookings (paid but not yet active)
    const confirmed = bookings.filter(booking => {
        const latestPayment = booking.payments && booking.payments.length > 0 
            ? booking.payments[booking.payments.length - 1] 
            : null;
        return (booking.status === 'pending' && latestPayment && latestPayment.status === 'completed') || 
               booking.status === 'confirmed';
    }).length;
    
    // Calculate revenue from completed payments only
    const revenue = bookings.reduce((sum, booking) => {
        if (booking.payments && booking.payments.length > 0) {
            const completedPayment = booking.payments.find(p => p.status === 'completed');
            if (completedPayment) {
                return sum + (completedPayment.amount || 0);
            }
        }
        return sum;
    }, 0);
    
    document.getElementById('totalBookings').textContent = total;
    document.getElementById('activeBookings').textContent = active;
    document.getElementById('pendingBookings').textContent = confirmed;
    document.getElementById('totalRevenue').textContent = `KES ${revenue.toLocaleString()}`;
}

function setupEventListeners() {
    document.getElementById('dashboardBtn').addEventListener('click', () => {
        window.location.href = '/admin/admin-dashboard.html';
    });
    
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadBookings();
    });
    
    document.getElementById('exportBtn').addEventListener('click', exportBookings);
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    
    document.getElementById('statusFilter').addEventListener('change', (e) => {
        currentFilter = e.target.value;
        applyFilters();
    });
    
    document.getElementById('dateFilter').addEventListener('change', (e) => {
        currentDateFilter = e.target.value;
        applyFilters();
    });
}

function performSearch() {
    currentSearch = document.getElementById('searchInput').value.toLowerCase();
    applyFilters();
}

function applyFilters() {
    let filtered = [...allBookings];
    
    if (currentFilter !== 'all') {
        filtered = filtered.filter(booking => {
            if (currentFilter === 'confirmed') {
                // For confirmed filter, show bookings with completed payments
                const latestPayment = booking.payments && booking.payments.length > 0 
                    ? booking.payments[booking.payments.length - 1] 
                    : null;
                return (booking.status === 'pending' && latestPayment && latestPayment.status === 'completed') || 
                       booking.status === 'confirmed';
            }
            return booking.status === currentFilter;
        });
    }
    
    if (currentDateFilter !== 'all') {
        const now = new Date();
        filtered = filtered.filter(booking => {
            const bookingDate = new Date(booking.created_at);
            switch(currentDateFilter) {
                case 'today':
                    return bookingDate.toDateString() === now.toDateString();
                case 'week':
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    return bookingDate >= weekAgo;
                case 'month':
                    return bookingDate.getMonth() === now.getMonth() && 
                           bookingDate.getFullYear() === now.getFullYear();
                case 'year':
                    return bookingDate.getFullYear() === now.getFullYear();
                default:
                    return true;
            }
        });
    }
    
    if (currentSearch) {
        filtered = filtered.filter(booking => 
            (booking.customer_name?.toLowerCase().includes(currentSearch)) ||
            (booking.customer_phone?.includes(currentSearch)) ||
            (booking.id.toLowerCase().includes(currentSearch))
        );
    }
    
    displayBookings(filtered);
}

function showLoading() {
    const tableBody = document.getElementById("bookingsTableBody");
    tableBody.innerHTML = `
        <tr>
            <td colspan="7" class="loading-cell">Loading bookings...</td>
        </tr>
    `;
}

function showError(message) {
    alert(message);
}

window.viewBookingDetails = async function(bookingId) {
    try {
        const { data: booking, error } = await supabase
            .from('bookings')
            .select(`
                *,
                booking_items (
                    quantity,
                    price,
                    rental_items (
                        name,
                        description
                    )
                ),
                payments (
                    id,
                    receipt_number,
                    payment_method,
                    status,
                    amount,
                    created_at,
                    mpesa_checkout_id,
                    merchant_request_id,
                    mpesa_phone,
                    mpesa_amount,
                    mpesa_transaction_date,
                    checkout_request_id
                )
            `)
            .eq('id', bookingId)
            .single();

        if (error) throw error;

        if (booking) {
            showBookingModal(booking);
        } else {
            alert('Booking details not found.');
        }
    } catch (error) {
        console.error('Error fetching booking details:', error);
        alert('Failed to load booking details: ' + error.message);
    }
};

function showBookingModal(booking) {
    const rentalDays = Math.ceil((new Date(booking.end_date) - new Date(booking.start_date)) / (1000 * 60 * 60 * 24));
    const totalAmount = booking.total_price || booking.total_amount || 0;
    
    console.log("Booking data:", booking);
    console.log("Payments data:", booking.payments);
    
    // Find completed payments
    const completedPayments = booking.payments ? booking.payments.filter(p => p.status === 'completed') : [];
    const pendingPayments = booking.payments ? booking.payments.filter(p => p.status === 'pending') : [];
    
    const modalHtml = `
        <div class="modal-overlay" id="bookingModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Booking Details - #${booking.id.substring(0, 8).toUpperCase()}</h3>
                    <button class="modal-close" onclick="closeBookingModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="booking-details-grid">
                        <div class="detail-section">
                            <h4>Booking Information</h4>
                            <div class="detail-item">
                                <label>Status:</label>
                                <span class="status-badge status-${booking.status}">
                                    ${booking.status}
                                    ${completedPayments.length > 0 ? ' (Paid)' : ''}
                                </span>
                            </div>
                            <div class="detail-item">
                                <label>Booking Period:</label>
                                <span>${formatDate(booking.start_date)} to ${formatDate(booking.end_date)} (${rentalDays} days)</span>
                            </div>
                            <div class="detail-item">
                                <label>Created:</label>
                                <span>${formatDate(booking.created_at)}</span>
                            </div>
                            <div class="detail-item">
                                <label>User ID:</label>
                                <span class="user-id">${booking.user_id || 'Guest'}</span>
                            </div>
                        </div>

                        <div class="detail-section">
                            <h4>Customer Information</h4>
                            <div class="detail-item">
                                <label>Name:</label>
                                <span>${booking.customer_name || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Email:</label>
                                <span>${booking.customer_email || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Phone:</label>
                                <span>${booking.customer_phone || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Address:</label>
                                <span>${booking.customer_address || 'N/A'}</span>
                            </div>
                        </div>

                        <div class="detail-section full-width">
                            <h4>Rental Items</h4>
                            <div class="items-table-container">
                                <table class="items-table">
                                    <thead>
                                        <tr>
                                            <th>Item Name</th>
                                            <th>Quantity</th>
                                            <th>Price per Day</th>
                                            <th>Subtotal per Day</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${getBookingItemsTable(booking.booking_items, booking.items_json)}
                                    </tbody>
                                    <tfoot>
                                        <tr class="total-row">
                                            <td colspan="3" class="total-label">Daily Total:</td>
                                            <td class="total-amount">${formatCurrency(calculateDailyTotal(booking.booking_items, booking.items_json))}</td>
                                        </tr>
                                        <tr class="total-row">
                                            <td colspan="3" class="total-label">Total Amount (${rentalDays} days):</td>
                                            <td class="total-amount grand-total">${formatCurrency(totalAmount)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        ${booking.payments && booking.payments.length > 0 ? `
                        <div class="detail-section full-width">
                            <h4>Payment Information</h4>
                            <div class="payment-details">
                                ${booking.payments.map(payment => `
                                    <div class="payment-item" style="border-left: 4px solid ${payment.status === 'completed' ? '#27ae60' : '#f39c12'};">
                                        <div class="payment-row">
                                            <span class="payment-label">Status:</span>
                                            <span class="status-badge status-${payment.status}">
                                                ${payment.status === 'completed' ? '✅ PAID' : '⏳ PENDING'}
                                            </span>
                                        </div>
                                        <div class="payment-row">
                                            <span class="payment-label">Receipt:</span>
                                            <span class="payment-value">${payment.receipt_number || 'N/A'}</span>
                                        </div>
                                        <div class="payment-row">
                                            <span class="payment-label">Method:</span>
                                            <span class="payment-value">${payment.payment_method || 'N/A'}</span>
                                        </div>
                                        <div class="payment-row">
                                            <span class="payment-label">Amount:</span>
                                            <span class="payment-value">${formatCurrency(payment.amount || 0)}</span>
                                        </div>
                                        <div class="payment-row">
                                            <span class="payment-label">Paid:</span>
                                            <span class="payment-value">${formatDate(payment.created_at)}</span>
                                        </div>
                                        ${payment.mpesa_checkout_id ? `
                                        <div class="payment-row">
                                            <span class="payment-label">M-Pesa Checkout ID:</span>
                                            <span class="payment-value">${payment.mpesa_checkout_id}</span>
                                        </div>
                                        ` : ''}
                                        ${payment.merchant_request_id ? `
                                        <div class="payment-row">
                                            <span class="payment-label">Merchant Request ID:</span>
                                            <span class="payment-value">${payment.merchant_request_id}</span>
                                        </div>
                                        ` : ''}
                                        ${payment.checkout_request_id ? `
                                        <div class="payment-row">
                                            <span class="payment-label">Checkout Request ID:</span>
                                            <span class="payment-value">${payment.checkout_request_id}</span>
                                        </div>
                                        ` : ''}
                                        ${payment.mpesa_phone ? `
                                        <div class="payment-row">
                                            <span class="payment-label">M-Pesa Phone:</span>
                                            <span class="payment-value">${payment.mpesa_phone}</span>
                                        </div>
                                        ` : ''}
                                        ${payment.mpesa_transaction_date ? `
                                        <div class="payment-row">
                                            <span class="payment-label">Transaction Date:</span>
                                            <span class="payment-value">${payment.mpesa_transaction_date}</span>
                                        </div>
                                        ` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ` : `
                        <div class="detail-section full-width">
                            <h4>Payment Information</h4>
                            <div class="payment-details">
                                <div class="payment-item">
                                    <div class="payment-row">
                                        <span class="payment-label">No payment information available</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        `}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-close" onclick="closeBookingModal()">Close</button>
                    ${booking.status === 'active' ? `
                        <button class="btn-complete" onclick="completeBookingFromModal('${booking.id}')">Mark as Complete</button>
                    ` : ''}
                    ${completedPayments.length > 0 && booking.status === 'pending' ? `
                        <button class="btn-confirm" onclick="confirmBooking('${booking.id}')">Confirm Booking</button>
                    ` : ''}
                    <button class="btn-print" onclick="printBookingDetails('${booking.id}')">Print</button>
                </div>
            </div>
        </div>
    `;

    const existingModal = document.getElementById('bookingModal');
    if (existingModal) {
        existingModal.remove();
    }

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    addModalStyles();
}

function getBookingItemsTable(bookingItems, itemsJson) {
    if (bookingItems && bookingItems.length > 0) {
        return bookingItems.map(item => `
            <tr>
                <td>${item.rental_items?.name || 'Unknown Item'}</td>
                <td>${item.quantity || 0}</td>
                <td>${formatCurrency(item.price || 0)}</td>
                <td>${formatCurrency((item.quantity || 0) * (item.price || 0))}</td>
            </tr>
        `).join('');
    }
    
    if (itemsJson && Array.isArray(itemsJson)) {
        return itemsJson.map(item => `
            <tr>
                <td>${item.name || 'Unknown Item'}</td>
                <td>${item.quantity || 0}</td>
                <td>${formatCurrency(item.price || 0)}</td>
                <td>${formatCurrency((item.quantity || 0) * (item.price || 0))}</td>
            </tr>
        `).join('');
    }
    
    return '<tr><td colspan="4">No items found</td></tr>';
}

function calculateDailyTotal(bookingItems, itemsJson) {
    if (bookingItems && bookingItems.length > 0) {
        return bookingItems.reduce((total, item) => total + ((item.quantity || 0) * (item.price || 0)), 0);
    }
    
    if (itemsJson && Array.isArray(itemsJson)) {
        return itemsJson.reduce((total, item) => total + ((item.quantity || 0) * (item.price || 0)), 0);
    }
    
    return 0;
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
                width: 95%;
                max-width: 900px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .modal-header {
                padding: 20px;
                border-bottom: 1px solid #ecf0f1;
                display: flex;
                justify-content: space-between;
                align-items: center;
                position: sticky;
                top: 0;
                background: white;
                z-index: 10;
            }
            .modal-header h3 {
                margin: 0;
                color: #2c3e50;
                font-size: 18px;
            }
            .modal-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #7f8c8d;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
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
                position: sticky;
                bottom: 0;
                background: white;
            }
            .booking-details-grid {
                display: flex;
                flex-direction: column;
                gap: 25px;
            }
            .detail-section {
                background: #f8f9fa;
                padding: 20px;
                border-radius: 6px;
                border-left: 4px solid #3498db;
            }
            .detail-section.full-width {
                grid-column: 1 / -1;
            }
            .detail-section h4 {
                margin: 0 0 15px 0;
                color: #2c3e50;
                font-size: 16px;
                border-bottom: 1px solid #e9ecef;
                padding-bottom: 8px;
            }
            .detail-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 0;
                border-bottom: 1px solid #f1f1f1;
            }
            .detail-item:last-child {
                border-bottom: none;
            }
            .detail-item label {
                font-weight: 600;
                color: #7f8c8d;
                min-width: 120px;
            }
            .user-id {
                font-family: monospace;
                font-size: 12px;
                color: #7f8c8d;
            }
            .items-table-container {
                overflow-x: auto;
            }
            .items-table {
                width: 100%;
                border-collapse: collapse;
                background: white;
                border-radius: 4px;
                overflow: hidden;
            }
            .items-table th {
                background: #34495e;
                color: white;
                padding: 12px;
                text-align: left;
                font-weight: 600;
                font-size: 12px;
            }
            .items-table td {
                padding: 12px;
                border-bottom: 1px solid #ecf0f1;
            }
            .items-table tbody tr:hover {
                background: #f8f9fa;
            }
            .total-row {
                background: #f8f9fa;
                font-weight: 600;
            }
            .total-label {
                text-align: right;
                padding-right: 20px;
            }
            .total-amount {
                color: #27ae60;
                font-size: 14px;
            }
            .grand-total {
                font-size: 16px;
                color: #2c3e50;
            }
            .payment-details {
                display: grid;
                gap: 15px;
            }
            .payment-item {
                background: white;
                padding: 15px;
                border-radius: 6px;
                border: 1px solid #e9ecef;
            }
            .payment-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 5px 0;
            }
            .payment-label {
                font-weight: 600;
                color: #7f8c8d;
            }
            .payment-value {
                color: #2c3e50;
                font-family: monospace;
                font-size: 12px;
            }
            .btn-close, .btn-complete, .btn-confirm, .btn-print {
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
                transition: all 0.2s ease;
            }
            .btn-close {
                background: #95a5a6;
                color: white;
            }
            .btn-close:hover {
                background: #7f8c8d;
            }
            .btn-complete {
                background: #27ae60;
                color: white;
            }
            .btn-complete:hover {
                background: #219a52;
            }
            .btn-confirm {
                background: #3498db;
                color: white;
            }
            .btn-confirm:hover {
                background: #2980b9;
            }
            .btn-print {
                background: #9b59b6;
                color: white;
            }
            .btn-print:hover {
                background: #8e44ad;
            }
        </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
}

window.closeBookingModal = function() {
    const modal = document.getElementById('bookingModal');
    if (modal) {
        modal.remove();
    }
};

window.confirmBooking = async function(bookingId) {
    if (!confirm('Confirm this booking as active?')) return;
    
    try {
        const { error } = await supabase
            .from('bookings')
            .update({ status: 'confirmed' })
            .eq('id', bookingId);
            
        if (error) throw error;
        
        alert('Booking confirmed!');
        closeBookingModal();
        loadBookings();
        
    } catch (error) {
        console.error('Error confirming booking:', error);
        alert('Failed to confirm booking: ' + error.message);
    }
};

window.completeBookingFromModal = async function(bookingId) {
    if (!confirm('Mark this booking as complete?')) return;
    
    try {
        const { error } = await supabase
            .from('bookings')
            .update({ status: 'completed' })
            .eq('id', bookingId);
            
        if (error) throw error;
        
        alert('Booking marked as complete!');
        closeBookingModal();
        loadBookings();
        
    } catch (error) {
        console.error('Error completing booking:', error);
        alert('Failed to complete booking: ' + error.message);
    }
};

window.completeBooking = async function(bookingId) {
    if (!confirm('Mark this booking as complete?')) return;
    
    try {
        const { error } = await supabase
            .from('bookings')
            .update({ status: 'completed' })
            .eq('id', bookingId);
            
        if (error) throw error;
        
        alert('Booking marked as complete!');
        loadBookings();
        
    } catch (error) {
        console.error('Error completing booking:', error);
        alert('Failed to complete booking: ' + error.message);
    }
};

function exportBookings() {
    const existingModal = document.getElementById('exportModal');
    if (existingModal) {
        document.body.removeChild(existingModal);
    }

    const modal = document.createElement('div');
    modal.id = 'exportModal';
    modal.style.cssText = `
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
    `;

    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 8px; width: 90%; max-width: 400px; text-align: center;">
            <h3 style="color: #2c3e50; margin-bottom: 20px;">Export Bookings</h3>
            <p style="color: #7f8c8d; margin-bottom: 25px;">Choose export format:</p>
            <div style="display: flex; gap: 15px; justify-content: center; margin-bottom: 25px;">
                <button id="exportExcelBtn" style="background: #27ae60; color: white; border: none; padding: 12px 20px; border-radius: 4px; cursor: pointer; font-weight: 500;">
                    Export as Excel
                </button>
                <button id="exportPDFBtn" style="background: #e74c3c; color: white; border: none; padding: 12px 20px; border-radius: 4px; cursor: pointer; font-weight: 500;">
                    Export as PDF
                </button>
            </div>
            <button id="closeExportBtn" style="background: #95a5a6; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                Cancel
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target.id === 'exportExcelBtn') {
            generateExcelReport();
            document.body.removeChild(modal);
        } else if (e.target.id === 'exportPDFBtn') {
            generatePDFReport();
            document.body.removeChild(modal);
        } else if (e.target.id === 'closeExportBtn' || e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

function generateExcelReport() {
    const filteredBookings = getFilteredBookings();
    
    if (filteredBookings.length === 0) {
        alert('No bookings to export');
        return;
    }

    let csvContent = "Booking ID,Customer Name,Phone,Start Date,End Date,Amount,Status,Payment Status\n";
    
    filteredBookings.forEach(booking => {
        const latestPayment = booking.payments && booking.payments.length > 0 
            ? booking.payments[booking.payments.length - 1] 
            : null;
        const paymentStatus = latestPayment ? latestPayment.status : 'No Payment';
        
        const row = [
            `#${booking.id.substring(0, 8).toUpperCase()}`,
            `"${booking.customer_name || 'N/A'}"`,
            `"${booking.customer_phone || 'N/A'}"`,
            `"${formatDate(booking.start_date)}"`,
            `"${formatDate(booking.end_date)}"`,
            `"${formatCurrency(booking.total_price || booking.total_amount || 0)}"`,
            `"${booking.status}"`,
            `"${paymentStatus}"`
        ].join(',');
        
        csvContent += row + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `bookings_export_${new Date().toISOString().split('T')[0]}.csv`;
    
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    alert('Excel file downloaded successfully!');
}

function generatePDFReport() {
    const filteredBookings = getFilteredBookings();
    
    if (filteredBookings.length === 0) {
        alert('No bookings to export');
        return;
    }

    const printWindow = window.open('', '_blank');
    const printDate = new Date().toLocaleDateString();
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Bookings Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
                .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2c3e50; padding-bottom: 10px; }
                .header h1 { color: #2c3e50; margin: 0; }
                .header p { color: #7f8c8d; margin: 5px 0; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #34495e; color: white; padding: 12px; text-align: left; }
                td { padding: 10px; border-bottom: 1px solid #ddd; }
                .total { margin-top: 20px; text-align: right; font-weight: bold; }
                .status { padding: 4px 8px; border-radius: 12px; font-size: 12px; }
                .status-confirmed { background: #d1ecf1; color: #0c5460; }
                .status-active { background: #d4edda; color: #155724; }
                .status-completed { background: #e8f4fd; color: #2980b9; }
                .status-pending { background: #fff3cd; color: #856404; }
                .payment-completed { color: #27ae60; font-weight: bold; }
                .payment-pending { color: #f39c12; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Bookings Report</h1>
                <p>Generated on: ${printDate}</p>
                <p>Total Bookings: ${filteredBookings.length}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Booking ID</th>
                        <th>Customer</th>
                        <th>Phone</th>
                        <th>Start Date</th>
                        <th>End Date</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Payment</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredBookings.map(booking => {
                        const latestPayment = booking.payments && booking.payments.length > 0 
                            ? booking.payments[booking.payments.length - 1] 
                            : null;
                        const paymentStatus = latestPayment ? latestPayment.status : 'No Payment';
                        return `
                        <tr>
                            <td>#${booking.id.substring(0, 8).toUpperCase()}</td>
                            <td>${booking.customer_name || 'N/A'}</td>
                            <td>${booking.customer_phone || 'N/A'}</td>
                            <td>${formatDate(booking.start_date)}</td>
                            <td>${formatDate(booking.end_date)}</td>
                            <td>${formatCurrency(booking.total_price || booking.total_amount || 0)}</td>
                            <td><span class="status status-${booking.status}">${booking.status}</span></td>
                            <td><span class="payment-${paymentStatus}">${paymentStatus}</span></td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            <div class="total">
                Total Revenue: ${formatCurrency(filteredBookings.reduce((sum, booking) => sum + (booking.total_price || booking.total_amount || 0), 0))}
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
    
    alert('PDF report generated! Use browser print to save as PDF.');
}

function getFilteredBookings() {
    let filtered = [...allBookings];
    
    if (currentFilter !== 'all') {
        filtered = filtered.filter(booking => {
            if (currentFilter === 'confirmed') {
                const latestPayment = booking.payments && booking.payments.length > 0 
                    ? booking.payments[booking.payments.length - 1] 
                    : null;
                return (booking.status === 'pending' && latestPayment && latestPayment.status === 'completed') || 
                       booking.status === 'confirmed';
            }
            return booking.status === currentFilter;
        });
    }
    
    if (currentDateFilter !== 'all') {
        const now = new Date();
        filtered = filtered.filter(booking => {
            const bookingDate = new Date(booking.created_at);
            switch(currentDateFilter) {
                case 'today':
                    return bookingDate.toDateString() === now.toDateString();
                case 'week':
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    return bookingDate >= weekAgo;
                case 'month':
                    return bookingDate.getMonth() === now.getMonth() && 
                           bookingDate.getFullYear() === now.getFullYear();
                case 'year':
                    return bookingDate.getFullYear() === now.getFullYear();
                default:
                    return true;
            }
        });
    }
    
    if (currentSearch) {
        filtered = filtered.filter(booking => 
            (booking.customer_name?.toLowerCase().includes(currentSearch)) ||
            (booking.customer_phone?.includes(currentSearch)) ||
            (booking.id.toLowerCase().includes(currentSearch))
        );
    }
    
    return filtered;
}

window.printBookingDetails = function(bookingId) {
    const modalContent = document.querySelector('.modal-content');
    if (modalContent) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Booking Details - ${bookingId}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
                    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2c3e50; padding-bottom: 10px; }
                    .header h1 { color: #2c3e50; margin: 0; }
                    .section { margin-bottom: 25px; }
                    .section h3 { color: #2c3e50; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
                    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                    .detail-item { display: flex; justify-content: space-between; padding: 5px 0; }
                    .detail-item label { font-weight: bold; color: #7f8c8d; }
                    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                    th { background: #34495e; color: white; padding: 10px; text-align: left; }
                    td { padding: 8px; border-bottom: 1px solid #ddd; }
                    .total-row { font-weight: bold; background: #f8f9fa; }
                    @media print { body { margin: 0; } }
                </style>
            </head>
            <body>
                ${modalContent.innerHTML}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }
};