import { supabase } from "./supabase-client.js";
import { formatDate, formatCurrency } from "./utils.js";

let currentUser = null;
let cart = [];
let bookingEventsBound = false;
let dashboardInitialized = false;
let userRole = 'user';

document.addEventListener("DOMContentLoaded", async () => {
  console.log("User Dashboard loading...");
  
  if (dashboardInitialized) return;
  dashboardInitialized = true;
  
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error("Session error:", error.message);
      showError("Authentication error: " + error.message);
      return;
    }
    
    if (!session?.user) {
      console.log("No user session, redirecting to login");
      setTimeout(() => {
        window.location.href = "/auth/login.html";
      }, 1000);
      return;
    }
    
    currentUser = session.user;
    console.log("User authenticated:", currentUser.email);
    
    // Ensure user has a profile
    await ensureUserProfile();
    
    userRole = await getUserRole(currentUser.id);
    console.log("User role:", userRole);
    
    if (userRole === 'admin') {
      console.log("Admin user detected, redirecting to admin dashboard");
      window.location.href = "/admin/admin-dashboard.html";
      return;
    }
    
    showDashboard();
    await loadUserProfile();
    setupNavigation();
    await loadPage("welcome");
    
  } catch (err) {
    console.error("Dashboard initialization error:", err.message);
    showError("Failed to load dashboard: " + err.message);
  }
});

async function ensureUserProfile() {
  try {
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.warn("Error checking profile:", checkError.message);
    }

    if (!existingProfile) {
      console.log("Creating profile for user:", currentUser.id);
      
      const { data: newProfile, error: createError } = await supabase
        .from("profiles")
        .insert([
          {
            id: currentUser.id,
            email: currentUser.email,
            full_name: currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'User',
            role: 'user',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (createError) {
        console.error("Failed to create profile:", createError.message);
      } else {
        console.log("Profile created successfully");
      }
    }
  } catch (err) {
    console.error("Error ensuring user profile:", err.message);
  }
}

async function getUserRole(userId) {
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (error || !profile) {
      console.warn("Could not fetch user role:", error?.message || "No profile found");
      return 'user';
    }

    return profile.role || 'user';
  } catch (err) {
    console.error("Error getting user role:", err.message);
    return 'user';
  }
}

function showDashboard() {
  const loadingOverlay = document.getElementById("loadingOverlay");
  const dashboardContainer = document.querySelector(".dashboard-container");
  const errorMessage = document.getElementById("errorMessage");
  
  if (loadingOverlay) loadingOverlay.style.display = "none";
  if (errorMessage) errorMessage.style.display = "none";
  if (dashboardContainer) dashboardContainer.style.display = "flex";
}

function showError(message) {
  const loadingOverlay = document.getElementById("loadingOverlay");
  const errorMessage = document.getElementById("errorMessage");
  const errorText = document.getElementById("errorText");
  
  if (loadingOverlay) loadingOverlay.style.display = "none";
  if (errorMessage) errorMessage.style.display = "block";
  if (errorText) errorText.textContent = message;
}

async function loadUserProfile() {
  if (!currentUser) return;

  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error || !profile) {
      console.error("Profile load error:", error?.message || "No profile found");
      updateProfileDisplay({
        email: currentUser.email,
        full_name: currentUser.user_metadata?.full_name || "User",
        phone: "Not provided",
        address: "Not provided",
        role: userRole
      });
      return;
    }

    updateProfileDisplay(profile);
  } catch (err) {
    console.error("Profile load exception:", err.message);
    updateProfileDisplay({
      email: currentUser.email,
      full_name: "User",
      phone: "Not provided",
      address: "Not provided",
      role: userRole
    });
  }
}

