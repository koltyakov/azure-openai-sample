import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  OPENAI_URL: z.string(), // Azure OpenAI API URL
  OPENAI_KEY: z.string(), // Azure OpenAI API key
  OPENAI_MODEL: z.string(), // OpenAI model ID
  PORT: z.string().optional(), // Server port
});

const env = envSchema.parse(process.env);

export const config = {
  openai: {
    url: env.OPENAI_URL,
    apiKey: env.OPENAI_KEY,
    model: env.OPENAI_MODEL,
  },
  server: {
    port: parseInt(env.PORT || '3000', 10),
  },
};
