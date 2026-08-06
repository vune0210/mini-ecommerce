import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import dataSource from '../data-source';
import { User, UserRole } from '../../users/entities/user.entity';
import { readAdminSeedConfig } from './admin-seed-config';

async function seed(): Promise<void> {
  const config = readAdminSeedConfig(process.env);
  if (!config) {
    console.log(
      'Admin seed skipped: set ADMIN_EMAIL and ADMIN_PASSWORD to create one',
    );
    return;
  }

  await dataSource.initialize();
  const users = dataSource.getRepository(User);
  const existing = await users.findOneBy({ email: config.email });

  if (existing) {
    // Re-promotes the role only. Deactivation is sticky on purpose: the seed
    // runs on every container start and must never resurrect an account an
    // admin deliberately switched off.
    if (existing.role !== UserRole.ADMIN) {
      existing.role = UserRole.ADMIN;
      await users.save(existing);
    }
    console.log(`Admin account already exists: ${config.email}`);
  } else {
    await users.save(
      users.create({
        email: config.email,
        name: config.name,
        password: await bcrypt.hash(config.password, 12),
        role: UserRole.ADMIN,
        isActive: true,
      }),
    );
    console.log(`Admin account created: ${config.email}`);
  }

  await dataSource.destroy();
}

void seed().catch(async (error: unknown) => {
  console.error(error);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exitCode = 1;
});
