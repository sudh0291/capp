import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('api')
  getApiStatus(): object {
    return {
      message: 'CodeGoAI Backend is up and running!',
      status: 'success',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Health check endpoint — used by:
   *  - Docker HEALTHCHECK (interval: 15s) to restart crashed containers
   *  - NGINX upstream max_fails to remove dead instances from rotation
   *  - PgBouncer / load balancer liveliness probes
   */
  @Get('health')
  health(): object {
    return {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