function updateProfileDisplay(profile) {
  const userNameEl = document.getElementById("userName");
  const userEmailEl = document.getElementById("userEmail");
  const userPhoneEl = document.getElementById("userPhone");
  const userAddressEl = document.getElementById("userAddress");
  
  if (userNameEl) userNameEl.textContent = profile.full_name || "User";
  if (userEmailEl) userEmailEl.textContent = profile.email || currentUser?.email || "";
  if (userPhoneEl) userPhoneEl.textContent = profile.phone || "Not provided";
  if (userAddressEl) userAddressEl.textContent = profile.address || "Not provided";
  
  const userRoleEl = document.getElementById("userRole");
  if (userRoleEl) {
    userRoleEl.textContent = profile.role === 'admin' ? 'Administrator' : 'User';
  }
}

function setupNavigation() {
  const navLinks = document.querySelectorAll(".nav-link[data-page]");
  navLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      navLinks.forEach(l => l.classList.remove("active"));
      e.currentTarget.classList.add("active");
      const page = e.currentTarget.getAttribute("data-page");
      loadPage(page);
    });
  });

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await supabase.auth.signOut();
        dashboardInitialized = false;
        window.location.href = "/auth/login.html";
      } catch (err) {
        console.error("Logout error:", err.message);
        dashboardInitialized = false;
        window.location.href = "/auth/login.html";
      }
    });
  }

  if (userRole === 'admin') {
    const adminLink = document.createElement('a');
    adminLink.href = '#';
    adminLink.className = 'nav-link admin-access';
    adminLink.innerHTML = '🔧 Admin Panel';
    adminLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = "/admin/admin-dashboard.html";
    });
    
    const nav = document.querySelector('.dashboard-nav');
    if (nav) {
      nav.appendChild(adminLink);
    }
  }
}

async function loadPage(page) {
  const content = document.getElementById("content");
  if (!content) return;

  try {
    switch (page) {
      case "welcome":
        content.innerHTML = loadWelcomePage();
        setupWelcomePage();
        break;
      case "book":
        content.innerHTML = await loadBookItemsPage();
        setupBookingPage();
        break;
      case "notifications":
        content.innerHTML = loadNotificationsPage();
        await loadUserNotifications();
        break;
      case "profile":
        content.innerHTML = loadProfilePage();
        setupProfilePage();
        break;
      default:
        content.innerHTML = loadWelcomePage();
        setupWelcomePage();
    }
  } catch (err) {
    console.error(`Error loading page ${page}:`, err.message);
    content.innerHTML = `<div class="error-message"><p>Error loading page content: ${err.message}</p></div>`;
  }
}

function loadWelcomePage() {
  const displayName = currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0] || 'User';
  
  return `
    <div class="welcome-page">
      <div class="welcome-header">
        <h2>Welcome back, ${displayName}!</h2>
        <p class="user-role">${userRole === 'admin' ? 'Administrator Account' : 'User Account'}</p>
      </div>
      
      <div class="dashboard-cards">
        <div class="dashboard-card">
          <div class="card-icon">📅</div>
          <h3>Quick Booking</h3>
          <p>Book rental items for your events</p>
          <button class="card-action-btn" data-page="book">Book Now</button>
        </div>
        
        <div class="dashboard-card">
          <div class="card-icon">📋</div>
          <h3>My Bookings</h3>
          <p>View and manage your bookings</p>
          <a href="/user/pages/my-bookings.html" class="card-action-btn">View Bookings</a>
        </div>
        
        <div class="dashboard-card">
          <div class="card-icon">💳</div>
          <h3>Payments</h3>
          <p>View payment history and receipts</p>
          <a href="/user/pages/payments.html" class="card-action-btn">View Payments</a>
        </div>
        
        <div class="dashboard-card">
          <div class="card-icon">👤</div>
          <h3>Profile</h3>
          <p>Manage your account information</p>
          <button class="card-action-btn" data-page="profile">Edit Profile</button>
        </div>
      </div>
      
      <div class="recent-activity">
        <h3>Recent Activity</h3>
        <div id="recentActivity">
          <p>Loading your recent activity...</p>
        </div>
      </div>
    </div>
  `;
}

