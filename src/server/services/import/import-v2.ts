import cloneDeep from 'lodash/cloneDeep';
import isEmpty from 'lodash/isEmpty';
import omit from 'lodash/omit';
import pick from 'lodash/pick';
import castArray from 'lodash/castArray';
import { extract, toArray } from '../../../libs/arrays';
import { ObjectBuilder } from '../../../libs/objects';
import { getModel, getModelAttributes, isComponentAttribute, isDynamicZoneAttribute, isMediaAttribute, isRelationAttribute } from '../../utils/models';
import { Entry, EntryId, Schema, SchemaUID, User } from '../../types';
import { head, toPairs } from 'lodash';
import { FileEntry, FileEntryDynamicZone, FileId } from './types';
import { findOrImportFile } from './utils/file';

type Import = {
  version: 2;
  data: ImportData;
};
type ImportData = ImportDataSlugEntries;
type ImportDataSlugEntries = {
  [slug in SchemaUID]: SlugEntries;
};
type SlugEntries = Record<FileId, FileEntry>;

type ImportFailures = {
  /** Error raised. */
  error: Error;
  /** Data for which import failed. */
  data: any;
};

type ImportSuccess = {
  /** Result entity. */
  result: Object;
  /** Data imported. */
  data: any;
};

class IdMapper {
  private mapping: {
    [slug in SchemaUID]?: Map<string | number, string | number>;
  } = {};

  public getMapping(slug: SchemaUID, fileId: string | number) {
    return this.mapping[slug]?.get(`${fileId}`);
  }

  public setMapping(slug: SchemaUID, fileId: string | number, dbId: string | number) {
    if (!this.mapping[slug]) {
      this.mapping[slug] = new Map<string | number, string | number>();
    }

    this.mapping[slug]!.set(`${fileId}`, dbId);
  }
}

/**
 * Import data.
 * @returns {Promise<ImportDataRes>}
 */
const importDataV2 = async (
  fileContent: Import,
  {
    slug: slugArg,
    user,
    idField,
  }: {
    slug: SchemaUID;
    /** User importing the data. */
    user: User;
    /** Field used as unique identifier. */
    idField: string;
  },
) => {
  const { data } = fileContent;

  const slugs: SchemaUID[] = Object.keys(data) as SchemaUID[];
  let failures: ImportFailures[] = [];
  const fileIdToDbId = new IdMapper();

  const { componentSlugs, mediaSlugs, contentTypeSlugs } = splitSlugs(slugs);
  const componentsDataStore: Partial<Record<SchemaUID, SlugEntries>> = {};
  for (const slug of componentSlugs) {
    componentsDataStore[slug] = data[slug];
  }

  for (const slug of mediaSlugs) {
    const res = await importMedia(data[slug], { user, fileIdToDbId });
    failures.push(...res.failures);
  }

  // Import content types without setting relations.
  for (const slug of contentTypeSlugs) {
    const res = await importContentTypeSlug(data[slug], {
      slug: slug,
      user,
      // Keep behavior of `idField` of version 1.
      ...(slug === slugArg ? { idField } : {}),
      importStage: 'simpleAttributes',
      fileIdToDbId,
      componentsDataStore,
    });
    failures.push(...res.failures);
  }

  // Set relations of content types.
  for (const slug of contentTypeSlugs) {
    const res = await importContentTypeSlug(data[slug], {
      slug: slug,
      user,
      // Keep behavior of `idField` of version 1.
      ...(slug === slugArg ? { idField } : {}),
      importStage: 'relationAttributes',
      fileIdToDbId,
      componentsDataStore,
    });
    failures.push(...res.failures);
  }

  // Sync primary key sequence for postgres databases.
  // See https://github.com/strapi/strapi/issues/12493.
  // TODO: improve strapi typing
  if ((strapi.db as any).config.connection.client === 'postgres') {
    for (const slugFromFile of slugs) {
      const model = getModel(slugFromFile);
      // TODO: handle case when `id` is not a number;
      await strapi.db.connection.raw(`SELECT SETVAL((SELECT PG_GET_SERIAL_SEQUENCE('${model.collectionName}', 'id')), (SELECT MAX(id) FROM ${model.collectionName}) + 1, FALSE);`);
    }
  }

  return { failures };
};

