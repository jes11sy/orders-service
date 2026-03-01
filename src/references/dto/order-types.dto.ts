import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateOrderTypeDto {
  @IsString()
  @IsNotEmpty({ message: 'Название типа заказа обязательно' })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateOrderTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
