import { supabase } from './supabase-client.js';

// Track payment status (for real-time updates)
export class PaymentTracker {
    constructor() {
        this.subscription = null;
    }

    subscribeToPayments(userId, callback) {
        this.subscription = supabase
            .channel('payment-updates')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'payments',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    callback(payload);
                }
            )
            .subscribe();
    }

    unsubscribe() {
        if (this.subscription) {
            supabase.removeChannel(this.subscription);
        }
    }
}

// Check payment status periodically
export async function checkPaymentStatus(paymentId) {
    const { data: payment, error } = await supabase
        .from('payments')
        .select('status')
        .eq('id', paymentId)
        .single();

    if (error) {
        console.error('Error checking payment status:', error);
        return null;
    }

    return payment.status;
}