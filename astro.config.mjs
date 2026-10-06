import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  prefetch: true,
  vite: {
         server: {
           host: '0.0.0.0',
           allowedHosts: ['husked-container-irritant.ngrok-free.dev'],
           cors: {
             origin: ['https://husked-container-irritant.ngrok-free.dev'],
           },
         },
       },
});
