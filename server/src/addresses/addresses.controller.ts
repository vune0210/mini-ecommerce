import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { Address } from './entities/address.entity';

@ApiTags('addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOkResponse({
    description: 'Saved destinations for the caller, default first.',
  })
  list(@Request() request: { user: AuthenticatedUser }): Promise<Address[]> {
    return this.addresses.findAll(request.user.id);
  }

  @Get(':id')
  detail(
    @Request() request: { user: AuthenticatedUser },
    @Param('id') id: string,
  ): Promise<Address> {
    return this.addresses.findOne(request.user.id, id);
  }

  @Post()
  create(
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: CreateAddressDto,
  ): Promise<Address> {
    return this.addresses.create(request.user.id, dto);
  }

  @Patch(':id')
  update(
    @Request() request: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<Address> {
    return this.addresses.update(request.user.id, id, dto);
  }

  @Patch(':id/default')
  @ApiOkResponse({
    description: 'Promotes one address and demotes the previous default.',
  })
  setDefault(
    @Request() request: { user: AuthenticatedUser },
    @Param('id') id: string,
  ): Promise<Address> {
    return this.addresses.setDefault(request.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Request() request: { user: AuthenticatedUser },
    @Param('id') id: string,
  ): Promise<void> {
    await this.addresses.remove(request.user.id, id);
  }
}
