import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { readJsonFile } from '../../storage/atomicFile.js'
import type {
  FieldDefinitionObject,
  NormalizedCollectionSchema,
  SchemaDefinition
} from '../../types/public.js'

interface StoredCollectionSchema {
  schema: NormalizedCollectionSchema
}

export function readOption(args: string[], name: string, fallback?: string): string | undefined {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}

export async function loadSchemaFromStorage(path: string): Promise<SchemaDefinition> {
  const collectionsPath = join(path, 'collections')
  const names = await readdir(collectionsPath)
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => {
        const stored = await readJsonFile<StoredCollectionSchema>(
          join(collectionsPath, name, 'schema.json')
        )
        return [
          name,
          {
            fields: Object.fromEntries(
              Object.entries(stored.schema.fields).map(([field, definition]) => [
                field,
                {
                  type: definition.type,
                  nullable: definition.nullable,
                  unique: definition.unique,
                  private: definition.private,
                  ...(definition.hasDefault ? { default: definition.defaultValue } : {}),
                  ...(definition.ref ? { ref: definition.ref } : {})
                } satisfies FieldDefinitionObject
              ])
            ),
            indexes: stored.schema.indexes,
            unique: stored.schema.unique,
            timestamps: stored.schema.timestamps,
            softDelete: stored.schema.softDelete,
            relations: stored.schema.relations
          }
        ]
      })
    )
  )
}
