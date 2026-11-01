import { Controller, Get, Logger, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ActorGuard } from '../admin-api/rbac';
import { EventosService } from './eventos.service';

const PING_MS = 15_000;

@Controller('admin/events')
@UseGuards(ActorGuard)
export class EventosController {
  private readonly logger = new Logger(EventosController.name);

  constructor(private readonly eventos: EventosService) {}

  /** SSE: reenvia do buffer o que passou do Last-Event-ID e depois transmite ao vivo. */
  @Get()
  async stream(@Req() req: Request, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(': conectado\n\n');

    const header = req.headers['last-event-id'];
    const desdeId = Array.isArray(header) ? header[0] : header;

    let encerrado = false;
    let parar: (() => Promise<void>) | undefined;
    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS);
    const encerrar = () => {
      if (encerrado) return;
      encerrado = true;
      clearInterval(ping);
      void parar?.();
    };
    req.on('close', encerrar);

    try {
      parar = await this.eventos.assinar((e) => {
        if (!encerrado) res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
      }, desdeId || undefined);
    } catch (err) {
      this.logger.error(`falha ao assinar eventos: ${err instanceof Error ? err.message : String(err)}`);
      encerrar();
      res.end();
      return;
    }
    if (encerrado) void parar();
  }
}
