-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    address TEXT,
    user_type TEXT DEFAULT 'customer' CHECK (user_type IN ('customer', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Rental items table
CREATE TABLE rental_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL CHECK (price >= 0),
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    available BOOLEAN DEFAULT TRUE,
    image TEXT DEFAULT 'placeholder.jpg',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Bookings table
CREATE TABLE bookings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'active', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Booking items (junction table)
CREATE TABLE booking_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
    item_id UUID REFERENCES rental_items(id) ON DELETE CASCADE NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price INTEGER NOT NULL CHECK (price >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Payments table
CREATE TABLE payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    receipt_number TEXT UNIQUE NOT NULL,
    payment_method TEXT DEFAULT 'mpesa' CHECK (payment_method IN ('mpesa', 'cash', 'card')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    
    -- M-Pesa specific fields
    mpesa_checkout_id TEXT,
    mpesa_merchant_id TEXT,
    mpesa_phone TEXT,
    mpesa_amount INTEGER,
    mpesa_transaction_date TEXT,
    failure_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Function to update item quantity
CREATE OR REPLACE FUNCTION decrement_item_quantity(item_id UUID, decrement_by INTEGER)
RETURNS void AS $$
BEGIN
    UPDATE rental_items 
    SET quantity = quantity - decrement_by,
        available = (quantity - decrement_by) > 0,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE id = item_id AND quantity >= decrement_by;
END;
$$ LANGUAGE plpgsql;

-- Function to increment item quantity (for returns)
CREATE OR REPLACE FUNCTION increment_item_quantity(item_id UUID, increment_by INTEGER)
RETURNS void AS $$
BEGIN
    UPDATE rental_items 
    SET quantity = quantity + increment_by,
        available = TRUE,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE id = item_id;
END;
$$ LANGUAGE plpgsql;

-- Insert sample rental items
INSERT INTO rental_items (name, description, price, quantity, image) VALUES
('Tent', '10x10 Event Tent', 1000, 10, 'tent.jpg'),
('Chair', 'Plastic Folding Chair', 50, 100, 'chair.jpg'),
('Table', '8ft Banquet Table', 200, 20, 'table.jpg'),
('Flower', 'Decoration Flowers', 300, 50, 'flower.jpg'),
('PA System', 'Public Address System', 1500, 5, 'pa-system.jpg'),
('Generator', '5KVA Power Generator', 2000, 3, 'generator.jpg');

-- Create indexes for better performance
CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_booking_items_booking_id ON booking_items(booking_id);
CREATE INDEX idx_rental_items_available ON rental_items(available);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Profiles: Users can read/update their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Rental items: Everyone can view, only admins can modify
CREATE POLICY "Anyone can view rental items" ON rental_items FOR SELECT USING (true);
CREATE POLICY "Only admins can modify rental items" ON rental_items FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
);

-- Bookings: Users can view their own bookings, admins can view all
CREATE POLICY "Users can view own bookings" ON bookings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all bookings" ON bookings FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
);
CREATE POLICY "Users can create bookings" ON bookings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Payments: Users can view their own payments, admins can view all
CREATE POLICY "Users can view own payments" ON payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all payments" ON payments FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin')
);