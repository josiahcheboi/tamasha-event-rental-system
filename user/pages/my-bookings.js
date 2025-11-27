import { supabase } from "../../assets/js/supabase-client.js";
import { formatDate, formatCurrency } from "../../assets/js/utils.js";

let currentUser = null;
let allBookings = [];

document.addEventListener("DOMContentLoaded", async () => {
    await checkAuth();
    await loadBookings();
    setupEventListeners();
});

async function checkAuth() {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session?.user) {
        window.location.href = "/auth/login.html";
        return;
    }
    
    currentUser = session.user;
}

async function loadBookings() {
    showLoading();
    
    try {
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
                    receipt_number,
                    payment_method,
                    status,
                    created_at
                )
            `)
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        allBookings = bookings || [];
        displayBookings(allBookings);
        updateStats(allBookings);
        
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
        return;
    }
    
    noBookings.style.display = 'none';
    
    tableBody.innerHTML = bookings.map(booking => {
        const latestPayment = booking.payments && booking.payments.length > 0 
            ? booking.payments[booking.payments.length - 1] 
            : null;
        
        let displayStatus = booking.status;
        if (latestPayment && latestPayment.status === 'completed' && booking.status === 'pending') {
            displayStatus = 'confirmed';
        }
        
        return `
        <tr>
            <td class="booking-id">#${booking.id.substring(0, 8).toUpperCase()}</td>
            <td>${formatDate(booking.start_date)}</td>
            <td>${formatDate(booking.end_date)}</td>
            <td>
                <span class="status-badge status-${displayStatus}">
                    ${displayStatus}
                    ${latestPayment && latestPayment.status === 'completed' ? ' ✅' : ''}
                </span>
            </td>
            <td class="actions">
                <button class="btn-view" onclick="viewBookingDetails('${booking.id}')">
                    View Details
                </button>
                ${displayStatus === 'active' ? `
                    <button class="btn-complete" onclick="completeBooking('${booking.id}')">
                        Mark Complete
                    </button>
                ` : ''}
            </td>
        </tr>
        `;
    }).join('');
}

function updateStats(bookings) {
    const total = bookings.length;
    const active = bookings.filter(b => b.status === 'active').length;
    const completed = bookings.filter(b => b.status === 'completed').length;
    const confirmed = bookings.filter(b => b.status === 'confirmed').length;
    
    document.getElementById('totalBookings').textContent = total;
    document.getElementById('activeBookings').textContent = active;
    document.getElementById('pendingBookings').textContent = confirmed;
    document.getElementById('completedBookings').textContent = completed;
}

function setupEventListeners() {
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = '/user/user-dashboard.html';
    });
    
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadBookings();
    });
    
    document.getElementById('statusFilter').addEventListener('change', filterBookings);
    document.getElementById('dateFilter').addEventListener('change', filterBookings);
}

function filterBookings() {
    const statusFilter = document.getElementById('statusFilter').value;
    const dateFilter = document.getElementById('dateFilter').value;
    
    let filtered = [...allBookings];
    
    if (statusFilter !== 'all') {
        filtered = filtered.filter(booking => {
            if (statusFilter === 'confirmed') {
                const latestPayment = booking.payments && booking.payments.length > 0 
                    ? booking.payments[booking.payments.length - 1] 
                    : null;
                return (booking.status === 'pending' && latestPayment && latestPayment.status === 'completed') || 
                       booking.status === 'confirmed';
            }
            return booking.status === statusFilter;
        });
    }
    
    if (dateFilter !== 'all') {
        const now = new Date();
        filtered = filtered.filter(booking => {
            const startDate = new Date(booking.start_date);
            const endDate = new Date(booking.end_date);
            
            switch (dateFilter) {
                case 'upcoming':
                    return startDate > now;
                case 'past':
                    return endDate < now;
                case 'current':
                    return startDate <= now && endDate >= now;
                default:
                    return true;
            }
        });
    }
    
    displayBookings(filtered);
}

function showLoading() {
    const tableBody = document.getElementById("bookingsTableBody");
    tableBody.innerHTML = `
        <tr>
            <td colspan="5" class="loading-cell">Loading bookings...</td>
        </tr>
    `;
}

function showError(message) {
    document.getElementById('errorText').textContent = message;
    document.getElementById('errorMessage').style.display = 'block';
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
                    receipt_number,
                    payment_method,
                    status,
                    created_at
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
    
    const completedPayments = booking.payments ? booking.payments.filter(p => p.status === 'completed') : [];
    
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
                                            <span class="payment-label">Date:</span>
                                            <span class="payment-value">${formatDate(payment.created_at)}</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-close" onclick="closeBookingModal()">Close</button>
                    ${booking.status === 'active' ? `
                        <button class="btn-complete" onclick="completeBookingFromModal('${booking.id}')">Mark as Complete</button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    const existingModal = document.getElementById('bookingModal');
    if (existingModal) existingModal.remove();

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
                max-width: 800px;
                max-height: 90vh;
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
            .booking-details-grid {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            .detail-section {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 6px;
            }
            .detail-section h4 {
                margin: 0 0 10px 0;
                color: #2c3e50;
            }
            .detail-item {
                display: flex;
                justify-content: space-between;
                padding: 5px 0;
            }
            .detail-item label {
                font-weight: 600;
                color: #7f8c8d;
            }
            .items-table {
                width: 100%;
                border-collapse: collapse;
            }
            .items-table th {
                background: #34495e;
                color: white;
                padding: 10px;
                text-align: left;
            }
            .items-table td {
                padding: 8px;
                border-bottom: 1px solid #ecf0f1;
            }
            .total-row {
                font-weight: 600;
                background: #f8f9fa;
            }
            .payment-details {
                display: grid;
                gap: 10px;
            }
            .payment-item {
                background: white;
                padding: 10px;
                border-radius: 6px;
                border: 1px solid #e9ecef;
            }
            .payment-row {
                display: flex;
                justify-content: space-between;
                padding: 3px 0;
            }
            .btn-close, .btn-complete {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            .btn-close { background: #95a5a6; color: white; }
            .btn-complete { background: #27ae60; color: white; }
        </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
}

window.closeBookingModal = function() {
    const modal = document.getElementById('bookingModal');
    if (modal) modal.remove();
};

window.completeBookingFromModal = async function(bookingId) {
    if (!confirm('Mark this booking as complete?')) return;
    
    try {
        const { error } = await supabase
            .from('bookings')
            .update({ status: 'completed' })
            .eq('id', bookingId);
            
        if (error) throw error;
        
        alert('Booking completed!');
        closeBookingModal();
        loadBookings();
    } catch (error) {
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
        
        alert('Booking completed!');
        loadBookings();
    } catch (error) {
        alert('Failed to complete booking: ' + error.message);
    }
};