import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateRkDto {
  @IsString()
  @IsNotEmpty({ message: 'Название РК обязательно' })
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Код РК обязателен' })
  @MaxLength(50)
  code: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRkDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryRkDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : undefined)
  @IsBoolean()
  isActive?: boolean;
}
