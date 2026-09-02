import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import morgan from 'morgan';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3001;

// 1. CORS: Allow your Vercel domain
const allowedOrigins = [
  'http://localhost:3000', // for local testing
  'https://mr-brownson-success-portfolio.vercel.app' // your live Vercel site
];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());
app.use(morgan('combined'));

// Health check route
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Paystack backend is running' });
});

// 2. Thank You page after payment - PROPER MESSAGE RENDER
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
        <p>Thank you for your ₦50,000 deposit. Your project slot is now secured.</p>
        <p>I will contact you via email within 24 hours to discuss next steps.</p>
        <div class="ref">Reference: ${reference || 'N/A'}</div>
        <a href="https://mr-brownson-success-portfolio.vercel.app">← Back to Website</a>
      </div>
    </body>
    </html>
  `);
});

// 3. Initialize payment with Paystack
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
        amount, // frontend already sends kobo
        reference,
        metadata,
        callback_url: `https://portfolio-paystack-api.onrender.com/payment-success?reference=${reference}` // redirect to thank you page
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
    return res.status(500).json({ 
      status: 'error', 
      message: error.response?.data?.message || 'Payment initialization failed' 
    });
  }
});

// 4. Verify payment
app.post('/api/verify-payment', async (req, res) => {
  const { reference } = req.body;
  if (!reference) {
    return res.status(400).json({ status: 'error', message: 'Reference is required' });
  }

  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        }
      }
    );

    const paymentData = response.data;
    if (paymentData.status === 'success') {
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

// 5. Webhook - PROPER MESSAGE RENDER INSTEAD OF console.log
app.post('/api/paystack-webhook', express.raw({type: 'application/json'}), (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
  
  if (hash === req.headers['x-paystack-signature']) {
    const event = JSON.parse(req.body);
    
    if (event.event === 'charge.success') {
      // PROPER RESPONSE: You can add email/DB logic here later
      // For now we just acknowledge to Paystack
      return res.status(200).json({ 
        status: 'received', 
        message: 'Payment event processed successfully' 
      });
    }
    
    return res.status(200).json({ status: 'ignored', message: 'Event not handled' });
  }
  
  return res.status(400).json({ status: 'error', message: 'Invalid signature' });
});

app.listen(PORT, () => {
  // Server start message only shows once in Render logs
});