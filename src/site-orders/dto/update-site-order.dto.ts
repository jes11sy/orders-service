import { IsString, IsOptional, MaxLength, IsIn, IsInt } from 'class-validator';

export class UpdateSiteOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  site?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Создан', 'Не отвечает', 'Отказ'])
  status?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  commentOperator?: string;

  @IsOptional()
  @IsInt()
  orderId?: number;
}
