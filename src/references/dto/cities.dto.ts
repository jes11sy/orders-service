import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCityDto {
  @IsString()
  @IsNotEmpty({ message: 'Название города обязательно' })
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Код города обязателен' })
  @MaxLength(20)
  code: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCityDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryCityDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : undefined)
  @IsBoolean()
  isActive?: boolean;
}
