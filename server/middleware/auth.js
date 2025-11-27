import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Verify JWT token from Supabase
export const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const token = authHeader.split(' ')[1];
        
        // Verify with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({ error: 'Authentication failed' });
    }
};

// Verify admin privileges
export const verifyAdmin = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('user_type')
                .eq('id', req.user.id)
                .single();

            if (error || !profile || profile.user_type !== 'admin') {
                return res.status(403).json({ error: 'Admin access required' });
            }

            next();
        });
    } catch (error) {
        console.error('Admin middleware error:', error);
        return res.status(403).json({ error: 'Admin verification failed' });
    }
};

// Generate server token for internal use
export const generateServerToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// Verify server token
export const verifyServerToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        throw new Error('Invalid server token');
    }
};