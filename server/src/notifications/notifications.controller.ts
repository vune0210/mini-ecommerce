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
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import {
  NotificationPreferences,
  PublicNotification,
} from './notification-rules';
import {
  NotificationsService,
  PaginatedNotifications,
} from './notifications.service';

/**
 * Every route is scoped to the caller's own inbox — there is no admin view and
 * no `userId` parameter anywhere, so no request can name someone else's rows.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({
    description:
      'The caller inbox, newest first. Filter with ?unreadOnly=true and ?type=. Carries unreadCount so the nav badge stays in step with the page.',
  })
  list(
    @Request() request: { user: AuthenticatedUser },
    @Query() query: ListNotificationsDto,
  ): Promise<PaginatedNotifications> {
    return this.notifications.findAll(request.user.id, query);
  }

  // Declared before the ':id' routes so a literal path segment is never parsed
  // as an id.
  @Get('unread-count')
  @ApiOkResponse({ description: 'Badge count only; no rows are loaded.' })
  async unreadCount(
    @Request() request: { user: AuthenticatedUser },
  ): Promise<{ unreadCount: number }> {
    return {
      unreadCount: await this.notifications.unreadCount(request.user.id),
    };
  }

  @Get('preferences')
  @ApiOkResponse({
    description:
      'Mute switches. A customer who never saved any gets the all-on defaults rather than a 404.',
  })
  getPreferences(
    @Request() request: { user: AuthenticatedUser },
  ): Promise<NotificationPreferences> {
    return this.notifications.getPreferences(request.user.id);
  }

  @Patch('preferences')
  @ApiOkResponse({
    description:
      'Updates only the switches present in the body. Muted categories stop being written at all, they are not merely hidden.',
  })
  updatePreferences(
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    return this.notifications.updatePreferences(request.user.id, dto);
  }

  @Patch(':id/read')
  @ApiOkResponse({
    description:
      'Marks one notification read. Idempotent — a second call keeps the first readAt.',
  })
  markRead(
    @Request() request: { user: AuthenticatedUser },
    @Param('id') id: string,
  ): Promise<PublicNotification> {
    return this.notifications.markRead(request.user.id, id);
  }

  @Post('read-all')
  // POST because it changes state, but there is nothing to create, so 200 with
  // the new counts rather than 201 with a Location nobody can follow.
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Marks every unread notification read.' })
  markAllRead(
    @Request() request: { user: AuthenticatedUser },
  ): Promise<{ updated: number; unreadCount: number }> {
    return this.notifications.markAllRead(request.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Request() request: { user: AuthenticatedUser },
    @Param('id') id: string,
  ): Promise<void> {
    await this.notifications.remove(request.user.id, id);
  }
}
