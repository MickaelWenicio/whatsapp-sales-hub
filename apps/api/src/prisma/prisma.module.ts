import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Módulo global: PrismaService disponível para injeção em qualquer módulo. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
