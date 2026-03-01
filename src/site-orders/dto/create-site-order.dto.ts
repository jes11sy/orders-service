import { IsString, IsNotEmpty, MaxLength, IsOptional, IsInt } from 'class-validator';

export class CreateSiteOrderDto {
  @IsInt()
  @IsNotEmpty({ message: 'Город обязателен' })
  cityId: number;

  @IsString()
  @IsNotEmpty({ message: 'Сайт обязателен' })
  @MaxLength(255)
  site: string;

  @IsString()
  @IsNotEmpty({ message: 'Имя клиента обязательно' })
  @MaxLength(255)
  clientName: string;

  @IsString()
  @IsNotEmpty({ message: 'Телефон обязателен' })
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
