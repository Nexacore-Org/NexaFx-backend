import { Resolver, Query } from '@nestjs/graphql';
import { UsersService } from '../../users/users.service';
import { CurrentUser, GqlUser } from '../decorators/current-user.decorator';

@Resolver('User')
export class UserResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query('me')
  async me(@CurrentUser() user: GqlUser) {
    return this.usersService.getProfile(user.userId);
  }
}
