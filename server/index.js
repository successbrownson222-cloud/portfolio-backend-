import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import morgan from 'morgan';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3001;

// 1. CORS FIX: Allow your Vercel domain
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

// 1. Initialize payment with Paystack
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
        callback_url: 'https://mr-brownson-success-portfolio.vercel.app' // sends user back here after payment
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
    console.error('Initialize Error:', error.response?.data || error.message);
    return res.status(500).json({ status: 'error', message: 'Payment initialization failed' });
  }
});

// 2. Verify payment
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

    const paymentData = response.data.data;
    if (paymentData.status === 'success') {
      return res.status(200).json({ 
        status: 'success', 
        message: 'Payment verified',
        data: {
          email: paymentData.customer.email,
          amount: paymentData.amount / 100,
          reference: paymentData.reference
        }
      });
    } else {
      return res.status(400).json({ status: 'failed', message: 'Payment not successful' });
    }
  } catch (error) {
    console.error('Verify Error:', error.response?.data || error.message);
    return res.status(500).json({ status: 'error', message: 'Verification failed' });
  }
});

// 3. Webhook
app.post('/api/paystack-webhook', express.raw({type: 'application/json'}), (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
  
  if (hash === req.headers['x-paystack-signature']) {
    const event = JSON.parse(req.body);
    if (event.event === 'charge.success') {
      console.log("Payment success:", event.data.reference);
    }
    return res.status(200).send('OK');
  }
  
  return res.status(400).send('Invalid signature');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});