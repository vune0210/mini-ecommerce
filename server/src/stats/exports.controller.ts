import {
  Controller,
  Get,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { ExportOrdersDto } from './dto/export-orders.dto';
import { ExportsService } from './exports.service';

@ApiTags('admin-exports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get('orders.csv')
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description:
      'CSV download of orders, one row per order line item. Includes every status by default — filter with ?status=. Streamed as an attachment with a dated filename.',
  })
  ordersCsv(@Query() query: ExportOrdersDto): StreamableFile {
    return this.exports.orderExport(query);
  }

  @Get('products.csv')
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description:
      'CSV download of the product catalogue — SKU and publication state included — streamed as an attachment with a dated filename.',
  })
  productsCsv(): StreamableFile {
    return this.exports.productExport();
  }

  @Get('customers.csv')
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description:
      'CSV download of customer accounts with lifetime order count and spend. Spend counts PAID/SHIPPED/COMPLETED orders only.',
  })
  customersCsv(): StreamableFile {
    return this.exports.customerExport();
  }
}
