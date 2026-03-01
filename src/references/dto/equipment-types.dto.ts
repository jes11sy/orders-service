import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateEquipmentTypeDto {
  @IsString()
  @IsNotEmpty({ message: 'Название типа оборудования обязательно' })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEquipmentTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
