// edit-stock.js - Stock management with modal editing
let currentItems = [];

// Initialize Supabase
function initSupabase() {
    if (!window.supabaseClient) {
        const supabaseUrl = 'https://humeamgpybksjeyjvvsw.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1bWVhbWdweWJrc2pleWp2dnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4NzM3NTIsImV4cCI6MjA3ODQ0OTc1Mn0.DEU5Zfk4PlSmyVD1BFoY9pd3U6k6q4ekZuREa4hoW6g';
        
        if (window.supabase && window.supabase.createClient) {
            window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        }
    }
    return window.supabaseClient;
}

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    setupEventListeners();
    loadStockItems();
});

async function checkAuth() {
    const supabase = initSupabase();
    if (!supabase) {
        setTimeout(checkAuth, 100);
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = '/auth/admin-login.html';
        return;
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = '/auth/admin-login.html';
    });
}

function setupEventListeners() {
    document.getElementById('addItemBtn').addEventListener('click', () => {
        document.getElementById('addModal').style.display = 'block';
    });
}

async function loadStockItems() {
    const stockTable = document.getElementById('stockTable');
    const supabase = initSupabase();
    
    try {
        const { data: items, error } = await supabase
            .from('rental_items')
            .select('*')
            .order('name');

        if (error) throw error;

        currentItems = items || [];
        displayStockItems(currentItems);

    } catch (error) {
        stockTable.innerHTML = `<p class="error">Error loading stock: ${error.message}</p>`;
    }
}

function displayStockItems(items) {
    const stockTable = document.getElementById('stockTable');
    
    if (!items || items.length === 0) {
        stockTable.innerHTML = '<p>No stock items found</p>';
        return;
    }

    stockTable.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Quantity</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr data-id="${item.id}">
                        <td>${item.name}</td>
                        <td>Ksh ${item.price.toLocaleString()}</td>
                        <td>
                            <div class="quantity-controls">
                                <button class="qty-btn" onclick="updateQuantity('${item.id}', -1)">-</button>
                                <span class="quantity">${item.quantity}</span>
                                <button class="qty-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
                            </div>
                        </td>
                        <td>
                            <span class="${item.available ? 'available' : 'unavailable'}">
                                ${item.available ? 'Available' : 'Unavailable'}
                            </span>
                        </td>
                        <td class="stock-actions">
                            <button class="edit-btn" onclick="openEditModal('${item.id}')">Edit</button>
                            <button class="delete-btn" onclick="deleteItem('${item.id}')">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function openEditModal(itemId) {
    const item = currentItems.find(i => i.id === itemId);
    if (!item) return;

    document.getElementById('editItemId').value = itemId;
    document.getElementById('editName').value = item.name;
    document.getElementById('editPrice').value = item.price;
    document.getElementById('editQuantity').value = item.quantity;
    document.getElementById('editAvailable').checked = item.available;
    
    document.getElementById('editModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('editModal').style.display = 'none';
}

function closeAddModal() {
    document.getElementById('addModal').style.display = 'none';
    document.getElementById('addForm').reset();
}

async function saveItem() {
    const supabase = initSupabase();
    const itemId = document.getElementById('editItemId').value;
    const name = document.getElementById('editName').value;
    const price = parseFloat(document.getElementById('editPrice').value);
    const quantity = parseInt(document.getElementById('editQuantity').value);
    const available = document.getElementById('editAvailable').checked;

    if (!name || isNaN(price) || isNaN(quantity)) {
        alert('Please fill all fields correctly');
        return;
    }

    try {
        const { error } = await supabase
            .from('rental_items')
            .update({ 
                name: name,
                price: price,
                quantity: quantity,
                available: available
            })
            .eq('id', itemId);

        if (error) throw error;

        const itemIndex = currentItems.findIndex(i => i.id === itemId);
        if (itemIndex !== -1) {
            currentItems[itemIndex] = { 
                ...currentItems[itemIndex], 
                name, price, quantity, available 
            };
            displayStockItems(currentItems);
        }

        closeModal();

    } catch (error) {
        alert('Error updating item: ' + error.message);
    }
}

async function addNewItem() {
    const supabase = initSupabase();
    const name = document.getElementById('addName').value;
    const price = parseFloat(document.getElementById('addPrice').value);
    const quantity = parseInt(document.getElementById('addQuantity').value);
    const available = document.getElementById('addAvailable').checked;

    if (!name || isNaN(price) || isNaN(quantity)) {
        alert('Please fill all fields correctly');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('rental_items')
            .insert([{
                name: name,
                price: price,
                quantity: quantity,
                available: available
            }])
            .select();

        if (error) throw error;

        if (data && data[0]) {
            currentItems.push(data[0]);
            displayStockItems(currentItems);
        }

        closeAddModal();

    } catch (error) {
        alert('Error adding item: ' + error.message);
    }
}

async function updateQuantity(itemId, change) {
    const supabase = initSupabase();
    const item = currentItems.find(i => i.id === itemId);
    if (!item) return;

    const newQuantity = Math.max(0, item.quantity + change);
    
    try {
        const { error } = await supabase
            .from('rental_items')
            .update({ quantity: newQuantity })
            .eq('id', itemId);

        if (error) throw error;

        item.quantity = newQuantity;
        displayStockItems(currentItems);

    } catch (error) {
        alert('Error updating quantity: ' + error.message);
    }
}

async function deleteItem(itemId) {
    const supabase = initSupabase();
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
        const { error } = await supabase
            .from('rental_items')
            .delete()
            .eq('id', itemId);

        if (error) throw error;

        currentItems = currentItems.filter(i => i.id !== itemId);
        displayStockItems(currentItems);

    } catch (error) {
        alert('Error deleting item: ' + error.message);
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const editModal = document.getElementById('editModal');
    const addModal = document.getElementById('addModal');
    
    if (event.target === editModal) {
        closeModal();
    }
    if (event.target === addModal) {
        closeAddModal();
    }
}