function setupWelcomePage() {
  document.querySelectorAll('.card-action-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const page = e.target.getAttribute('data-page');
      if (page) {
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        const targetLink = document.querySelector(`[data-page="${page}"]`);
        if (targetLink) targetLink.classList.add('active');
        loadPage(page);
      }
    });
  });
  
  loadRecentActivity();
}

async function loadRecentActivity() {
  const activityElement = document.getElementById('recentActivity');
  if (!activityElement) return;

  try {
    const { data: bookings, error } = await supabase
      .from("bookings")
      .select("*, rental_items(name)")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) {
      activityElement.innerHTML = '<p>Unable to load recent activity</p>';
      return;
    }

    if (!bookings || bookings.length === 0) {
      activityElement.innerHTML = `
        <div class="no-activity">
          <p>No recent activity</p>
          <p>Start by <a href="#" class="nav-link" data-page="book">booking some items</a></p>
        </div>
      `;
      return;
    }

    activityElement.innerHTML = bookings.map(booking => `
      <div class="activity-item">
        <div class="activity-icon">📅</div>
        <div class="activity-content">
          <strong>${booking.rental_items?.name || 'Rental Item'}</strong>
          <p>${formatDate(booking.start_date)} - ${formatDate(booking.end_date)}</p>
          <span class="status ${booking.status}">${booking.status}</span>
        </div>
        <div class="activity-amount">${formatCurrency(booking.total_amount || booking.total_price || 0)}</div>
      </div>
    `).join('');

  } catch (err) {
    console.error("Error loading recent activity:", err.message);
    activityElement.innerHTML = '<p>Error loading recent activity</p>';
  }
}

