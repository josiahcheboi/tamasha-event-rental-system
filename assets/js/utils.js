// Utility functions
export function formatDate(date) {
    return new Date(date).toISOString().split('T')[0];
}

export function formatCurrency(amount) {
    return `Ksh ${amount.toLocaleString()}`;
}

export function showMessage(element, message, type = 'success') {
    element.textContent = message;
    element.className = `message ${type}`;
    element.style.display = 'block';
    
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

export function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

export function validatePhone(phone) {
    const re = /^\+?254[17]\d{8}$|^0[17]\d{8}$/;
    return re.test(phone);
}

export function generateReceiptNumber() {
    return 'RCP' + Date.now() + Math.floor(Math.random() * 1000);
}