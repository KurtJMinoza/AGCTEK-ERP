import { PartialType } from '@nestjs/mapped-types'
import { CreateStorageShelfDto } from './create-storage-shelf.dto'

export class UpdateStorageShelfDto extends PartialType(CreateStorageShelfDto) {}
