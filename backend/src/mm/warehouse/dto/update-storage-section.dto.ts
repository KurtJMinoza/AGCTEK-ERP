import { PartialType } from '@nestjs/mapped-types'
import { CreateStorageSectionDto } from './create-storage-section.dto'

export class UpdateStorageSectionDto extends PartialType(CreateStorageSectionDto) {}
