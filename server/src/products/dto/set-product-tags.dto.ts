import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class SetProductTagsDto {
  /**
   * Ids, not slugs: a slug is editable, and a client holding a stale one would
   * otherwise silently create a second tag or drop a label it meant to keep.
   * An empty array is the documented way to clear every tag.
   */
  @ApiProperty({
    type: [String],
    description:
      'The complete tag set for the product. Tags missing from the list are unlinked; an empty array clears them all.',
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  tagIds: string[];
}
