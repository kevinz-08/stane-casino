import { HttpStatus, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { UserDto } from '@casino/shared';
import { DomainError } from '../../common/errors/domain-error';
import { isPrismaError, PrismaErrorCode, PrismaService } from '../../infra/prisma/prisma.service';

export class EmailTakenError extends DomainError {
  readonly code = 'EMAIL_TAKEN';
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor() {
    super('An account with this e-mail already exists');
  }
}

export class UserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
  constructor() {
    super('User not found');
  }
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
}

/** Owner of the `User` table: the only module that reads or writes it directly. */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async create(input: CreateUserInput): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: {
          email: UsersService.normalizeEmail(input.email),
          passwordHash: input.passwordHash,
          displayName: input.displayName.trim(),
        },
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UniqueViolation)) throw new EmailTakenError();
      throw error;
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: UsersService.normalizeEmail(email) } });
  }

  async getById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UserNotFoundError();
    return user;
  }

  static toDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
