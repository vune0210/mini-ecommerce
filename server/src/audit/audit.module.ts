import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [AuditService, AuditInterceptor],
  // AppModule registers AuditInterceptor as an APP_INTERCEPTOR; the provider is
  // built in the root injector, so AuditService has to be visible from there.
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
