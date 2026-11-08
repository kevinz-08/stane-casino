import { Controller, Get } from '@nestjs/common';
import type { UserDto } from '@casino/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/auth.decorators';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserDto> {
    return UsersService.toDto(await this.usersService.getById(user.sub));
  }
}
