import { supabase } from "./supabase-client.js";

let currentUser = null;
let cart = [];
let bookingDates = {};
let isProcessing = false;

// Formatters
function formatCurrency(amount) {
  return "Ksh " + Number(amount).toLocaleString("en-KE");
}
function formatPhoneNumber(phone) {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    cleaned = "254" + cleaned.substring(1);
  }
  return cleaned;
}

// UI helpers
function showLoading(message) {
  const paymentProcessing = document.getElementById("paymentProcessing");
  if (paymentProcessing) {
    paymentProcessing.classList.remove("hidden");
    const processingMessage = document.getElementById("processingMessage");
    if (processingMessage) processingMessage.textContent = message;
  }
  const checkoutForm = document.getElementById("checkoutForm");
  if (checkoutForm) checkoutForm.style.display = "none";
}
function hideLoading() {
  const paymentProcessing = document.getElementById("paymentProcessing");
  if (paymentProcessing) paymentProcessing.classList.add("hidden");
}
function showSuccess(bookingId, amount) {
  hideLoading();
  const successMessage = document.getElementById("successMessage");
  const successText = successMessage ? successMessage.querySelector("p") : null;
  if (successText) {
    successText.innerHTML = `
      Payment completed successfully!<br>
      <strong>Amount:</strong> ${formatCurrency(amount)}<br>
      <strong>Booking ID:</strong> ${bookingId}<br>
      <br>Your booking has been confirmed automatically.
    `;
  }
  if (successMessage) successMessage.style.display = "block";
  clearLocalStorage();
}
function showError(message, isRetryable = true) {
  hideLoading();
  isProcessing = false;
  const errorElement = document.getElementById("errorMessage");
  const errorText = document.getElementById("errorText");
  const retryBtn = document.getElementById("retryBtn");
  if (errorText) errorText.textContent = message;
  if (retryBtn) retryBtn.style.display = isRetryable ? "block" : "none";
  if (errorElement) errorElement.style.display = "block";
}

// Cart rendering
function renderCartItems() {
  const container = document.getElementById("cartItems");
  if (!container) return; // silently skip if container is missing

  if (!cart || cart.length === 0) {
    container.innerHTML = `<div class="empty">No items selected for checkout.</div>`;
    return;
  }

  // Build rows
  const rows = cart.map((item) => {
    const qty = Number(item.quantity || 1);
    const price = Number(item.price || 0);
    const name = item.name || item.title || "Item";
    const subtotal = qty * price;

    return `
      <div class="cart-row">
        <div class="cart-name"><strong>${name}</strong></div>
        <div class="cart-qty">Qty: ${qty}</div>
        <div class="cart-price">Price: ${formatCurrency(price)}</div>
        <div class="cart-subtotal">Subtotal: ${formatCurrency(subtotal)}</div>
      </div>
    `;
  }).join("");

  // Rental days block (if applicable)
  let rentalBlock = "";
  if (bookingDates?.rentalDays && cart.length > 0 && !bookingDates.finalTotal) {
    const dailyTotal = cart.reduce((t, i) => t + Number(i.price || 0) * Number(i.quantity || 1), 0);
    rentalBlock = `
      <div class="rental-info">
        <div>Daily total: <strong>${formatCurrency(dailyTotal)}</strong></div>
        <div>Rental days: <strong>${bookingDates.rentalDays}</strong></div>
        <div>Items total × days: <strong>${formatCurrency(dailyTotal * bookingDates.rentalDays)}</strong></div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="cart-list">
      ${rows}
    </div>
    ${rentalBlock}
  `;
}

function updateTotals() {
  const grandTotalElement = document.getElementById("grandTotal");
  let grandTotal = 0;

  if (bookingDates?.finalTotal) {
    grandTotal = parseFloat(bookingDates.finalTotal);
  } else if (bookingDates?.rentalDays && cart.length > 0) {
    const dailyTotal = cart.reduce((t, i) => t + Number(i.price || 0) * Number(i.quantity || 1), 0);
    grandTotal = dailyTotal * Number(bookingDates.rentalDays || 1);
  } else {
    grandTotal = cart.reduce((t, i) => t + Number(i.price || 0) * Number(i.quantity || 1), 0);
  }

  if (grandTotalElement) grandTotalElement.textContent = formatCurrency(grandTotal);
  return grandTotal;
}

// Data loading
function loadCheckoutData() {
  try {
    const savedCart = localStorage.getItem("bookingCart");
    const savedDates = localStorage.getItem("bookingDates");
    if (savedCart) cart = JSON.parse(savedCart);
    if (savedDates) bookingDates = JSON.parse(savedDates);
    renderCartItems();
    updateTotals();
    loadCustomerData();
  } catch (error) {
    showError("Error loading booking data");
  }
}

function loadCustomerData() {
  const fields = ["name", "email", "phone", "address"];
  fields.forEach((field) => {
    const saved = localStorage.getItem(`customer${field.charAt(0).toUpperCase() + field.slice(1)}`);
    const el = document.getElementById(field);
    if (saved && el) el.value = saved;
  });
}

// Payment
async function processPayment(phone, amount, bookingId) {
  const response = await fetch("/api/mpesa/stk-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, amount: Math.round(amount), bookingId })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Payment service error: ${JSON.stringify(errorData)}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || "Payment initiation failed");
  }

  return { success: true, checkoutRequestID: result.checkoutRequestID };
}

// Booking
async function createBooking(name, email, phone, address, grandTotal) {
  const bookingData = {
    user_id: currentUser ? currentUser.id : null,
    customer_name: name,
    customer_email: email,
    customer_phone: phone,
    customer_address: address,
    start_date: bookingDates.startDate,
    end_date: bookingDates.endDate,
    total_price: grandTotal,
    status: "confirmed",
    items_json: cart,
    created_at: new Date().toISOString()
  };

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert([bookingData])
    .select()
    .single();

  if (error) throw error;
  return booking.id;
}

// Init
document.addEventListener("DOMContentLoaded", async () => {
  await initializeApp();
  loadCheckoutData();
  setupEventListeners();
  setupCheckoutForm();
});

async function initializeApp() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;
  } catch (error) {
    console.error("Auth error:", error);
  }
}

