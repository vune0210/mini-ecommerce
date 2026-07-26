import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import dataSource from '../data-source';
import { User, UserRole } from '../../users/entities/user.entity';

const ADMIN_EMAIL = 'admin@mini-ecommerce.local';
const ADMIN_PASSWORD = 'Admin123!';

async function seed(): Promise<void> {
  await dataSource.initialize();
  const users = dataSource.getRepository(User);
  const existing = await users.findOneBy({ email: ADMIN_EMAIL });

  if (existing) {
    if (existing.role !== UserRole.ADMIN) {
      existing.role = UserRole.ADMIN;
      await users.save(existing);
    }
    console.log(`Admin account already exists: ${ADMIN_EMAIL}`);
  } else {
    await users.save(
      users.create({
        email: ADMIN_EMAIL,
        name: 'Test Admin',
        password: await bcrypt.hash(ADMIN_PASSWORD, 12),
        role: UserRole.ADMIN,
      }),
    );
    console.log(`Admin account created: ${ADMIN_EMAIL}`);
  }

  await dataSource.destroy();
}

void seed().catch(async (error: unknown) => {
  console.error(error);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exitCode = 1;
});
