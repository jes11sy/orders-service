import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, MaxLength, Matches, IsIn, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiProperty({ description: 'Рекламная кампания' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  rk: string;

  @ApiProperty({ description: 'Город' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiProperty({ required: false, description: 'Имя аккаунта Avito' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  avitoName?: string;

  @ApiProperty({ description: 'Телефон клиента' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{9,14}$/, { message: 'Неверный формат телефона' })
  @MaxLength(15)
  phone: string;

  @ApiProperty({ description: 'Тип заказа' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  typeOrder: string;

  @ApiProperty({ description: 'Имя клиента' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/^[^<>]*$/, { message: 'HTML теги не разрешены' })
  clientName: string;

  @ApiProperty({ description: 'Адрес' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/^[^<>]*$/, { message: 'HTML теги не разрешены' })
  address: string;

  @ApiProperty({ description: 'Дата встречи' })
  @IsDateString()
  @IsNotEmpty()
  dateMeeting: string;

  @ApiProperty({ description: 'Тип оборудования' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  typeEquipment: string;

  @ApiProperty({ description: 'Описание проблемы' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  problem: string;

  @ApiProperty({ required: false, description: 'Запись звонка' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  callRecord?: string;

  @ApiProperty({ required: false, default: 'Ожидает', description: 'Статус заказа' })
  @IsString()
  @IsOptional()
  @IsIn(['Ожидает', 'Принял', 'В пути', 'В работе', 'Готово', 'Отказ', 'Модерн', 'Незаказ'])
  statusOrder?: string;

  @ApiProperty({ description: 'ID оператора' })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  operatorNameId: number;

  @ApiProperty({ required: false, description: 'ID чата Avito' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  avitoChatId?: string;

  @ApiProperty({ required: false, description: 'ID звонка' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  callId?: string;

  @ApiProperty({ required: false, description: 'Комментарий' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  @Matches(/^[^<>]*$/, { message: 'HTML теги не разрешены' })
  comment?: string;
}

