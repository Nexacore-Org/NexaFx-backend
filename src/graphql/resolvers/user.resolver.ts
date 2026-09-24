import { Resolver, Query } from '@nestjs/graphql';
import { UsersService } from '../../users/users.service';
import { CurrentUser, GqlUser } from '../decorators/current-user.decorator';
import { User } from '../types/user.type';

@Resolver(() => User)
export class UserResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => User, { name: 'me' })
  async me(@CurrentUser() user: GqlUser) {
    return this.usersService.getProfile(user.userId);
  }
}
