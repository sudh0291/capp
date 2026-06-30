import { Module, Global } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Injection token for the shared ioredis client.
 * Import REDIS_CLIENT in any provider that needs direct Redis access.
 *
 * Usage:
 *   constructor(@Inject(REDIS_CLIENT) private redis: Redis) {}
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global() // Registered once in AppModule; available everywhere without re-importing
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        const client = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: 2,
          enableReadyCheck: false,
          lazyConnect: true, // Don't block startup if Redis is briefly unavailable
          retryStrategy: (times) => {
            if (times > 3) {
              return null; // Stop retrying after 3 attempts
            }
            return 5000; // Wait 5 seconds between retries
          },
        });
        client.on('error', (err) =>
          console.log('[RedisClient] Connection error (will retry):', err.message),
        );
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
