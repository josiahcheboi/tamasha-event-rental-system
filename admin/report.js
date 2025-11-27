// Initialize Supabase
const supabaseUrl = 'https://humeamgpybksjeyjvvsw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1bWVhbWdweWJrc2pleWp2dnN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjg3Mzc1MiwiZXhwIjoyMDc4NDQ5NzUyfQ.ZAtK_gIRVNLwiZLkLwbiSCLgv1TWVI8dsNhmK4zmw3E';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Global variables
let currentReportData = null;
let currentCharts = [];

document.addEventListener('DOMContentLoaded', function() {
    initializeReportPage();
    setupEventListeners();
});

function initializeReportPage() {
    // Set default dates to current month
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    document.getElementById('startDate').value = formatDateForInput(firstDay);
    document.getElementById('endDate').value = formatDateForInput(today);
    
    // Check authentication
    checkAuth();
}

function setupEventListeners() {
    // Safe event listener setup
    const reportPeriod = document.getElementById('reportPeriod');
    const generateReport = document.getElementById('generateReport');
    const exportExcel = document.getElementById('exportExcel');
    const exportPDF = document.getElementById('exportPDF');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (reportPeriod) {
        reportPeriod.addEventListener('change', function(e) {
            const customRange = document.getElementById('customDateRange');
            if (e.target.value === 'custom') {
                customRange.style.display = 'flex';
            } else {
                customRange.style.display = 'none';
                updateDateRange(e.target.value);
            }
        });
    }

    if (generateReport) {
        generateReport.addEventListener('click', generateReportHandler);
    }
    
    if (exportExcel) {
        exportExcel.addEventListener('click', exportToExcel);
    }
    
    if (exportPDF) {
        exportPDF.addEventListener('click', exportToPDF);
    }
    
    if (dashboardBtn) {
        dashboardBtn.addEventListener('click', () => {
            window.location.href = '/admin/admin-dashboard.html';
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.href = '/auth/admin-login.html';
        });
    }
}

function updateDateRange(period) {
    const today = new Date();
    let startDate = new Date();
    
    switch(period) {
        case 'today':
            startDate = new Date(today);
            break;
        case 'week':
            startDate = new Date(today.setDate(today.getDate() - 7));
            break;
        case 'month':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            break;
        case 'quarter':
            const quarter = Math.floor(today.getMonth() / 3);
            startDate = new Date(today.getFullYear(), quarter * 3, 1);
            break;
        case 'year':
            startDate = new Date(today.getFullYear(), 0, 1);
            break;
    }
    
    document.getElementById('startDate').value = formatDateForInput(startDate);
    document.getElementById('endDate').value = formatDateForInput(new Date());
}

async function checkAuth() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
            window.location.href = '/auth/admin-login.html';
            return;
        }

        const adminNameElement = document.getElementById('adminName');
        if (adminNameElement) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', user.id)
                .single();
                
            if (profile?.full_name) {
                adminNameElement.textContent = profile.full_name;
            }
        }
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = '/auth/admin-login.html';
    }
}

