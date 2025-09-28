import { Router } from 'express';
import { ApiResponse } from '@ai-dev/shared';

export const webhookRouter = Router();

// WhatsApp webhook verification
webhookRouter.get('/whatsapp', async (req, res) => {
  // TODO: Verify WhatsApp webhook
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      console.info('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// WhatsApp message webhook
webhookRouter.post('/whatsapp', async (req, res) => {
  // TODO: Handle WhatsApp messages
  console.info('WhatsApp webhook received:', req.body);
  res.sendStatus(200);
});

// Email webhook (for services like SendGrid)
webhookRouter.post('/email', async (req, res) => {
  // TODO: Handle email webhooks
  console.info('Email webhook received:', req.body);
  res.sendStatus(200);
});

// GitHub webhook for repository events
webhookRouter.post('/github', async (req, res) => {
  // TODO: Handle GitHub webhooks
  console.info('GitHub webhook received:', req.headers['x-github-event']);
  res.sendStatus(200);
});