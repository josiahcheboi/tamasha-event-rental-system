import { supabase } from "../../assets/js/supabase-client.js";
import { formatDate, formatCurrency } from "../../assets/js/utils.js";

let allPayments = [];
let currentFilter = 'all';
let currentMethodFilter = 'all';
let currentSearch = '';

document.addEventListener("DOMContentLoaded", async () => {
    await checkAdminAuth();
    await loadPayments();
    setupEventListeners();
});

async function checkAdminAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = '/auth/admin-login.html';
        return;
    }
}

async function loadPayments() {
    showLoading();
    
    try {
        const { data: payments, error } = await supabase
            .from("payments")
            .select(`
                *,
                bookings (
                    customer_name,
                    customer_phone
                )
            `)
            .order("created_at", { ascending: false });

        if (error) throw error;

        allPayments = payments || [];
        applyFilters();
        
    } catch (error) {
        console.error("Error loading payments:", error);
        showError("Failed to load payments");
    }
}

function displayPayments(payments) {
    const tableBody = document.getElementById("paymentsTableBody");
    const noPayments = document.getElementById("noPayments");
    
    if (!payments || payments.length === 0) {
        tableBody.innerHTML = '';
        noPayments.style.display = 'block';
        updateStats([]);
        return;
    }
    
    noPayments.style.display = 'none';
    
    tableBody.innerHTML = payments.map(payment => `
        <tr>
            <td class="receipt-number">${payment.receipt_number || 'Pending'}</td>
            <td>${payment.bookings?.customer_name || 'Customer'}</td>
            <td>${payment.bookings?.customer_phone || 'Not provided'}</td>
            <td class="booking-id">#${payment.booking_id?.substring(0, 8)?.toUpperCase() || 'N/A'}</td>
            <td class="amount">${formatCurrency(payment.amount)}</td>
            <td>
                <span class="method-badge method-${payment.payment_method}">
                    ${formatMethod(payment.payment_method)}
                </span>
            </td>
            <td>${formatDate(payment.created_at)}</td>
            <td>
                <span class="status-badge status-${payment.status}">
                    ${payment.status}
                </span>
            </td>
            <td class="actions">
                <button class="btn-view" onclick="viewPaymentDetails('${payment.id}')">
                    View
                </button>
            </td>
        </tr>
    `).join('');
    
    updateStats(payments);
}

function formatMethod(method) {
    const methods = {
        'mpesa': 'M-Pesa',
        'card': 'Card',
        'cash': 'Cash'
    };
    return methods[method] || method;
}

function updateStats(payments) {
    const total = payments.length;
    const completed = payments.filter(p => p.status === 'completed').length;
    const pending = payments.filter(p => p.status === 'pending').length;
    const revenue = payments
        .filter(p => p.status === 'completed')
        .reduce((sum, payment) => sum + (payment.amount || 0), 0);
    
    document.getElementById('totalPayments').textContent = total;
    document.getElementById('totalRevenue').textContent = `KES ${revenue.toLocaleString()}`;
    document.getElementById('completedPayments').textContent = completed;
    document.getElementById('pendingPayments').textContent = pending;
}

function setupEventListeners() {
    document.getElementById('dashboardBtn').addEventListener('click', () => {
        window.location.href = '/admin/admin-dashboard.html';
    });
    
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadPayments();
    });
    
    document.getElementById('exportBtn').addEventListener('click', exportPayments);
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    
    document.getElementById('statusFilter').addEventListener('change', (e) => {
        currentFilter = e.target.value;
        applyFilters();
    });
    
    document.getElementById('methodFilter').addEventListener('change', (e) => {
        currentMethodFilter = e.target.value;
        applyFilters();
    });
}

function performSearch() {
    currentSearch = document.getElementById('searchInput').value.toLowerCase();
    applyFilters();
}

function applyFilters() {
    let filtered = [...allPayments];
    
    if (currentFilter !== 'all') {
        filtered = filtered.filter(payment => payment.status === currentFilter);
    }
    
    if (currentMethodFilter !== 'all') {
        filtered = filtered.filter(payment => payment.payment_method === currentMethodFilter);
    }
    
    if (currentSearch) {
        filtered = filtered.filter(payment => 
            (payment.bookings?.customer_name?.toLowerCase().includes(currentSearch)) ||
            (payment.bookings?.customer_phone?.includes(currentSearch)) ||
            (payment.receipt_number?.toLowerCase().includes(currentSearch)) ||
            (payment.booking_id?.toLowerCase().includes(currentSearch))
        );
    }
    
    displayPayments(filtered);
}