function splitSlugs(slugs: SchemaUID[]) {
  const slugsToProcess = [...slugs];
  const componentSlugs = extract(slugsToProcess, (slug) => getModel(slug)?.modelType === 'component');
  const mediaSlugs = extract(slugsToProcess, (slug) => ['plugin::upload.file'].includes(slug));
  const contentTypeSlugs = extract(slugsToProcess, (slug) => getModel(slug)?.modelType === 'contentType');

  if (slugsToProcess.length > 0) {
    strapi.log.warn(`Some slugs won't be imported: ${slugsToProcess.join(', ')}`);
  }

  return {
    componentSlugs,
    mediaSlugs,
    contentTypeSlugs,
  };
}

const importMedia = async (slugEntries: SlugEntries, { user, fileIdToDbId }: { user: User; fileIdToDbId: IdMapper }): Promise<{ failures: ImportFailures[] }> => {
  const failures: ImportFailures[] = [];

  const fileEntries = toPairs(slugEntries);

  for (let [fileId, fileEntry] of fileEntries) {
    try {
      const dbEntry = await findOrImportFile(fileEntry, user, { allowedFileTypes: ['any'] });
      if (dbEntry) {
        fileIdToDbId.setMapping('plugin::upload.file', fileId, dbEntry?.id);
      }
    } catch (err: any) {
      strapi.log.error(err);
      failures.push({ error: err, data: fileEntry });
    }
  }

  return {
    failures,
  };
};

type ImportStage = 'simpleAttributes' | 'relationAttributes';

const importContentTypeSlug = async (
  slugEntries: SlugEntries,
  {
    slug,
    user,
    idField,
    importStage,
    fileIdToDbId,
    componentsDataStore,
  }: { slug: SchemaUID; user: User; idField?: string; importStage: ImportStage; fileIdToDbId: IdMapper; componentsDataStore: Partial<Record<SchemaUID, SlugEntries>> },
): Promise<{ failures: ImportFailures[]; success: ImportSuccess[] }> => {
  let fileEntries = toPairs(slugEntries);

  // Sort localized data with default locale first.
  const sortDataByLocale = async () => {
    const schema = getModel(slug);

    if (schema.pluginOptions?.i18n?.localized) {
      const defaultLocale = await strapi.plugin('i18n').service('locales').getDefaultLocale();
      fileEntries = fileEntries.sort((dataA, dataB) => {
        if (dataA[1].locale === defaultLocale && dataB[1].locale === defaultLocale) {
          return 0;
        } else if (dataA[1].locale === defaultLocale) {
          return -1;
        }
        return 1;
      });
    }
  };
  await sortDataByLocale();

  const failures: ImportFailures[] = [];
  const success: ImportSuccess[] = [];
  for (let [fileId, fileEntry] of fileEntries) {
    try {
      const result = await updateOrCreate(user, slug, fileId, fileEntry, idField, { importStage, fileIdToDbId, componentsDataStore });
      success.push({ result, data: fileEntry });
    } catch (err: any) {
      strapi.log.error(err);
      failures.push({ error: err, data: fileEntry });
    }
  }

  return {
    failures,
    success,
  };
};

const updateOrCreate = async (
  user: User,
  slug: SchemaUID,
  fileId: FileId,
  fileEntryArg: FileEntry,
  idFieldArg: string | undefined,
  { importStage, fileIdToDbId, componentsDataStore }: { importStage: ImportStage; fileIdToDbId: IdMapper; componentsDataStore: Partial<Record<SchemaUID, SlugEntries>> },
) => {
  const schema = getModel(slug);
  const idField = idFieldArg || schema?.pluginOptions?.['import-export-entries']?.idField || 'id';

  let fileEntry = cloneDeep(fileEntryArg);

  if (importStage == 'simpleAttributes') {
    fileEntry = removeComponents(schema, fileEntry);
    fileEntry = linkMediaAttributes(schema, fileEntry, { fileIdToDbId });
    const attributeNames = getModelAttributes(slug, { filterOutType: ['relation'] })
      .map(({ name }) => name)
      .concat('id', 'localizations', 'locale');
    fileEntry = pick(fileEntry, attributeNames);
  } else if (importStage === 'relationAttributes') {
    fileEntry = setComponents(schema, fileEntry, { fileIdToDbId, componentsDataStore });
    const attributeNames = getModelAttributes(slug, { filterType: ['component', 'dynamiczone', 'relation'] })
      .map(({ name }) => name)
      .concat('id', 'localizations', 'locale');
    fileEntry = pick(fileEntry, attributeNames);
  }

  let dbEntry: Entry | null = null;
  if (schema?.modelType === 'contentType' && schema?.kind === 'singleType') {
    dbEntry = await updateOrCreateSingleTypeEntry(user, slug, fileId, fileEntry, { importStage, fileIdToDbId });
  } else {
    dbEntry = await updateOrCreateCollectionTypeEntry(user, slug, fileId, fileEntry, { idField, importStage, fileIdToDbId });
  }
  if (dbEntry) {
    fileIdToDbId.setMapping(slug, fileId, dbEntry.id);
  }

  return dbEntry;
};

