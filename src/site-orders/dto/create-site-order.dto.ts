import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class CreateSiteOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'Город обязателен' })
  @MaxLength(100)
  city: string;

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