function showLoading() {
    const tableBody = document.getElementById("paymentsTableBody");
    tableBody.innerHTML = `
        <tr>
            <td colspan="9" class="loading-cell">Loading payments...</td>
        </tr>
    `;
}

function showError(message) {
    alert(message);
}

function exportPayments() {
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
            <h3 style="color: #2c3e50; margin-bottom: 20px;">Export Payments</h3>
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
    const filteredPayments = getFilteredPayments();
    
    if (filteredPayments.length === 0) {
        alert('No payments to export');
        return;
    }

    let csvContent = "Receipt No,Customer Name,Phone,Booking ID,Amount,Method,Date,Status\n";
    
    filteredPayments.forEach(payment => {
        const row = [
            `"${payment.receipt_number || 'Pending'}"`,
            `"${payment.bookings?.customer_name || 'Customer'}"`,
            `"${payment.bookings?.customer_phone || 'Not provided'}"`,
            `"#${payment.booking_id?.substring(0, 8)?.toUpperCase() || 'N/A'}"`,
            `"${formatCurrency(payment.amount)}"`,
            `"${formatMethod(payment.payment_method)}"`,
            `"${formatDate(payment.created_at)}"`,
            `"${payment.status}"`
        ].join(',');
        
        csvContent += row + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `payments_export_${new Date().toISOString().split('T')[0]}.csv`;
    
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    alert('Excel file downloaded successfully!');
}

function generatePDFReport() {
    const filteredPayments = getFilteredPayments();
    
    if (filteredPayments.length === 0) {
        alert('No payments to export');
        return;
    }

    const printWindow = window.open('', '_blank');
    const printDate = new Date().toLocaleDateString();
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payments Report</title>
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
                .status-completed { background: #d4edda; color: #155724; }
                .status-pending { background: #fff3cd; color: #856404; }
                .status-failed { background: #f8d7da; color: #721c24; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Payments Report</h1>
                <p>Generated on: ${printDate}</p>
                <p>Total Payments: ${filteredPayments.length}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Receipt No</th>
                        <th>Customer</th>
                        <th>Phone</th>
                        <th>Booking ID</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredPayments.map(payment => `
                        <tr>
                            <td>${payment.receipt_number || 'Pending'}</td>
                            <td>${payment.bookings?.customer_name || 'Customer'}</td>
                            <td>${payment.bookings?.customer_phone || 'Not provided'}</td>
                            <td>#${payment.booking_id?.substring(0, 8)?.toUpperCase() || 'N/A'}</td>
                            <td>${formatCurrency(payment.amount)}</td>
                            <td>${formatMethod(payment.payment_method)}</td>
                            <td>${formatDate(payment.created_at)}</td>
                            <td><span class="status status-${payment.status}">${payment.status}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="total">
                Total Revenue: ${formatCurrency(filteredPayments.filter(p => p.status === 'completed').reduce((sum, payment) => sum + (payment.amount || 0), 0))}
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
    
    alert('PDF report generated! Use browser print to save as PDF.');
}

function getFilteredPayments() {
    let filtered = [...allPayments];
    
    if (currentFilter !== 'all') {
        filtered = filtered.filter(payment => payment.status === currentFilter);
    }
    
    if (currentMethodFilter !== 'all') {
        filtered = filtered.filter(payment => payment.payment_method === currentMethodFilter);
    }
    
    if (currentSearch) {
        filtered = filtered.filter(payment => 
            (payment.bookings?.customer_name?.toLowerCase().includes(currentSearch)) ||
            (payment.bookings?.customer_phone?.includes(currentSearch)) ||
            (payment.receipt_number?.toLowerCase().includes(currentSearch)) ||
            (payment.booking_id?.toLowerCase().includes(currentSearch))
        );
    }
    
    return filtered;
}

window.viewPaymentDetails = function(paymentId) {
    alert(`Viewing details for payment: ${paymentId}`);
};