function linkMediaAttributes(schema: Schema, fileEntry: FileEntry, { fileIdToDbId }: { fileIdToDbId: IdMapper }) {
  for (const [attributeName, attribute] of Object.entries(schema.attributes)) {
    let attributeValue = fileEntry[attributeName] as string | number | string[] | number[] | null;
    if (attributeValue == null) {
      continue;
    }

    if (isMediaAttribute(attribute)) {
      attributeValue = castArray(attributeValue)
        .map((id) => fileIdToDbId.getMapping('plugin::upload.file', id as number | string))
        .filter(Boolean) as string[] | number[];

      if (!attribute.multiple) {
        attributeValue = attributeValue[0];
      }

      fileEntry[attributeName] = attributeValue;
    }
  }

  return fileEntry;
}

function removeComponents(schema: Schema, fileEntry: FileEntry) {
  const store: Record<string, any> = {};
  for (const [attributeName, attribute] of Object.entries(schema.attributes)) {
    // Do not reset an attribute component that is not imported.
    if (typeof fileEntry[attributeName] === 'undefined') {
      continue;
    }

    if (isComponentAttribute(attribute)) {
      if (attribute.repeatable) {
        store[attributeName] = [];
      } else {
        store[attributeName] = null;
      }
    } else if (isDynamicZoneAttribute(attribute)) {
      store[attributeName] = [];
    }
  }

  return { ...fileEntry, ...(store || {}) };
}

function setComponents(
  schema: Schema,
  fileEntry: FileEntry,
  { fileIdToDbId, componentsDataStore }: { fileIdToDbId: IdMapper; componentsDataStore: Partial<Record<SchemaUID, SlugEntries>> },
) {
  const store: Record<string, any> = {};
  for (const [attributeName, attribute] of Object.entries(schema.attributes)) {
    const attributeValue = fileEntry[attributeName];
    if (attributeValue == null) {
      continue;
    } else if (isComponentAttribute(attribute)) {
      if (attribute.repeatable) {
        store[attributeName] = (attributeValue as (number | string)[]).map((componentFileId) =>
          getComponentData(attribute.component, `${componentFileId}`, { fileIdToDbId, componentsDataStore }),
        );
      } else {
        store[attributeName] = getComponentData(attribute.component, `${attributeValue as number | string}`, { fileIdToDbId, componentsDataStore });
      }
    } else if (isDynamicZoneAttribute(attribute)) {
      store[attributeName] = (attributeValue as FileEntryDynamicZone[]).map(({ __component, id }) => getComponentData(__component, `${id}`, { fileIdToDbId, componentsDataStore }));
    }
  }

  return { ...fileEntry, ...(store || {}) };
}

