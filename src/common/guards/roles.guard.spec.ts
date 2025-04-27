// // import { Reflector } from '@nestjs/core';
// // import { ExecutionContext, ForbiddenException } from '@nestjs/common';
// // import { UserRole } from '../../user/entities/user.entity';
// // import { RolesGuard } from './roles.guards';

// // describe('RolesGuard', () => {
// //   let guard: RolesGuard;
// //   let reflector: Reflector;

// //   beforeEach(() => {
// //     reflector = new Reflector();
// //     guard = new RolesGuard(reflector);
// //   });

// //   it('should allow access if user has required role', () => {
// //     const context = createMockContext(UserRole.ADMIN);

// //     jest
// //       .spyOn(reflector, 'getAllAndOverride')
// //       .mockReturnValue([UserRole.ADMIN]);

// //     expect(guard.canActivate(context as any)).toBe(true);
// //   });

// //   it('should deny access if user does not have required role', () => {
// //     const context = createMockContext(UserRole.USER);

// //     jest
// //       .spyOn(reflector, 'getAllAndOverride')
// //       .mockReturnValue([UserRole.ADMIN]);

// //     expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
// //   });
// // });

// // // Helper function to mock ExecutionContext
// // function createMockContext(role: UserRole): Partial<ExecutionContext> {
// //   return {
// //     switchToHttp: () => ({
// //       getRequest: () => ({
// //         user: { role },
// //       }),
// //     }),
// //   };
// // }


// import { Reflector } from '@nestjs/core';
// import { RolesGuard } from './roles.guard';
// // import { UserRole } from '/src/user/entities/user.entity';
// // import { UserRole } from '../../../user/entities/user.entity';

// import { ExecutionContext } from '@nestjs/common';
// import { UserRole } from 'src/user/entities/user.entity';
// // import { UserRole } from '../../user/entities/user.entity';


// describe('RolesGuard', () => {
//   let rolesGuard: RolesGuard;
//   let reflector: Reflector;

//   beforeEach(() => {
//     reflector = new Reflector();
//     rolesGuard = new RolesGuard(reflector);
//   });

//   it('should allow access if no roles are required', () => {
//     const context = {
//       switchToHttp: () => ({
//         getRequest: () => ({ user: { role: UserRole.USER } }),
//       }),
//       getHandler: () => null,
//       getClass: () => null,
//     } as unknown as ExecutionContext;

//     jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

//     expect(rolesGuard.canActivate(context)).toBe(true);
//   });

//   it('should allow access if user role is authorized', () => {
//     const context = {
//       switchToHttp: () => ({
//         getRequest: () => ({ user: { role: UserRole.ADMIN } }),
//       }),
//       getHandler: () => null,
//       getClass: () => null,
//     } as unknown as ExecutionContext;

//     jest
//       .spyOn(reflector, 'getAllAndOverride')
//       .mockReturnValue([UserRole.ADMIN]);

//     expect(rolesGuard.canActivate(context)).toBe(true);
//   });

//   it('should deny access if user role is unauthorized', () => {
//     const context = {
//       switchToHttp: () => ({
//         getRequest: () => ({ user: { role: UserRole.USER } }),
//       }),
//       getHandler: () => null,
//       getClass: () => null,
//     } as unknown as ExecutionContext;

//     jest
//       .spyOn(reflector, 'getAllAndOverride')
//       .mockReturnValue([UserRole.ADMIN]);

//     expect(rolesGuard.canActivate(context)).toBe(false);
//   });
// });

import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ExecutionContext } from '@nestjs/common';

// Mock UserRole enum instead of importing it
enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

describe('RolesGuard', () => {
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
  });

  it('should allow access if no roles are required', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.USER } }),
      }),
      getHandler: () => null,
      getClass: () => null,
    } as unknown as ExecutionContext;

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(rolesGuard.canActivate(context)).toBe(true);
  });

  it('should allow access if user role is authorized', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.ADMIN } }),
      }),
      getHandler: () => null,
      getClass: () => null,
    } as unknown as ExecutionContext;

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);

    expect(rolesGuard.canActivate(context)).toBe(true);
  });

  it('should deny access if user role is unauthorized', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.USER } }),
      }),
      getHandler: () => null,
      getClass: () => null,
    } as unknown as ExecutionContext;

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);

    expect(rolesGuard.canActivate(context)).toBe(false);
  });
});
