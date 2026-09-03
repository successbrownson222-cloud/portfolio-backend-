import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import morgan from 'morgan';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3001;

// 1. CORS
const allowedOrigins = [
  'http://localhost:3000',
  'https://mr-brownson-success-portfolio.vercel.app'
];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());
app.use(morgan('combined'));

// Health check
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Paystack + Flutterwave backend is running' });
});

// Thank You page
app.get('/payment-success', (req, res) => {
  const { reference } = req.query;
  
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Successful - Success Brownson Tech</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #000; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
        .card { background: #111; padding: 40px; border-radius: 16px; border: 2px solid #22c55e; max-width: 500px; text-align: center; }
        h1 { color: #22c55e; font-size: 28px; margin-bottom: 10px; }
        p { color: #9ca3af; line-height: 1.6; }
        .ref { background: #222; padding: 12px; border-radius: 8px; margin: 20px 0; word-break: break-all; font-family: monospace; color: #22c55e; }
        a { background: #22c55e; color: black; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; margin-top: 10px; }
        a:hover { opacity: 0.9; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>✅ Payment Successful!</h1>
        <p>Thank you for your deposit. Your project slot is now secured.</p>
        <p>I will contact you via email within 24 hours to discuss next steps.</p>
        <div class="ref">Reference: ${reference || 'N/A'}</div>
        <a href="https://mr-brownson-success-portfolio.vercel.app">← Back to Website</a>
      </div>
    </body>
    </html>
  `);
});

// PAYSTACK: Initialize payment - NGN
app.post('/pay', async (req, res) => {
  const { email, amount, reference, metadata } = req.body;

  if (!email || !amount) {
    return res.status(400).json({ status: 'error', message: 'Email and amount are required' });
  }

  try {
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount,
        reference,
        metadata,
        callback_url: `https://portfolio-paystack-api.onrender.com/payment-success?reference=${reference}`
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return res.status(200).json(response.data);
  } catch (error) {
    console.log(error.response?.data)
    return res.status(500).json({ 
      status: 'error', 
      message: error.response?.data?.message || 'Payment initialization failed' 
    });
  }
});

// FLUTTERWAVE: Initialize payment - USD - FIXED
app.post('/pay/flutterwave', async (req, res) => {
  const { email, amount, name, phone, reference } = req.body;

  if (!email || !amount || !name || !phone) {
    return res.status(400).json({ status: 'error', message: 'Email, name, phone and amount are required' });
  }

  const payload = {
    tx_ref: reference || `FLW-${Date.now()}`,
    amount: amount,
    currency: 'USD',
    redirect_url: `https://portfolio-paystack-api.onrender.com/payment-success?reference=${reference}`,
    payment_options: 'card,banktransfer,ussd',
    customer: {
      email: email,
      name: name,
      phonenumber: phone
    },
    customizations: {
      title: 'Success Brownson Tech',
      description: '50% Project Deposit'
    }
  };

  try {
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if(response.data.status === 'success'){
      return res.status(200).json({ 
        status: 'success', 
        data: { link: response.data.data.link } 
      });
    } else {
      return res.status(400).json({ status: 'error', message: response.data.message });
    }

  } catch (error) {
    console.log(error.response?.data)
    return res.status(500).json({ 
      status: 'error', 
      message: error.response?.data?.message || 'Flutterwave initialization failed' 
    });
  }
});

// PAYSTACK: Verify payment
app.post('/api/verify-payment', async (req, res) => {
  const { reference } = req.body;
  if (!reference) {
    return res.status(400).json({ status: 'error', message: 'Reference is required' });
  }

  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { 
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } 
      }
    );

    const paymentData = response.data.data;
    if (response.data.status === 'success' && paymentData.status === 'success') {
      return res.status(200).json({ 
        status: 'success', 
        message: 'Payment verified successfully',
        data: {
          email: paymentData.customer.email,
          amount: paymentData.amount / 100,
          reference: paymentData.reference,
          paid_at: paymentData.paid_at
        }
      });
    } else {
      return res.status(400).json({ status: 'failed', message: 'Payment not successful' });
    }
  } catch (error) {
    return res.status(500).json({ 
      status: 'error', 
      message: error.response?.data?.message || 'Verification failed' 
    });
  }
});

// FLUTTERWAVE: Verify payment
app.post('/api/verify-flutterwave', async (req, res) => {
  const { transaction_id } = req.body;
  
  try {
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      {
        headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
      }
    );
    
    if (response.data.status === 'success' && response.data.data.status === 'successful') {
      return res.status(200).json({
        status: 'success',
        message: 'Payment verified successfully',
        data: {
          email: response.data.data.customer.email,
          amount: response.data.data.amount,
          currency: response.data.data.currency,
          reference: response.data.data.tx_ref,
          paid_at: response.data.data.created_at
        }
      });
    } else {
      return res.status(400).json({ status: 'failed', message: 'Payment not successful' });
    }
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.response?.data?.message || error.message });
  }
});

// PAYSTACK: Webhook - MUST use raw body
app.post('/api/paystack-webhook', express.raw({type: 'application/json'}), (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
  
  if (hash === req.headers['x-paystack-signature']) {
    const event = JSON.parse(req.body.toString());
    if (event.event === 'charge.success') {
      console.log('Paystack payment successful:', event.data.reference)
      return res.status(200).json({ status: 'received' });
    }
    return res.status(200).json({ status: 'ignored' });
  }
  
  return res.status(400).json({ status: 'error', message: 'Invalid signature' });
});

// FLUTTERWAVE: Webhook
app.post('/webhook/flutterwave', express.json(), (req, res) => {
  const secret_hash = process.env.FLW_SECRET_HASH;
  const signature = req.headers['verif-hash'];
  
  if (signature !== secret_hash) {
    return res.status(401).json({ status: 'error', message: 'Invalid signature' });
  }

  const payload = req.body;
  if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
    console.log('Flutterwave payment successful:', payload.data.tx_ref)
  }

  res.status(200).json({ status: 'success' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});