function getComponentData(
  /** Slug of the component. */
  slug: SchemaUID,
  /** File id of the component. */
  fileId: FileId,
  { fileIdToDbId, componentsDataStore }: { fileIdToDbId: IdMapper; componentsDataStore: Partial<Record<SchemaUID, SlugEntries>> },
): Record<string, any> | null {
  const schema = getModel(slug);
  const fileEntry = componentsDataStore[slug]![`${fileId}`];

  if (fileEntry == null) {
    return null;
  }

  const store: Record<string, any> = { ...omit(fileEntry, ['id']), __component: slug };

  for (const [attributeName, attribute] of Object.entries(schema.attributes)) {
    const attributeValue = fileEntry[attributeName];
    if (attributeValue == null) {
      store[attributeName] = null;
      continue;
    }

    if (isComponentAttribute(attribute)) {
      if (attribute.repeatable) {
        store[attributeName] = (attributeValue as (number | string)[]).map((componentFileId) =>
          getComponentData(attribute.component, `${componentFileId}`, { fileIdToDbId, componentsDataStore }),
        );
      } else {
        store[attributeName] = getComponentData(attribute.component, `${attributeValue as number | string}`, { fileIdToDbId, componentsDataStore });
      }
    } else if (isDynamicZoneAttribute(attribute)) {
      store[attributeName] = (attributeValue as FileEntryDynamicZone[]).map(({ __component, id }) => getComponentData(__component, `${id}`, { fileIdToDbId, componentsDataStore }));
    } else if (isMediaAttribute(attribute)) {
      if (attribute.multiple) {
        store[attributeName] = (attributeValue as (number | string)[]).map((id) => fileIdToDbId.getMapping('plugin::upload.file', id));
      } else {
        store[attributeName] = fileIdToDbId.getMapping('plugin::upload.file', attributeValue as number | string);
      }
    } else if (isRelationAttribute(attribute)) {
      if (attribute.relation.endsWith('Many')) {
        store[attributeName] = (attributeValue as (number | string)[]).map((id) => fileIdToDbId.getMapping(attribute.target, id));
      } else {
        store[attributeName] = fileIdToDbId.getMapping(attribute.target, attributeValue as number | string);
      }
    } else if (isMediaAttribute(attribute)) {
      if (attribute.multiple) {
        store[attributeName] = castArray(attributeValue as number | string | (number | string)[]).map((id) => fileIdToDbId.getMapping('plugin::upload.file', id));
      } else {
        store[attributeName] = fileIdToDbId.getMapping('plugin::upload.file', `${head(castArray(attributeValue as number | string))}`);
      }
    }
  }

  return store;
}

const updateOrCreateCollectionTypeEntry = async (
  user: User,
  slug: SchemaUID,
  fileId: FileId,
  fileEntry: FileEntry,
  { idField, importStage, fileIdToDbId }: { idField: string; importStage: ImportStage; fileIdToDbId: IdMapper },
): Promise<Entry | null> => {
  const schema = getModel(slug);

  const whereBuilder = new ObjectBuilder();
  if (fileIdToDbId.getMapping(slug, fileId)) {
    whereBuilder.extend({ id: fileIdToDbId.getMapping(slug, fileId) });
  } else if (fileEntry[idField]) {
    whereBuilder.extend({ [idField]: fileEntry[idField] });
  }
  const where = whereBuilder.get();

  if (!schema.pluginOptions?.i18n?.localized) {
    let dbEntry: Entry = await strapi.db.query(slug).findOne({ where });

    if (!dbEntry || isEmpty(where)) {
      return strapi.entityService.create(slug, { data: fileEntry });
    } else {
      return strapi.entityService.update(slug, dbEntry.id, { data: omit(fileEntry, ['id']) });
    }
  } else {
    if (!fileEntry.locale) {
      throw new Error(`No locale set to import entry for slug ${slug} (data ${JSON.stringify(fileEntry)})`);
    }

    const defaultLocale = await strapi.plugin('i18n').service('locales').getDefaultLocale();
    const isDatumInDefaultLocale = fileEntry.locale === defaultLocale;

    let dbEntryDefaultLocaleId: EntryId | null = null;
    let dbEntry: Entry | null = await strapi.db.query(slug).findOne({ where, populate: ['localizations'] });
    if (isDatumInDefaultLocale) {
      dbEntryDefaultLocaleId = dbEntry?.id || null;
    } else {
      if (dbEntry) {
        // If `dbEntry` has been found, `dbEntry` holds the data for the default locale and
        // the data for other locales in its `localizations` attribute.
        const localizedEntries = [dbEntry, ...(dbEntry?.localizations || [])];
        dbEntryDefaultLocaleId = localizedEntries.find((e) => e.locale === defaultLocale)?.id || null;
        (dbEntry as any) = localizedEntries.find((e) => e.locale === fileEntry.locale) || null;
      } else {
        // Otherwise try to find dbEntry for default locale through localized siblings.
        let idx = 0;
        const fileLocalizationsIds = (fileEntry?.localizations as EntryId[]) || [];
        while (idx < fileLocalizationsIds.length && !dbEntryDefaultLocaleId && !dbEntry) {
          const dbId = fileIdToDbId.getMapping(slug, fileLocalizationsIds[idx]);
          const localizedEntry: Entry = await strapi.db.query(slug).findOne({ where: { id: dbId }, populate: ['localizations'] });
          const localizedEntries = localizedEntry != null ? [localizedEntry, ...(localizedEntry?.localizations || [])] : [];
          if (!dbEntryDefaultLocaleId) {
            dbEntryDefaultLocaleId = localizedEntries.find((e) => e.locale === defaultLocale)?.id || null;
          }
          if (!dbEntry) {
            (dbEntry as any) = localizedEntries.find((e) => e.locale === fileEntry.locale) || null;
          }
          idx += 1;
        }
      }
    }

    fileEntry = omit(fileEntry, ['localizations']);
    if (isEmpty(omit(fileEntry, ['id']))) {
      return null;
    }

    if (isDatumInDefaultLocale) {
      if (!dbEntryDefaultLocaleId) {
        return strapi.entityService.create(slug, { data: fileEntry });
      } else {
        return strapi.entityService.update(slug, dbEntryDefaultLocaleId, { data: omit({ ...fileEntry }, ['id']) });
      }
    } else {
      if (!dbEntryDefaultLocaleId) {
        throw new Error(`Could not find default locale entry to import localization for slug ${slug} (data ${JSON.stringify(fileEntry)})`);
      }

      if (!dbEntry) {
        const insertLocalizedEntry = strapi.plugin('i18n').service('core-api').createCreateLocalizationHandler(getModel(slug));
        return insertLocalizedEntry({ id: dbEntryDefaultLocaleId, data: omit({ ...fileEntry }, ['id']) });
      } else {
        return strapi.entityService.update(slug, dbEntry.id, { data: omit({ ...fileEntry }, ['id']) });
      }
    }
  }
};

