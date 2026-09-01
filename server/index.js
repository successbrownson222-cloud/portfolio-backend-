import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import morgan from 'morgan'; // <-- for proper logging
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('combined')); // <-- Logs every request: method, url, status, time

// Health check route - Render uses this
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Paystack backend is running' });
});

// Route to verify payment with Paystack
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
      // TODO: Save to DB: email, amount, reference
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
    // Log error to Render logs, but don't expose secret to user
    console.error('Verify Error:', error.response?.data || error.message);
    return res.status(500).json({ status: 'error', message: 'Verification failed' });
  }
});

// Webhook - Most important
app.post('/api/paystack-webhook', express.raw({type: 'application/json'}), (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
  
  if (hash === req.headers['x-paystack-signature']) {
    const event = JSON.parse(req.body);
    if (event.event === 'charge.success') {
      // TODO: Save to DB here. This is the most trusted source
      // event.data.reference, event.data.customer.email, event.data.amount
    }
    return res.status(200).send('OK');
  }
  
  return res.status(400).send('Invalid signature');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`); // Only runs once on startup. This is fine
});