async function loadBookItemsPage() {
  try {
    const { data: items, error } = await supabase
      .from("rental_items")
      .select("*")
      .eq("available", true);

    if (error) {
      console.error("Items load error:", error.message);
      return getFallbackItemsPage();
    }

    if (!items || items.length === 0) {
      return `
        <div class="book-items-page">
          <h2>Book Rental Items</h2>
          <div class="no-items">
            <p>No items available for booking at the moment.</p>
            <p>Please check back later or contact support.</p>
          </div>
        </div>
      `;
    }

    let itemsHTML = items.map(item => `
      <div class="item-card" data-id="${item.id}">
        <div class="item-image">
          <img src="/assets/images/${item.image}" alt="${item.name}" onerror="this.src='/assets/images/placeholder.jpg'">
        </div>
        <div class="item-info">
          <h3>${item.name}</h3>
          <p class="item-description">${item.description || 'No description available'}</p>
          <p class="price">${formatCurrency(item.price)} per day</p>
          <p class="stock ${item.quantity < 5 ? 'low-stock' : ''}">Available: ${item.quantity}</p>
          <div class="quantity-controls">
            <label for="qty-${item.id}">Quantity:</label>
            <input type="number" id="qty-${item.id}" class="qty-input" min="0" max="${item.quantity}" value="0" data-item-id="${item.id}">
          </div>
          <p class="subtotal">Subtotal: ${formatCurrency(0)}</p>
        </div>
      </div>
    `).join("");

    return `
      <div class="book-items-page">
        <h2>Book Rental Items</h2>
        
        <div class="booking-instructions">
          <p>Select your dates and choose the items you want to rent:</p>
        </div>
        
        <div class="date-selection">
          <div class="form-group">
            <label for="startDate">Start Date:</label>
            <input type="date" id="startDate" required min="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label for="endDate">End Date:</label>
            <input type="date" id="endDate" required min="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        
        <div class="items-grid">${itemsHTML}</div>
        
        <div class="cart-summary-container">
          <div class="cart-summary">
            <div class="cart-header">
              <h3>Cart Summary</h3>
              <span class="cart-badge">${cart.length} items</span>
            </div>
            <div class="cart-items-scrollable" id="cartItems">
              <div class="empty-cart">Your cart is empty</div>
            </div>
            <div class="grand-total">
              <h3>Grand Total: <span id="grandTotal">${formatCurrency(0)}</span></h3>
            </div>
            <button id="checkoutBtn" class="checkout-btn">Proceed to Checkout</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Book items page error:", err.message);
    return getFallbackItemsPage();
  }
}

function getFallbackItemsPage() {
  const fallbackItems = [
    { id: '1', name: 'Party Tent', price: 5000, quantity: 5, image: 'tent.jpg', description: 'Large event tent' },
    { id: '2', name: 'Chairs', price: 100, quantity: 100, image: 'chairs.jpg', description: 'Comfortable event chairs' },
    { id: '3', name: 'Sound System', price: 3000, quantity: 3, image: 'sound.jpg', description: 'Professional audio equipment' },
    { id: '4', name: 'Tables', price: 500, quantity: 20, image: 'tables.jpg', description: 'Sturdy event tables' }
  ];

  let itemsHTML = fallbackItems.map(item => `
    <div class="item-card" data-id="${item.id}">
      <div class="item-image">
        <img src="/assets/images/${item.image}" alt="${item.name}" onerror="this.src='/assets/images/placeholder.jpg'">
      </div>
      <div class="item-info">
        <h3>${item.name}</h3>
        <p class="item-description">${item.description}</p>
        <p class="price">${formatCurrency(item.price)} per day</p>
        <p class="stock ${item.quantity < 5 ? 'low-stock' : ''}">Available: ${item.quantity}</p>
        <div class="quantity-controls">
          <label for="qty-${item.id}">Quantity:</label>
          <input type="number" id="qty-${item.id}" class="qty-input" min="0" max="${item.quantity}" value="0" data-item-id="${item.id}">
        </div>
        <p class="subtotal">Subtotal: ${formatCurrency(0)}</p>
      </div>
    </div>
  `).join("");

  return `
    <div class="book-items-page">
      <h2>Book Rental Items</h2>
      <div class="demo-notice">
        <p>⚠️ Using demo data - Some features may be limited</p>
      </div>
      
      <div class="date-selection">
        <div class="form-group">
          <label for="startDate">Start Date:</label>
          <input type="date" id="startDate" required min="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label for="endDate">End Date:</label>
          <input type="date" id="endDate" required min="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>
      
      <div class="items-grid">${itemsHTML}</div>
      
      <div class="cart-summary-container">
        <div class="cart-summary">
          <div class="cart-header">
            <h3>Cart Summary</h3>
            <span class="cart-badge">${cart.length} items</span>
          </div>
          <div class="cart-items-scrollable" id="cartItems">
            <div class="empty-cart">Your cart is empty</div>
          </div>
          <div class="grand-total">
            <h3>Grand Total: <span id="grandTotal">${formatCurrency(0)}</span></h3>
          </div>
          <button id="checkoutBtn" class="checkout-btn">Proceed to Checkout</button>
        </div>
      </div>
    </div>
  `;
}

function setupBookingPage() {
  const today = new Date().toISOString().split('T')[0];
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  
  if (startDateInput) startDateInput.min = today;
  if (endDateInput) endDateInput.min = today;
  
  if (startDateInput && endDateInput) {
    startDateInput.addEventListener('change', () => {
      if (startDateInput.value) {
        endDateInput.min = startDateInput.value;
        if (endDateInput.value && endDateInput.value < startDateInput.value) {
          endDateInput.value = startDateInput.value;
        }
      }
      updateGrandTotal();
    });

    endDateInput.addEventListener('change', () => {
      updateGrandTotal();
    });
  }

  document.querySelectorAll('.qty-input').forEach(input => {
    input.addEventListener('input', handleQuantityChange);
    input.addEventListener('change', handleQuantityChange);
  });

  const checkoutBtn = document.getElementById("checkoutBtn");
  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", async () => {
      if (cart.length === 0) {
        alert("Please add items to cart");
        return;
      }
      const startDate = document.getElementById("startDate").value;
      const endDate = document.getElementById("endDate").value;

      if (!startDate || !endDate) {
        alert("Please select start and end dates");
        return;
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end <= start) {
        alert("End date must be after start date");
        return;
      }

      const rentalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      const dailyTotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
      const finalTotal = dailyTotal * rentalDays;
      
      try {
        // Get customer details from user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, email, phone, address')
          .eq('id', currentUser.id)
          .maybeSingle();

        let customerName = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Customer';
        let customerEmail = currentUser.email || 'customer@example.com';
        let customerPhone = 'Not provided';
        let customerAddress = 'Not provided';

        if (!profileError && profile) {
          customerName = profile.full_name || customerName;
          customerEmail = profile.email || customerEmail;
          customerPhone = profile.phone || customerPhone;
          customerAddress = profile.address || customerAddress;
        }

        console.log("Creating booking for:", customerName, customerEmail, customerPhone, customerAddress);

        // Use total_price to match database column
        const { data: booking, error } = await supabase
          .from('bookings')
          .insert([
            {
              user_id: currentUser.id,
              customer_name: customerName,
              customer_email: customerEmail,
              customer_phone: customerPhone,
              customer_address: customerAddress,
              start_date: startDate,
              end_date: endDate,
              total_price: finalTotal,
              status: 'pending',
              items_json: cart
            }
          ])
          .select()
          .single();

        if (error) throw error;

        console.log("Booking created successfully:", booking.id);

        // Store all data for checkout page
        localStorage.setItem("bookingCart", JSON.stringify(cart));
        localStorage.setItem("bookingDates", JSON.stringify({ 
          startDate, 
          endDate,
          rentalDays,
          dailyTotal,
          finalTotal
        }));
        localStorage.setItem("bookingId", booking.id);
        localStorage.setItem("totalAmount", finalTotal.toString());
        localStorage.setItem("customerName", customerName);
        localStorage.setItem("customerEmail", customerEmail);
        localStorage.setItem("customerPhone", customerPhone);
        localStorage.setItem("customerAddress", customerAddress);

        console.log("Redirecting to checkout page...");
        window.location.href = "checkout.html";

      } catch (err) {
        console.error("Booking creation error:", err.message);
        alert("Failed to create booking: " + err.message);
      }
    });
  }
}

function handleQuantityChange(e) {
  const input = e.target;
  const itemId = input.dataset.itemId;
  const itemCard = input.closest('.item-card');
  const stockText = itemCard.querySelector('.stock').textContent;
  const stock = parseInt(stockText.split(':')[1].trim(), 10);
  
  let quantity = parseInt(input.value, 10) || 0;
  
  // Validate the input
  if (quantity < 0) {
    quantity = 0;
    input.value = 0;
  } else if (quantity > stock) {
    quantity = stock;
    input.value = stock;
    alert(`Maximum available quantity is ${stock}`);
  }
  
  updateCart(itemId, quantity);
  updateSubtotal(itemCard, quantity);
  updateGrandTotal();
  updateCartDisplay();
}

function updateCart(itemId, quantity) {
  const existingItem = cart.find(item => item.id === itemId);
  if (existingItem) {
    if (quantity === 0) {
      cart = cart.filter(item => item.id !== itemId);
    } else {
      existingItem.quantity = quantity;
    }
  } else if (quantity > 0) {
    const itemCard = document.querySelector(`[data-id="${itemId}"]`);
    const priceText = itemCard.querySelector(".price").textContent;
    const price = parseInt(priceText.replace(/[^\d]/g, ""), 10) || 0;
    const name = itemCard.querySelector("h3").textContent;
    cart.push({ id: itemId, name, price, quantity });
  }
}

function updateSubtotal(itemCard, quantity) {
  const priceText = itemCard.querySelector(".price").textContent;
  const price = parseInt(priceText.replace(/[^\d]/g, ""), 10) || 0;
  const subtotal = price * quantity;
  const subtotalEl = itemCard.querySelector(".subtotal");
  if (subtotalEl) subtotalEl.textContent = `Subtotal: ${formatCurrency(subtotal)}`;
}

function updateGrandTotal() {
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  
  let rentalDays = 1;
  if (startDateInput && endDateInput && startDateInput.value && endDateInput.value) {
    const start = new Date(startDateInput.value);
    const end = new Date(endDateInput.value);
    rentalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }
  
  const dailyTotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  const grandTotal = dailyTotal * rentalDays;
  
  const grandTotalEl = document.getElementById("grandTotal");
  if (grandTotalEl) {
    grandTotalEl.textContent = formatCurrency(grandTotal);
    // Update the label to show it includes rental days
    const grandTotalLabel = grandTotalEl.closest('.grand-total').querySelector('h3');
    if (grandTotalLabel && rentalDays > 1) {
      grandTotalLabel.innerHTML = `Grand Total (${rentalDays} days): <span id="grandTotal">${formatCurrency(grandTotal)}</span>`;
    } else if (grandTotalLabel) {
      grandTotalLabel.innerHTML = `Grand Total: <span id="grandTotal">${formatCurrency(grandTotal)}</span>`;
    }
  }
}

function updateCartDisplay() {
  const cartItemsEl = document.getElementById("cartItems");
  const cartBadge = document.querySelector('.cart-badge');
  
  if (!cartItemsEl) return;

  if (cart.length === 0) {
    cartItemsEl.innerHTML = '<div class="empty-cart">Your cart is empty</div>';
    if (cartBadge) cartBadge.textContent = '0 items';
    return;
  }

  cartItemsEl.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <span class="cart-item-name">${item.name}</span>
        <span class="cart-item-quantity">${item.quantity} x ${formatCurrency(item.price)}/day</span>
      </div>
      <span class="cart-item-price">${formatCurrency(item.price * item.quantity)}/day</span>
    </div>
  `).join('');

  if (cartBadge) cartBadge.textContent = `${cart.length} ${cart.length === 1 ? 'item' : 'items'}`;
}

