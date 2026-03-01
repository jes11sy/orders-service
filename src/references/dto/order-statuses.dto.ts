import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, MaxLength, Min } from 'class-validator';

export class CreateOrderStatusDto {
  @IsString()
  @IsNotEmpty({ message: 'Название статуса обязательно' })
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Код статуса обязателен' })
  @MaxLength(50)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateOrderStatusDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