async function generateReportHandler() {
    const reportType = document.getElementById('reportType').value;
    const period = document.getElementById('reportPeriod').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    if (!startDate || !endDate) {
        alert('Please select both start and end dates');
        return;
    }
    
    showLoading();
    hideResults();
    hideError();
    destroyCharts();

    try {
        let reportData;
        
        switch(reportType) {
            case 'performance':
                reportData = await generatePerformanceReport(startDate, endDate);
                break;
            case 'bookings':
                reportData = await generateBookingsReport(startDate, endDate);
                break;
            case 'revenue':
                reportData = await generateRevenueReport(startDate, endDate);
                break;
            case 'popular':
                reportData = await generatePopularItemsReport(startDate, endDate);
                break;
            case 'customer':
                reportData = await generateCustomerReport(startDate, endDate);
                break;
            default:
                throw new Error('Invalid report type');
        }
        
        currentReportData = reportData;
        displayReportResults(reportData, reportType, period, startDate, endDate);
        
    } catch (error) {
        console.error('Error generating report:', error);
        showError('Failed to generate report: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function generatePerformanceReport(startDate, endDate) {
    // Fetch bookings with payments and items
    const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
            *,
            payments(*),
            booking_items(
                quantity,
                rental_items(
                    name,
                    price
                )
            )
        `)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

    if (bookingsError) throw bookingsError;

    // Calculate metrics
    const totalBookings = bookings.length;
    const completedBookings = bookings.filter(b => b.status === 'completed').length;
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed').length;
    const activeBookings = bookings.filter(b => b.status === 'active').length;
    const pendingBookings = bookings.filter(b => b.status === 'pending').length;
    const cancelledBookings = bookings.filter(b => b.status === 'cancelled').length;

    // Calculate revenue from completed payments
    const totalRevenue = bookings.reduce((sum, booking) => {
        const completedPayment = booking.payments?.find(p => p.status === 'completed');
        return sum + (completedPayment?.amount || 0);
    }, 0);

    const avgBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;
    const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;

    // Calculate bookings by date for chart
    const bookingsByDate = {};
    bookings.forEach(booking => {
        const date = booking.created_at.split('T')[0];
        bookingsByDate[date] = (bookingsByDate[date] || 0) + 1;
    });

    return {
        totalBookings,
        completedBookings,
        confirmedBookings,
        activeBookings,
        pendingBookings,
        cancelledBookings,
        totalRevenue,
        avgBookingValue,
        completionRate,
        bookingsByDate,
        bookings: bookings.slice(0, 50) // Limit for display
    };
}

async function generateBookingsReport(startDate, endDate) {
    const { data: bookings, error } = await supabase
        .from('bookings')
        .select(`
            *,
            payments(*),
            booking_items(
                quantity,
                rental_items(
                    name,
                    price
                )
            )
        `)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

    if (error) throw error;

    // Group by status
    const statusCounts = bookings.reduce((acc, booking) => {
        acc[booking.status] = (acc[booking.status] || 0) + 1;
        return acc;
    }, {});

    // Calculate revenue by status
    const revenueByStatus = bookings.reduce((acc, booking) => {
        const completedPayment = booking.payments?.find(p => p.status === 'completed');
        const amount = completedPayment?.amount || 0;
        acc[booking.status] = (acc[booking.status] || 0) + amount;
        return acc;
    }, {});

    return {
        bookings,
        statusCounts,
        revenueByStatus,
        total: bookings.length
    };
}

async function generateRevenueReport(startDate, endDate) {
    const { data: payments, error } = await supabase
        .from('payments')
        .select(`
            *,
            bookings(
                customer_name,
                customer_phone
            )
        `)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

    if (error) throw error;

    const completedPayments = payments.filter(p => p.status === 'completed');
    const pendingPayments = payments.filter(p => p.status === 'pending');
    const failedPayments = payments.filter(p => p.status === 'failed');
    
    const totalRevenue = completedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const pendingRevenue = pendingPayments.reduce((sum, payment) => sum + payment.amount, 0);

    // Group by payment method
    const revenueByMethod = payments.reduce((acc, payment) => {
        if (payment.status === 'completed') {
            const method = payment.payment_method || 'unknown';
            acc[method] = (acc[method] || 0) + payment.amount;
        }
        return acc;
    }, {});

    // Revenue by date
    const revenueByDate = {};
    completedPayments.forEach(payment => {
        const date = payment.created_at.split('T')[0];
        revenueByDate[date] = (revenueByDate[date] || 0) + payment.amount;
    });

    return {
        payments,
        completedPayments,
        pendingPayments,
        failedPayments,
        totalRevenue,
        pendingRevenue,
        revenueByMethod,
        revenueByDate,
        paymentCount: payments.length
    };
}

async function generatePopularItemsReport(startDate, endDate) {
    try {
        // First, get all completed bookings in the date range
        const { data: completedBookings, error: bookingsError } = await supabase
            .from('bookings')
            .select(`
                id,
                created_at,
                booking_items(
                    quantity,
                    price,
                    rental_items(
                        name
                    )
                )
            `)
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .eq('status', 'completed');

        if (bookingsError) throw bookingsError;

        // Flatten the booking items
        const allItems = [];
        completedBookings.forEach(booking => {
            if (booking.booking_items && booking.booking_items.length > 0) {
                booking.booking_items.forEach(item => {
                    allItems.push({
                        ...item,
                        booking_created_at: booking.created_at
                    });
                });
            }
        });

        return processPopularItemsData(allItems);
        
    } catch (error) {
        console.error('Error in generatePopularItemsReport:', error);
        throw error;
    }
}

function processPopularItemsData(bookingItems) {
    // Aggregate item data
    const itemStats = {};
    
    bookingItems.forEach(item => {
        const itemName = item.rental_items?.name || 'Unknown Item';
        if (!itemStats[itemName]) {
            itemStats[itemName] = {
                name: itemName,
                bookings: 0,
                quantity: 0,
                revenue: 0
            };
        }
        
        itemStats[itemName].bookings += 1;
        itemStats[itemName].quantity += item.quantity || 0;
        itemStats[itemName].revenue += (item.quantity || 0) * (item.price || 0);
    });

    const popularItems = Object.values(itemStats)
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 10);

    return {
        popularItems,
        totalItems: bookingItems.length
    };
}

async function generateCustomerReport(startDate, endDate) {
    const { data: bookings, error } = await supabase
        .from('bookings')
        .select(`
            customer_name,
            customer_phone,
            customer_email,
            total_amount,
            status,
            created_at,
            payments!inner(
                amount,
                status
            )
        `)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .eq('payments.status', 'completed')
        .order('created_at', { ascending: false });

    if (error) throw error;

    // Group by customer
    const customerStats = {};
    bookings.forEach(booking => {
        const customerKey = booking.customer_phone || booking.customer_email;
        if (!customerKey) return;

        if (!customerStats[customerKey]) {
            customerStats[customerKey] = {
                name: booking.customer_name || 'Unknown',
                phone: booking.customer_phone,
                email: booking.customer_email,
                bookings: 0,
                totalSpent: 0,
                lastBooking: booking.created_at
            };
        }

        customerStats[customerKey].bookings += 1;
        customerStats[customerKey].totalSpent += booking.total_amount || 0;
        
        if (new Date(booking.created_at) > new Date(customerStats[customerKey].lastBooking)) {
            customerStats[customerKey].lastBooking = booking.created_at;
        }
    });

    const topCustomers = Object.values(customerStats)
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 20);

    return {
        topCustomers,
        totalCustomers: Object.keys(customerStats).length,
        totalBookings: bookings.length
    };
}

function displayReportResults(data, reportType, period, startDate, endDate) {
    const resultsDiv = document.getElementById('reportResults');
    const title = document.getElementById('reportTitle');
    const periodText = document.getElementById('reportPeriodText');
    const generatedText = document.getElementById('reportGenerated');
    const summaryStats = document.getElementById('summaryStats');
    const chartsSection = document.getElementById('chartsSection');
    const detailedData = document.getElementById('detailedData');

    if (!resultsDiv || !title || !periodText || !summaryStats || !detailedData) {
        console.error('Required DOM elements not found');
        return;
    }

    // Set title and period
    const reportTitles = {
        performance: 'Performance Overview Report',
        bookings: 'Booking Analysis Report',
        revenue: 'Revenue Report',
        popular: 'Most Booked Items Report',
        customer: 'Customer Analysis Report'
    };
    
    title.textContent = reportTitles[reportType];
    periodText.textContent = `Period: ${getPeriodText(period, startDate, endDate)}`;
    generatedText.textContent = `Generated on: ${new Date().toLocaleString()}`;

    // Generate content based on report type
    switch(reportType) {
        case 'performance':
            displayPerformanceSummary(data, summaryStats);
            createPerformanceCharts(data, chartsSection);
            displayPerformanceDetails(data, detailedData);
            break;
        case 'bookings':
            displayBookingsSummary(data, summaryStats);
            createBookingsCharts(data, chartsSection);
            displayBookingsDetails(data, detailedData);
            break;
        case 'revenue':
            displayRevenueSummary(data, summaryStats);
            createRevenueCharts(data, chartsSection);
            displayRevenueDetails(data, detailedData);
            break;
        case 'popular':
            displayPopularSummary(data, summaryStats);
            createPopularItemsCharts(data, chartsSection);
            displayPopularDetails(data, detailedData);
            break;
        case 'customer':
            displayCustomerSummary(data, summaryStats);
            createCustomerCharts(data, chartsSection);
            displayCustomerDetails(data, detailedData);
            break;
    }

    resultsDiv.classList.remove('hidden');
}

// Summary display functions
function displayPerformanceSummary(data, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="summary-card">
            <h3>Total Bookings</h3>
            <div class="value">${data.totalBookings}</div>
            <div class="trend positive">${data.completedBookings} Completed</div>
        </div>
        <div class="summary-card">
            <h3>Total Revenue</h3>
            <div class="value">Ksh ${data.totalRevenue.toLocaleString()}</div>
            <div class="trend positive">Completed</div>
        </div>
        <div class="summary-card">
            <h3>Avg Booking Value</h3>
            <div class="value">Ksh ${Math.round(data.avgBookingValue).toLocaleString()}</div>
            <div class="trend">Per Booking</div>
        </div>
        <div class="summary-card">
            <h3>Completion Rate</h3>
            <div class="value">${data.completionRate.toFixed(1)}%</div>
            <div class="trend positive">Success Rate</div>
        </div>
    `;
}

function displayBookingsSummary(data, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="summary-card">
            <h3>Total Bookings</h3>
            <div class="value">${data.total}</div>
        </div>
        <div class="summary-card">
            <h3>Completed</h3>
            <div class="value">${data.statusCounts.completed || 0}</div>
        </div>
        <div class="summary-card">
            <h3>Confirmed</h3>
            <div class="value">${data.statusCounts.confirmed || 0}</div>
        </div>
        <div class="summary-card">
            <h3>Active</h3>
            <div class="value">${data.statusCounts.active || 0}</div>
        </div>
    `;
}

function displayRevenueSummary(data, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="summary-card">
            <h3>Total Revenue</h3>
            <div class="value">Ksh ${data.totalRevenue.toLocaleString()}</div>
        </div>
        <div class="summary-card">
            <h3>Completed Payments</h3>
            <div class="value">${data.completedPayments.length}</div>
        </div>
        <div class="summary-card">
            <h3>Pending Revenue</h3>
            <div class="value">Ksh ${data.pendingRevenue.toLocaleString()}</div>
        </div>
        <div class="summary-card">
            <h3>Success Rate</h3>
            <div class="value">${((data.completedPayments.length / data.paymentCount) * 100).toFixed(1)}%</div>
        </div>
    `;
}

function displayPopularSummary(data, container) {
    if (!container) return;
    
    const totalRevenue = data.popularItems.reduce((sum, item) => sum + item.revenue, 0);
    const totalBookings = data.popularItems.reduce((sum, item) => sum + item.bookings, 0);
    
    container.innerHTML = `
        <div class="summary-card">
            <h3>Items Tracked</h3>
            <div class="value">${data.popularItems.length}</div>
        </div>
        <div class="summary-card">
            <h3>Most Booked</h3>
            <div class="value">${data.popularItems[0]?.name || 'N/A'}</div>
        </div>
        <div class="summary-card">
            <h3>Total Revenue</h3>
            <div class="value">Ksh ${totalRevenue.toLocaleString()}</div>
        </div>
        <div class="summary-card">
            <h3>Total Bookings</h3>
            <div class="value">${totalBookings}</div>
        </div>
    `;
}

function displayCustomerSummary(data, container) {
    if (!container) return;
    
    const totalRevenue = data.topCustomers.reduce((sum, customer) => sum + customer.totalSpent, 0);
    
    container.innerHTML = `
        <div class="summary-card">
            <h3>Total Customers</h3>
            <div class="value">${data.totalCustomers}</div>
        </div>
        <div class="summary-card">
            <h3>Total Bookings</h3>
            <div class="value">${data.totalBookings}</div>
        </div>
        <div class="summary-card">
            <h3>Total Revenue</h3>
            <div class="value">Ksh ${totalRevenue.toLocaleString()}</div>
        </div>
        <div class="summary-card">
            <h3>Avg per Customer</h3>
            <div class="value">Ksh ${Math.round(totalRevenue / data.totalCustomers).toLocaleString()}</div>
        </div>
    `;
}

// Chart creation functions
function createPerformanceCharts(data, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="chart-container">
            <h3>Bookings Trend</h3>
            <canvas id="bookingsTrendChart"></canvas>
        </div>
        <div class="chart-container">
            <h3>Booking Status Distribution</h3>
            <canvas id="bookingStatusChart"></canvas>
        </div>
    `;

    // Bookings Trend Chart
    const trendCtx = document.getElementById('bookingsTrendChart').getContext('2d');
    const dates = Object.keys(data.bookingsByDate).sort();
    const bookingsCount = dates.map(date => data.bookingsByDate[date]);
    
    const trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Bookings',
                data: bookingsCount,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    currentCharts.push(trendChart);

    // Booking Status Chart
    const statusCtx = document.getElementById('bookingStatusChart').getContext('2d');
    const statusData = {
        completed: data.completedBookings,
        confirmed: data.confirmedBookings,
        active: data.activeBookings,
        pending: data.pendingBookings,
        cancelled: data.cancelledBookings
    };
    
    const statusChart = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
            labels: ['Completed', 'Confirmed', 'Active', 'Pending', 'Cancelled'],
            datasets: [{
                data: [
                    statusData.completed,
                    statusData.confirmed,
                    statusData.active,
                    statusData.pending,
                    statusData.cancelled
                ],
                backgroundColor: [
                    '#27ae60',
                    '#3498db',
                    '#f39c12',
                    '#95a5a6',
                    '#e74c3c'
                ]
            }]
        },
        options: {
            responsive: true
        }
    });
    currentCharts.push(statusChart);
}

function createBookingsCharts(data, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="chart-container">
            <h3>Bookings by Status</h3>
            <canvas id="bookingsByStatusChart"></canvas>
        </div>
        <div class="chart-container">
            <h3>Revenue by Status</h3>
            <canvas id="revenueByStatusChart"></canvas>
        </div>
    `;

    // Bookings by Status Chart
    const statusCtx = document.getElementById('bookingsByStatusChart').getContext('2d');
    const statusLabels = Object.keys(data.statusCounts);
    const statusCounts = Object.values(data.statusCounts);
    
    const statusChart = new Chart(statusCtx, {
        type: 'bar',
        data: {
            labels: statusLabels,
            datasets: [{
                label: 'Number of Bookings',
                data: statusCounts,
                backgroundColor: '#3498db'
            }]
        },
        options: {
            responsive: true
        }
    });
    currentCharts.push(statusChart);

    // Revenue by Status Chart
    const revenueCtx = document.getElementById('revenueByStatusChart').getContext('2d');
    const revenueLabels = Object.keys(data.revenueByStatus);
    const revenueData = Object.values(data.revenueByStatus);
    
    const revenueChart = new Chart(revenueCtx, {
        type: 'bar',
        data: {
            labels: revenueLabels,
            datasets: [{
                label: 'Revenue (Ksh)',
                data: revenueData,
                backgroundColor: '#27ae60'
            }]
        },
        options: {
            responsive: true
        }
    });
    currentCharts.push(revenueChart);
}

function createRevenueCharts(data, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="chart-container">
            <h3>Revenue Trend</h3>
            <canvas id="revenueTrendChart"></canvas>
        </div>
        <div class="chart-container">
            <h3>Revenue by Payment Method</h3>
            <canvas id="revenueByMethodChart"></canvas>
        </div>
    `;

    // Revenue Trend Chart
    const trendCtx = document.getElementById('revenueTrendChart').getContext('2d');
    const dates = Object.keys(data.revenueByDate).sort();
    const revenueData = dates.map(date => data.revenueByDate[date]);
    
    const trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Revenue (Ksh)',
                data: revenueData,
                borderColor: '#27ae60',
                backgroundColor: 'rgba(39, 174, 96, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    currentCharts.push(trendChart);

    // Revenue by Method Chart
    const methodCtx = document.getElementById('revenueByMethodChart').getContext('2d');
    const methodLabels = Object.keys(data.revenueByMethod);
    const methodData = Object.values(data.revenueByMethod);
    
    const methodChart = new Chart(methodCtx, {
        type: 'pie',
        data: {
            labels: methodLabels,
            datasets: [{
                data: methodData,
                backgroundColor: [
                    '#3498db',
                    '#27ae60',
                    '#f39c12',
                    '#e74c3c',
                    '#9b59b6'
                ]
            }]
        },
        options: {
            responsive: true
        }
    });
    currentCharts.push(methodChart);
}

function createPopularItemsCharts(data, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="chart-container">
            <h3>Most Booked Items</h3>
            <canvas id="popularItemsChart"></canvas>
        </div>
        <div class="chart-container">
            <h3>Revenue by Item</h3>
            <canvas id="revenueByItemChart"></canvas>
        </div>
    `;

    // Popular Items Chart
    const itemsCtx = document.getElementById('popularItemsChart').getContext('2d');
    const itemNames = data.popularItems.map(item => item.name);
    const itemBookings = data.popularItems.map(item => item.bookings);
    
    const itemsChart = new Chart(itemsCtx, {
        type: 'bar',
        data: {
            labels: itemNames,
            datasets: [{
                label: 'Number of Bookings',
                data: itemBookings,
                backgroundColor: '#3498db'
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    currentCharts.push(itemsChart);

    // Revenue by Item Chart
    const revenueCtx = document.getElementById('revenueByItemChart').getContext('2d');
    const itemRevenue = data.popularItems.map(item => item.revenue);
    
    const revenueChart = new Chart(revenueCtx, {
        type: 'bar',
        data: {
            labels: itemNames,
            datasets: [{
                label: 'Revenue (Ksh)',
                data: itemRevenue,
                backgroundColor: '#27ae60'
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y'
        }
    });
    currentCharts.push(revenueChart);
}

function createCustomerCharts(data, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="chart-container">
            <h3>Top Customers by Revenue</h3>
            <canvas id="topCustomersChart"></canvas>
        </div>
    `;

    // Top Customers Chart
    const customersCtx = document.getElementById('topCustomersChart').getContext('2d');
    const customerNames = data.topCustomers.slice(0, 10).map(customer => customer.name);
    const customerRevenue = data.topCustomers.slice(0, 10).map(customer => customer.totalSpent);
    
    const customersChart = new Chart(customersCtx, {
        type: 'bar',
        data: {
            labels: customerNames,
            datasets: [{
                label: 'Revenue (Ksh)',
                data: customerRevenue,
                backgroundColor: '#9b59b6'
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    currentCharts.push(customersChart);
}

// Detailed data display functions
function displayPerformanceDetails(data, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="detailed-table">
            <h3>Recent Bookings</h3>
            <table>
                <thead>
                    <tr>
                        <th>Booking ID</th>
                        <th>Customer</th>
                        <th>Phone</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.bookings.map(booking => `
                        <tr>
                            <td>${booking.id.substring(0, 8)}</td>
                            <td>${booking.customer_name || 'N/A'}</td>
                            <td>${booking.customer_phone || 'N/A'}</td>
                            <td>Ksh ${(booking.total_amount || 0).toLocaleString()}</td>
                            <td><span class="status-${booking.status}">${booking.status}</span></td>
                            <td>${formatDate(new Date(booking.created_at))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function displayBookingsDetails(data, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="detailed-table">
            <h3>All Bookings</h3>
            <table>
                <thead>
                    <tr>
                        <th>Booking ID</th>
                        <th>Customer</th>
                        <th>Items</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.bookings.map(booking => `
                        <tr>
                            <td>${booking.id.substring(0, 8)}</td>
                            <td>${booking.customer_name || 'N/A'}</td>
                            <td>${booking.booking_items?.length || 0} items</td>
                            <td>Ksh ${(booking.total_amount || 0).toLocaleString()}</td>
                            <td><span class="status-${booking.status}">${booking.status}</span></td>
                            <td>${formatDate(new Date(booking.created_at))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function displayRevenueDetails(data, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="detailed-table">
            <h3>Payment History</h3>
            <table>
                <thead>
                    <tr>
                        <th>Payment ID</th>
                        <th>Booking ID</th>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Method</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.payments.map(payment => `
                        <tr>
                            <td>${payment.id.substring(0, 8)}</td>
                            <td>${payment.booking_id?.substring(0, 8) || 'N/A'}</td>
                            <td>${payment.bookings?.customer_name || 'N/A'}</td>
                            <td>Ksh ${(payment.amount || 0).toLocaleString()}</td>
                            <td><span class="status-${payment.status}">${payment.status}</span></td>
                            <td>${payment.payment_method || 'N/A'}</td>
                            <td>${formatDate(new Date(payment.created_at))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function displayPopularDetails(data, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="detailed-table">
            <h3>Popular Items Ranking</h3>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Item Name</th>
                        <th>Number of Bookings</th>
                        <th>Total Quantity</th>
                        <th>Total Revenue</th>
                        <th>Avg per Booking</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.popularItems.map((item, index) => `
                        <tr>
                            <td>#${index + 1}</td>
                            <td>${item.name}</td>
                            <td>${item.bookings}</td>
                            <td>${item.quantity}</td>
                            <td>Ksh ${item.revenue.toLocaleString()}</td>
                            <td>Ksh ${Math.round(item.revenue / item.bookings).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function displayCustomerDetails(data, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="detailed-table">
            <h3>Top Customers</h3>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Customer Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Total Bookings</th>
                        <th>Total Spent</th>
                        <th>Last Booking</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.topCustomers.map((customer, index) => `
                        <tr>
                            <td>#${index + 1}</td>
                            <td>${customer.name}</td>
                            <td>${customer.phone || 'N/A'}</td>
                            <td>${customer.email || 'N/A'}</td>
                            <td>${customer.bookings}</td>
                            <td>Ksh ${customer.totalSpent.toLocaleString()}</td>
                            <td>${formatDate(new Date(customer.lastBooking))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Export functions
function exportToExcel() {
    if (!currentReportData) {
        alert('No report data to export');
        return;
    }

    try {
        const reportType = document.getElementById('reportType').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        
        const ws = XLSX.utils.json_to_sheet(prepareDataForExport(currentReportData, reportType));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Report');
        
        const fileName = `Tamasha_Report_${reportType}_${startDate}_to_${endDate}.xlsx`;
        XLSX.writeFile(wb, fileName);
    } catch (error) {
        console.error('Export error:', error);
        alert('Error exporting to Excel');
    }
}

function exportToPDF() {
    if (!currentReportData) {
        alert('No report data to export');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const reportType = document.getElementById('reportType').value;
        const period = document.getElementById('reportPeriod').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const periodText = getPeriodText(period, startDate, endDate);
        
        // Add title and header
        doc.setFontSize(16);
        doc.text('Tamasha Event Rentals Report', 20, 20);
        
        doc.setFontSize(12);
        doc.text(`Period: ${periodText}`, 20, 30);
        doc.text(`Report Type: ${reportType.charAt(0).toUpperCase() + reportType.slice(1)}`, 20, 40);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 50);
        
        // Add summary data as table
        const summaryData = prepareSummaryDataForPDF(currentReportData, reportType);
        doc.autoTable({
            startY: 60,
            head: [['Metric', 'Value']],
            body: summaryData,
            theme: 'grid'
        });
        
        const fileName = `Tamasha_Report_${reportType}_${new Date().getTime()}.pdf`;
        doc.save(fileName);
    } catch (error) {
        console.error('PDF export error:', error);
        alert('Error exporting to PDF');
    }
}

function prepareDataForExport(data, reportType) {
    switch(reportType) {
        case 'performance':
            return data.bookings.map(booking => ({
                'Booking ID': booking.id,
                'Customer': booking.customer_name,
                'Phone': booking.customer_phone,
                'Amount': booking.total_amount,
                'Status': booking.status,
                'Date': formatDate(new Date(booking.created_at))
            }));
        case 'bookings':
            return data.bookings.map(booking => ({
                'Booking ID': booking.id,
                'Customer': booking.customer_name,
                'Items Count': booking.booking_items?.length || 0,
                'Amount': booking.total_amount,
                'Status': booking.status,
                'Date': formatDate(new Date(booking.created_at))
            }));
        case 'revenue':
            return data.payments.map(payment => ({
                'Payment ID': payment.id,
                'Booking ID': payment.booking_id,
                'Customer': payment.bookings?.customer_name,
                'Amount': payment.amount,
                'Status': payment.status,
                'Method': payment.payment_method,
                'Date': formatDate(new Date(payment.created_at))
            }));
        case 'popular':
            return data.popularItems.map((item, index) => ({
                'Rank': index + 1,
                'Item Name': item.name,
                'Bookings': item.bookings,
                'Quantity': item.quantity,
                'Revenue': item.revenue,
                'Average per Booking': Math.round(item.revenue / item.bookings)
            }));
        case 'customer':
            return data.topCustomers.map((customer, index) => ({
                'Rank': index + 1,
                'Customer Name': customer.name,
                'Phone': customer.phone,
                'Email': customer.email,
                'Total Bookings': customer.bookings,
                'Total Spent': customer.totalSpent,
                'Last Booking': formatDate(new Date(customer.lastBooking))
            }));
        default:
            return [];
    }
}

function prepareSummaryDataForPDF(data, reportType) {
    switch(reportType) {
        case 'performance':
            return [
                ['Total Bookings', data.totalBookings],
                ['Completed Bookings', data.completedBookings],
                ['Total Revenue', `Ksh ${data.totalRevenue.toLocaleString()}`],
                ['Average Booking Value', `Ksh ${Math.round(data.avgBookingValue).toLocaleString()}`],
                ['Completion Rate', `${data.completionRate.toFixed(1)}%`]
            ];
        case 'bookings':
            return [
                ['Total Bookings', data.total],
                ['Completed', data.statusCounts.completed || 0],
                ['Confirmed', data.statusCounts.confirmed || 0],
                ['Active', data.statusCounts.active || 0],
                ['Pending', data.statusCounts.pending || 0]
            ];
        case 'revenue':
            return [
                ['Total Revenue', `Ksh ${data.totalRevenue.toLocaleString()}`],
                ['Completed Payments', data.completedPayments.length],
                ['Pending Revenue', `Ksh ${data.pendingRevenue.toLocaleString()}`],
                ['Success Rate', `${((data.completedPayments.length / data.paymentCount) * 100).toFixed(1)}%`]
            ];
        case 'popular':
            const totalRevenue = data.popularItems.reduce((sum, item) => sum + item.revenue, 0);
            const totalBookings = data.popularItems.reduce((sum, item) => sum + item.bookings, 0);
            return [
                ['Items Tracked', data.popularItems.length],
                ['Most Booked Item', data.popularItems[0]?.name || 'N/A'],
                ['Total Revenue', `Ksh ${totalRevenue.toLocaleString()}`],
                ['Total Bookings', totalBookings]
            ];
        case 'customer':
            const customerRevenue = data.topCustomers.reduce((sum, customer) => sum + customer.totalSpent, 0);
            return [
                ['Total Customers', data.totalCustomers],
                ['Total Bookings', data.totalBookings],
                ['Total Revenue', `Ksh ${customerRevenue.toLocaleString()}`],
                ['Average per Customer', `Ksh ${Math.round(customerRevenue / data.totalCustomers).toLocaleString()}`]
            ];
        default:
            return [['Summary', 'Data not available for PDF export']];
    }
}

// Utility functions
function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

function getPeriodText(period, startDate, endDate) {
    if (period === 'custom') {
        return `${startDate} to ${endDate}`;
    } else {
        return period.charAt(0).toUpperCase() + period.slice(1);
    }
}

function showLoading() {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.classList.remove('hidden');
}

function hideLoading() {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.classList.add('hidden');
}

function hideResults() {
    const resultsDiv = document.getElementById('reportResults');
    if (resultsDiv) resultsDiv.classList.add('hidden');
}

function showError(message = 'Error generating report. Please try again.') {
    const errorState = document.getElementById('errorState');
    if (errorState) {
        errorState.innerHTML = `<p>${message}</p><button onclick="hideError()" class="retry-btn">Retry</button>`;
        errorState.classList.remove('hidden');
    }
}

function hideError() {
    const errorState = document.getElementById('errorState');
    if (errorState) errorState.classList.add('hidden');
}

function destroyCharts() {
    currentCharts.forEach(chart => chart.destroy());
    currentCharts = [];
}

// Make functions available globally for HTML onclick handlers
window.hideError = hideError;