// auth.js - Bulletproof authentication
let authChecked = false;

// Simple function to get or create supabase client
function getSupabaseClient() {
    // If already exists, return it
    if (window.supabase && typeof window.supabase.auth === 'object') {
        return window.supabase;
    }
    
    // Try to create it
    try {
        const supabaseUrl = 'https://humeamgpybksjeyjvvsw.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1bWVhbWdweWJrc2pleWp2dnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4NzM3NTIsImV4cCI6MjA3ODQ0OTc1Mn0.DEU5Zfk4PlSmyVD1BFoY9pd3U6k6q4ekZuREa4hoW6g';
        
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            window.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
            console.log('Supabase client created successfully');
            return window.supabase;
        } else {
            console.error('Supabase library not loaded properly');
            return null;
        }
    } catch (error) {
        console.error('Error creating Supabase client:', error);
        return null;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    if (authChecked) return;
    authChecked = true;

    // Wait a bit longer for everything to load
    setTimeout(async () => {
        console.log('Starting auth check...');
        
        let supabase = getSupabaseClient();
        
        // If still not available, try a few more times
        let retries = 0;
        while (!supabase && retries < 3) {
            await new Promise(resolve => setTimeout(resolve, 500));
            supabase = getSupabaseClient();
            retries++;
            console.log(`Retry ${retries} for Supabase client`);
        }
        
        if (!supabase) {
            console.error('❌ Supabase client not available after retries');
            // Still setup forms - they'll show error when used
            setupAuthForms(null);
            return;
        }
        
        console.log('✅ Supabase client ready, checking session...');
        
        try {
            // Check if auth methods are available
            if (typeof supabase.auth.getSession !== 'function') {
                throw new Error('Auth methods not available');
            }
            
            const { data, error } = await supabase.auth.getSession();
            
            if (error) {
                console.warn('Session check error:', error);
                setupAuthForms(supabase);
                return;
            }
            
            if (data?.session?.user) {
                console.log('User is logged in, redirecting...');
                await redirectBasedOnRole(data.session.user.id, supabase);
                return;
            }
            
            console.log('No active session, setting up forms');
            setupAuthForms(supabase);
            
        } catch (error) {
            console.error('Error in auth check:', error);
            // Setup forms anyway
            setupAuthForms(supabase);
        }
    }, 500); // Increased delay to ensure everything is loaded
});

async function redirectBasedOnRole(userId, supabase) {
    if (!supabase) return;
    
    const currentPage = window.location.pathname;
    console.log('Current page:', currentPage);
    
    try {
        // If on login page and user is logged in, redirect to dashboard
        if (currentPage.includes('login') || currentPage.includes('signup')) {
            const { data: profile, error } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", userId)
                .single();

            if (error) {
                console.warn('Profile fetch error, defaulting to user dashboard');
                window.location.href = "/user/user-dashboard.html";
                return;
            }

            if (profile?.role === "admin") {
                window.location.href = "/admin/admin-dashboard.html";
            } else {
                window.location.href = "/user/user-dashboard.html";
            }
        }
    } catch (error) {
        console.error('Redirect error:', error);
        // Default to user dashboard on error
        window.location.href = "/user/user-dashboard.html";
    }
}

function setupAuthForms(supabase) {
    console.log('Setting up auth forms, supabase available:', !!supabase);
    
    const loginForm = document.getElementById("loginForm");
    const adminLoginForm = document.getElementById("adminLoginForm");
    const signupForm = document.getElementById("signupForm");

    // User login
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            if (!supabase) {
                alert('❌ Authentication service is not available. Please refresh the page.');
                return;
            }

            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value.trim();

            const btn = loginForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Signing in...';
            
            try {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                
                window.location.href = "/user/user-dashboard.html";
            } catch (err) {
                alert("Login failed: " + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Sign In';
            }
        });
    }

    // Admin login
    if (adminLoginForm) {
        adminLoginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            if (!supabase) {
                alert('❌ Authentication service is not available. Please refresh the page.');
                return;
            }

            const email = document.getElementById("adminEmail").value.trim();
            const password = document.getElementById("adminPassword").value.trim();

            const btn = adminLoginForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Signing in...';
            
            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("role")
                    .eq("id", data.user.id)
                    .single();

                if (profile?.role === "admin") {
                    window.location.href = "/admin/admin-dashboard.html";
                } else {
                    await supabase.auth.signOut();
                    alert("❌ Admin access required. Please use admin credentials.");
                }
            } catch (err) {
                alert("Login failed: " + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Sign In';
            }
        });
    }

    // Signup form
    if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            if (!supabase) {
                alert('❌ Authentication service is not available. Please refresh the page.');
                return;
            }
            
            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value.trim();
            const confirmPassword = document.getElementById("confirmPassword").value.trim();
            const fullName = document.getElementById("fullName").value.trim();
            const phone = document.getElementById("phone").value.trim();
            const address = document.getElementById("address").value.trim();
            const agreeTerms = document.getElementById("agreeTerms").checked;

            // Validation
            if (password !== confirmPassword) {
                alert("❌ Passwords don't match!");
                return;
            }

            if (!agreeTerms) {
                alert("❌ Please agree to the terms and conditions");
                return;
            }

            const btn = signupForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Creating Account...';
            
            try {
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            full_name: fullName,
                            phone: phone,
                            address: address
                        }
                    }
                });

                if (error) throw error;

                alert('✅ Signup successful! Please check your email for verification.');
                window.location.href = "/auth/login.html";
                
            } catch (err) {
                alert("❌ Signup failed: " + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Create Account';
            }
        });
    }
}