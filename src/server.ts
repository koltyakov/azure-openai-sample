import Fastify, { FastifyInstance, RouteShorthandOptions } from 'fastify';
import { readFile } from 'fs';

import { Chat } from './chat';
import { config } from './config';
import { getFacts } from './facts';

const server: FastifyInstance = Fastify({ logger: true });

// Initialize AI assistant
const ai = new Chat({
  url: config.openai.url,
  apiKey: config.openai.apiKey,
  model: config.openai.model,
  // Optional
  role: 'AI assistant recommending food',
  memory: 5,
  // Custom knowledge domain enrichment based on query
  enrich: getFacts,
});

const askRouteOpts: RouteShorthandOptions = {
  schema: {
    body: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        dlg: { type: 'string' },
      },
      required: ['text'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
        },
      },
    },
  },
};

// API endpoint to get AI answer
server.post('/ask', askRouteOpts, async (request) => {
  const { text, dlg } = request.body as { text: string; dlg?: string };
  return { answer: await ai.ask(text, dlg) };
});

// Bare minimal UI to test the API
server.get('/', (_, reply) => {
  readFile('./public/index.html', 'utf8', (err, data) => {
    if (err) reply.code(500).send({ error: err.message });
    reply.code(200).header('Content-Type', 'text/html; charset=utf-8').send(data);
  });
});

// Init server
server.listen({ port: config.server.port }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
});
