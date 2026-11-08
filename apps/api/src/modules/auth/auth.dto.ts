import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type LoginRequestDto,
  type RegisterRequestDto,
} from '@casino/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto implements RegisterRequestDto {
  @Transform(trim)
  @IsEmail({}, { message: 'email must be a valid e-mail address' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `password must have ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`,
  })
  password!: string;

  @Transform(trim)
  @IsString()
  @Length(2, DISPLAY_NAME_MAX_LENGTH)
  @Matches(/^[\p{L}\p{N} _.-]+$/u, {
    message: 'displayName may only contain letters, digits, spaces and _ . -',
  })
  displayName!: string;
}

export class LoginDto implements LoginRequestDto {
  @Transform(trim)
  @IsString()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
