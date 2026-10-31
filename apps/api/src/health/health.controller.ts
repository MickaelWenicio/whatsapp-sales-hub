import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      role: this.config.get<string>('PROCESS_ROLE'),
      channel: this.config.get<string>('CHANNEL_CONNECTOR'),
    };
  }
}
