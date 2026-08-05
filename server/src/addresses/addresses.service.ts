import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { shippingSnapshot, shouldBecomeDefault } from './address-rules';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { Address } from './entities/address.entity';

@Injectable()
export class AddressesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Address)
    private readonly addresses: Repository<Address>,
  ) {}

  /** Default first, then newest — the order a checkout picker wants. */
  findAll(userId: string): Promise<Address[]> {
    return this.addresses.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, id: string): Promise<Address> {
    // Scoped by user id rather than fetched-then-checked: a 404 for someone
    // else's address leaks nothing about whether that id exists.
    const address = await this.addresses.findOneBy({ id, userId });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Address);
      const existing = await repository.countBy({ userId });
      const isDefault = shouldBecomeDefault(dto.isDefault, existing);
      const saved = await repository.save(
        repository.create({
          userId,
          label: dto.label?.trim() || null,
          ...shippingSnapshot(dto),
          isDefault,
        }),
      );
      if (isDefault) await this.clearOtherDefaults(manager, userId, saved.id);
      return saved;
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Address);
      const address = await repository.findOneBy({ id, userId });
      if (!address) throw new NotFoundException('Address not found');
      const merged = shippingSnapshot({
        recipientName: dto.recipientName ?? address.recipientName,
        phone: dto.phone ?? address.phone,
        addressLine: dto.addressLine ?? address.addressLine,
        ward: dto.ward !== undefined ? dto.ward : address.ward,
        district: dto.district !== undefined ? dto.district : address.district,
        city: dto.city ?? address.city,
      });
      Object.assign(address, merged);
      if (dto.label !== undefined) address.label = dto.label.trim() || null;
      // Un-defaulting is not offered: it would leave the book with no default.
      // Callers promote a different address instead.
      if (dto.isDefault === true) address.isDefault = true;
      await repository.save(address);
      if (address.isDefault)
        await this.clearOtherDefaults(manager, userId, address.id);
      return address;
    });
  }

  async setDefault(userId: string, id: string): Promise<Address> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Address);
      const address = await repository.findOneBy({ id, userId });
      if (!address) throw new NotFoundException('Address not found');
      address.isDefault = true;
      await repository.save(address);
      await this.clearOtherDefaults(manager, userId, id);
      return address;
    });
  }

  /**
   * Removing the default promotes the newest survivor. Leaving the book without
   * one would make the next checkout pick arbitrarily, which is how an order
   * ends up shipped to a stale address nobody chose.
   */
  async remove(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Address);
      const address = await repository.findOneBy({ id, userId });
      if (!address) throw new NotFoundException('Address not found');
      await repository.remove(address);
      if (!address.isDefault) return;
      const replacement = await repository.findOne({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
      if (replacement) {
        replacement.isDefault = true;
        await repository.save(replacement);
      }
    });
  }

  private async clearOtherDefaults(
    manager: EntityManager,
    userId: string,
    keepId: string,
  ): Promise<void> {
    await manager
      .getRepository(Address)
      .update({ userId, id: Not(keepId) }, { isDefault: false });
  }
}
