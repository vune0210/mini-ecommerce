import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ReorderProductImagesDto {
  @ApiProperty({
    type: [String],
    description:
      'Image ids in the order they should render. Ids left out keep their relative order behind the ones listed, so a stale client cannot bury images it never knew about.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  imageIds: string[];
}