function setupEventListeners() {
  const retryBtn = document.getElementById("retryBtn");
  if (retryBtn) retryBtn.addEventListener("click", () => {
    const errorMessage = document.getElementById("errorMessage");
    const checkoutForm = document.getElementById("checkoutForm");
    if (errorMessage) errorMessage.style.display = "none";
    if (checkoutForm) checkoutForm.style.display = "block";
    isProcessing = false;
  });

  const dashboardBtn = document.getElementById("dashboardBtn");
  if (dashboardBtn) dashboardBtn.addEventListener("click", () => {
    window.location.href = "/user/user-dashboard.html";
  });

  const viewBookingsBtn = document.getElementById("viewBookingsBtn");
  if (viewBookingsBtn) viewBookingsBtn.addEventListener("click", () => {
    window.location.href = "/user/pages/my-bookings.html";
  });
}

function setupCheckoutForm() {
  const form = document.getElementById("checkoutForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isProcessing) {
      alert("Payment is already being processed. Please wait...");
      return;
    }
    isProcessing = true;

    const name = document.getElementById("name")?.value || "";
    const email = document.getElementById("email")?.value || "";
    const phone = document.getElementById("phone")?.value || "";
    const address = document.getElementById("address")?.value || "";

    if (!name || !email || !address || !phone) {
      alert("Please fill in all fields");
      isProcessing = false;
      return;
    }
    if (!cart || cart.length === 0) {
      alert("No items in cart");
      isProcessing = false;
      return;
    }
    if (!bookingDates?.startDate || !bookingDates?.endDate) {
      alert("Please select booking dates");
      isProcessing = false;
      return;
    }

    const grandTotal = updateTotals(); // ensures UI is in sync and returns total

    try {
      showLoading("Creating booking and initiating payment...");
      const bookingId = await createBooking(name, email, phone, address, grandTotal);
      const formattedPhone = formatPhoneNumber(phone);
      const paymentResult = await processPayment(formattedPhone, grandTotal, bookingId);

      if (paymentResult.success) {
        showSuccess(bookingId, grandTotal);
      }
    } catch (error) {
      console.error("Checkout error:", error);
      showError(`Payment Failed: ${error.message}`);
    }
  });
}

// Storage cleanup
function clearLocalStorage() {
  [
    "bookingCart",
    "bookingDates",
    "totalAmount",
    "customerName",
    "customerEmail",
    "customerPhone",
    "customerAddress"
  ].forEach((key) => localStorage.removeItem(key));
}