function loadNotificationsPage() {
  return `
    <div class="notifications-page">
      <div class="page-header">
        <h2>Notifications</h2>
        <button class="refresh-btn" id="refreshNotifications">Refresh</button>
      </div>
      <div id="notificationsList">
        <div class="loading">Loading notifications...</div>
      </div>
    </div>
  `;
}

async function loadUserNotifications() {
  const notificationsList = document.getElementById("notificationsList");
  if (!notificationsList) return;

  try {
    const { data: bookings, error } = await supabase
      .from("bookings")
      .select("*, rental_items(name)")
      .eq("user_id", currentUser.id)
      .eq("status", "active")
      .lte("end_date", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("end_date", { ascending: true });

    if (error) {
      notificationsList.innerHTML = '<p>Error loading notifications</p>';
      return;
    }

    let notificationsHTML = '';

    if (bookings && bookings.length > 0) {
      bookings.forEach(booking => {
        const daysUntilReturn = Math.ceil((new Date(booking.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        const urgency = daysUntilReturn <= 1 ? 'urgent' : daysUntilReturn <= 3 ? 'warning' : 'info';
        
        notificationsHTML += `
          <div class="notification-item ${urgency}">
            <div class="notification-icon">📅</div>
            <div class="notification-content">
              <h4>Return Reminder</h4>
              <p>Please return "${booking.rental_items?.name || 'rental item'}" in ${daysUntilReturn} day${daysUntilReturn !== 1 ? 's' : ''}</p>
              <p class="notification-time">Due: ${formatDate(booking.end_date)}</p>
            </div>
          </div>
        `;
      });
    }

    if (!notificationsHTML) {
      notificationsHTML = `
        <div class="notification-item info">
          <div class="notification-icon">👋</div>
          <div class="notification-content">
            <h4>Welcome to Event Rentals!</h4>
            <p>Get started by browsing our available rental items and making your first booking.</p>
          </div>
        </div>
      `;
    }

    notificationsList.innerHTML = notificationsHTML;

    const refreshBtn = document.getElementById('refreshNotifications');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadUserNotifications);
    }

  } catch (err) {
    console.error("Notifications load error:", err.message);
    notificationsList.innerHTML = `
      <div class="error-message">
        <p>Error loading notifications: ${err.message}</p>
      </div>
    `;
  }
}

function loadProfilePage() {
  return `
    <div class="profile-page">
      <h2>My Profile</h2>
      <div class="profile-form-container">
        <form id="profileForm" class="profile-form">
          <div class="form-group">
            <label for="profileName">Full Name</label>
            <input type="text" id="profileName" name="full_name" required>
          </div>
          
          <div class="form-group">
            <label for="profileEmail">Email</label>
            <input type="email" id="profileEmail" name="email" readonly>
            <small>Email cannot be changed</small>
          </div>
          
          <div class="form-group">
            <label for="profilePhone">Phone Number</label>
            <input type="tel" id="profilePhone" name="phone" placeholder="07XXXXXXXX">
          </div>
          
          <div class="form-group">
            <label for="profileAddress">Address</label>
            <textarea id="profileAddress" name="address" rows="3" placeholder="Enter your full address"></textarea>
          </div>
          
          <div class="form-group">
            <label>Account Role</label>
            <input type="text" value="${userRole === 'admin' ? 'Administrator' : 'User'}" readonly>
            <small>Role is managed by system administrators</small>
          </div>
          
          <div class="form-actions">
            <button type="submit" class="save-btn">Save Changes</button>
            <button type="button" class="cancel-btn" data-page="welcome">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function setupProfilePage() {
  loadProfileData();
  
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveProfile();
    });
  }
  
  const cancelBtn = document.querySelector('.cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      const page = e.target.getAttribute('data-page');
      if (page) {
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        const targetLink = document.querySelector(`[data-page="${page}"]`);
        if (targetLink) targetLink.classList.add('active');
        loadPage(page);
      }
    });
  }
}

async function loadProfileData() {
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (!error && profile) {
      document.getElementById('profileName').value = profile.full_name || '';
      document.getElementById('profileEmail').value = profile.email || currentUser.email || '';
      document.getElementById('profilePhone').value = profile.phone || '';
      document.getElementById('profileAddress').value = profile.address || '';
    } else {
      // Set default values if no profile exists
      document.getElementById('profileName').value = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || '';
      document.getElementById('profileEmail').value = currentUser.email || '';
      document.getElementById('profilePhone').value = '';
      document.getElementById('profileAddress').value = '';
    }
  } catch (err) {
    console.error("Error loading profile data:", err.message);
  }
}

async function saveProfile() {
  const saveBtn = document.querySelector('.save-btn');
  const originalText = saveBtn.textContent;
  
  try {
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    
    const formData = {
      full_name: document.getElementById('profileName').value,
      phone: document.getElementById('profilePhone').value,
      address: document.getElementById('profileAddress').value,
      updated_at: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('profiles')
      .update(formData)
      .eq('id', currentUser.id);
    
    if (error) throw error;
    
    alert('Profile updated successfully!');
    await loadUserProfile();
    
  } catch (err) {
    console.error('Error saving profile:', err.message);
    alert('Error saving profile: ' + err.message);
  } finally {
    saveBtn.textContent = originalText;
    saveBtn.disabled = false;
  }
}

window.userDashboard = {
  loadPage,
  getCurrentUser: () => currentUser,
  getUserRole: () => userRole
};