const updateOrCreateSingleTypeEntry = async (
  user: User,
  slug: SchemaUID,
  fileId: FileId,
  fileEntry: FileEntry,
  { importStage, fileIdToDbId }: { importStage: ImportStage; fileIdToDbId: IdMapper },
): Promise<Entry | null> => {
  const schema = getModel(slug);

  if (!schema.pluginOptions?.i18n?.localized) {
    let dbEntry: Entry = await strapi.db
      .query(slug)
      .findMany({})
      .then((entries) => toArray(entries)?.[0]);

    if (!dbEntry) {
      return strapi.entityService.create(slug, { data: fileEntry });
    } else {
      return strapi.entityService.update(slug, dbEntry.id, { data: omit(fileEntry, ['id']) });
    }
  } else {
    const defaultLocale = await strapi.plugin('i18n').service('locales').getDefaultLocale();
    const isDatumInDefaultLocale = !fileEntry.locale || fileEntry.locale === defaultLocale;

    fileEntry = omit(fileEntry, ['localizations']);
    if (isEmpty(omit(fileEntry, ['id']))) {
      return null;
    }

    let entryDefaultLocale = await strapi.db.query(slug).findOne({ where: { locale: defaultLocale } });
    if (!entryDefaultLocale) {
      entryDefaultLocale = await strapi.entityService.create(slug, { data: { ...fileEntry, locale: defaultLocale } });
    }

    if (isDatumInDefaultLocale) {
      if (!entryDefaultLocale) {
        return strapi.entityService.create(slug, { data: fileEntry });
      } else {
        return strapi.entityService.update(slug, entryDefaultLocale.id, { data: fileEntry });
      }
    } else {
      const entryLocale = await strapi.db.query(slug).findOne({ where: { locale: fileEntry.locale } });
      let datumLocale = { ...entryLocale, ...fileEntry };

      await strapi.db.query(slug).delete({ where: { locale: fileEntry.locale } });

      const insertLocalizedEntry = strapi.plugin('i18n').service('core-api').createCreateLocalizationHandler(getModel(slug));
      return insertLocalizedEntry({ id: entryDefaultLocale.id, data: datumLocale });
    }
  }
};

module.exports = {
  importDataV2,
};
