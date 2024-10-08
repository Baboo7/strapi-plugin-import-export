const { isArraySafe, toArray } = require('../../../libs/arrays');
const { ObjectBuilder, isObjectSafe } = require('../../../libs/objects');
const { getModelAttributes, getModel } = require('../../utils/models');
const { findOrImportFile } = require('./utils/file');
const { parseInputData } = require('./parsers');

const QUESTION_FIELD_PREFIX = 'question_';
const QUESTION_FIELD_INFO_SUFFIX = 'info';
const CANDIDATE_API = 'api::candidate.candidate';
const NOMINATION_API = 'api::nomination.nomination';
const ANSWER_API = 'api::answer.answer';

/**
 * @typedef {Object} ImportDataRes
 * @property {Array<ImportDataFailures>} failures
 */
/**
 * Represents failed imports.
 * @typedef {Object} ImportDataFailures
 * @property {Error} error - Error raised.
 * @property {Object} data - Data for which import failed.
 */
/**
 * Import data.
 * @param {Array<Object>} dataRaw - Data to import.
 * @param {Object} options
 * @param {string} options.slug - Slug of the model to import.
 * @param {("csv" | "json")} options.format - Format of the imported data.
 * @param {Object} options.user - User importing the data.
 * @param {Object} options.idField - Field used as unique identifier.
 * @returns {Promise<ImportDataRes>}
 */
const importData = async (dataRaw, { slug, format, user, idField }) => {
  let data = await parseInputData(format, dataRaw, { slug });
  data = toArray(data);

  let failures = [];
  let importFunction;
  if (slug === CANDIDATE_API) {
    const validationFailures = await validateCandidatesData(data);
    if (validationFailures.length > 0) {
      return { failures: validationFailures };
    }
    importFunction = async (datum) => await createOrUpdateCandidate(datum);
  } else if (slug === NOMINATION_API) {
    const validationFailures = await validateNominationsData(data);
    if (validationFailures.length > 0) {
      return { failures: validationFailures };
    }
    importFunction = async (datum) => await createOrUpdateNomination(datum);
  } else {
    failures.push('Slug not supported');
    return { failures };
  }

  await strapi.db.transaction(async ({ rollback, commit }) => {
    for (const datum of data) {
      let result;
      try {
        result = await importFunction(datum, { slug, user, idField });
      } catch (err) {
        strapi.log.error(err);
      }
      if (!result) {
        failures.push('Error during import');
        await rollback();
        return { failures };
      }
    }
    commit();
  });

  return { failures };

  // Code from original implementation
  // let res;
  // if (slug === CustomSlugs.MEDIA) {
  //   res = await importMedia(data, { user });
  // } else {
  //   res = await importOtherSlug(data, { slug, user, idField });
  // }

  // return res;
};

// Code from original implementation

// const importMedia = async (fileData, { user }) => {
//   const processed = [];
//   for (let fileDatum of fileData) {
//     let res;
//     try {
//       await findOrImportFile(fileDatum, user, { allowedFileTypes: ['any'] });
//       res = { success: true };
//     } catch (err) {
//       strapi.log.error(err);
//       res = { success: false, error: err.message, args: [fileDatum] };
//     }
//     processed.push(res);
//   }

//   const failures = processed.filter((p) => !p.success).map((f) => ({ error: f.error, data: f.args[0] }));

//   return {
//     failures,
//   };
// };

// const importOtherSlug = async (data, { slug, user, idField }) => {
//   const processed = [];
//   for (let datum of data) {
//     let res;
//     try {
//       await updateOrCreate(user, slug, datum, idField);
//       res = { success: true };
//     } catch (err) {
//       strapi.log.error(err);
//       res = { success: false, error: err.message, args: [datum] };
//     }
//     processed.push(res);
//   }

//   const failures = processed.filter((p) => !p.success).map((f) => ({ error: f.error, data: f.args[0] }));

//   return {
//     failures,
//   };
// };

/**
 * This function returns human-readable list of failures in data validation.
 *
 * Following requirements are validated:
 * - Each candidate has all the required fields
 * - Email fields are not empty
 * - Emails are unique
 * - Party ids are valid if provided
 * - If any nomination data is provided, it should have all the required fields 
 * - If any question data is provided, the question ids are checked and the values and info fields are checked so that they are valid JSON
 */
const validateCandidatesData = async (data) => {
  const failures = new Set();
  const requiredFields = ['firstName', 'lastName', 'email', 'published'];
  const requiredNominationFields = ['election', 'constituency'];
  const emails = [];
  const nominationUIDs = [];
  const parties = (await strapi.entityService.findMany('api::party.party')).map((x) => x.id);
  const elections = (await strapi.entityService.findMany('api::election.election')).map((x) => x.id);
  const constituencies = (await strapi.entityService.findMany('api::constituency.constituency')).map((x) => x.id);
  const questions = (await strapi.entityService.findMany('api::question.question')).map((x) => x.id);

  for (const [i, candidate] of data.entries()) {
    const missingFields = [];
    const fields = Object.keys(candidate);
    for (const requiredField of requiredFields) {
      if (!fields.includes(requiredField)) {
        missingFields.push(requiredField);
      }
    }
    if (missingFields.length > 0) {
      failures.add(`Row ${i + 2} is missing required fields: ${missingFields.join(', ')}`);
    }

    if (candidate.email.length == 0) {
      failures.add(`Row ${i + 2} is missing email`);
    }

    if (emails.includes(candidate.email)) {
      failures.add(`Rows ${emails.indexOf(candidate.email) + 2} and ${i + 2} has same email: ${candidate.email}`);
    }
    emails.push(candidate.email);

    if (candidate.party && !parties.includes(candidate.party)) {
      failures.add(`Row ${i + 2} has invalid party id: ${candidate.party}`);
    }

    // Check possible nomination data
    if (requiredNominationFields.some((f) => candidate[f])) {

      // Convert nomination relations to proper ids, because these aren't handled by the import function
      for (const rel of ['election', 'constituency']) {
        try {
          candidate[rel] = JSON.parse(candidate[rel]);
        } catch (e) {
          failures.add(`Row ${i + 2} has invalid ${rel} id: ${candidate[rel]}`);
        }
      }

      if (!elections.includes(candidate.election)) {
        failures.add(`Row ${i + 2} has invalid election id: ${candidate.election}`);
      }

      if (!constituencies.includes(candidate.constituency)) {
        failures.add(`Row ${i + 2} has invalid constituency id: ${candidate.constituency}`);
      }

      const nominationUID = candidate?.email + ':' + candidate?.election + ':' + candidate?.constituency + ':' + (candidate?.party ?? '');
      if (nominationUIDs.includes(nominationUID)) {
        failures.add(`Rows ${nominationUIDs.indexOf(nominationUID) + 2} and ${i + 2} has same email, election, constituency and party: ${nominationUID}`);
      }
      nominationUIDs.push(nominationUID);
    }

    // Check possible question data
    for (const q of fields) {
      const res = parseQuestionField(q);
      if (!res) continue;
      if (res.error) {
        failures.add(res.error);
        continue;
      }
      if (!questions.includes(res.question)) {
        failures.add(`Invalid question id in column: ${q}`);
        continue;
      }
      try {
        candidate[q] = JSON.parse(candidate[q]);
      } catch (e) {
        failures.add(`Row ${i + 2} has invalid ${q}: ${candidate[q]}`);
      }
    }
  }

  return [...failures.values()];
};

/**
 * Parse a field name and if it's a question field, parse it and return the question id and possible info status.
 * @param field - The field name
 * @returns {object} - 1. Returns `null` if the field is not a question field
 * 2. Returns an object with the properties
 * ```
 *  {
 *    question: number;
 *    info: boolean;
 *  }
 *  |
 *  {
 *    error?: string;
 *  }
 * ```
 */
function parseQuestionField(field) {
  if (!field.startsWith(QUESTION_FIELD_PREFIX)) return null;
  const parts = field.split('_');
  const question = parseInt(parts[1]);
  if (parts.length > 3 || (parts[2] && parts[2] !== QUESTION_FIELD_INFO_SUFFIX))
    return { error: `Invalid question column: ${field}` };
  const info = parts[2] === QUESTION_FIELD_INFO_SUFFIX;
  return {
    question,
    info
  }
}

/**
 * This function returns human-readable list of failures in data validation.
 * - Each nomination has all the required fields (election, constituency, candidate, party, electionSymbol, published)
 * - Emails are not empty
 * - Every email is email of some candidate
 * - Each combination of election, constituency, email and party is unique
 * - Election, constituency and party ids are valid
 *
 * Id of candidate is added to the data because it is needed instead of email when importing.
 */
const validateNominationsData = async (data) => {
  const failures = new Set();
  const requiredFields = ['election', 'constituency', 'email', 'electionSymbol', 'published'];
  const elections = (await strapi.entityService.findMany('api::election.election')).map((x) => x.id);
  const constituencies = (await strapi.entityService.findMany('api::constituency.constituency')).map((x) => x.id);
  const parties = (await strapi.entityService.findMany('api::party.party')).map((x) => x.id);
  const nominationUIDs = [];

  for (const [i, nomination] of data.entries()) {
    const nominationUID = nomination?.email + ':' + nomination?.election + ':' + nomination?.constituency + ':' + (nomination?.party ?? '');

    const missingFields = [];
    const fields = Object.keys(nomination);
    for (const requiredField of requiredFields) {
      if (!fields.includes(requiredField)) {
        missingFields.push(requiredField);
      }
    }
    if (missingFields.length > 0) {
      failures.add(`Row ${i + 2} is missing required fields: ${missingFields.join(', ')}`);
    }

    if (nomination.email.length == 0) {
      failures.add(`Row ${i + 2} is missing email`);
    }

    const candidate = (await strapi.entityService.findMany(CANDIDATE_API, { filters: { email: nomination.email } }))[0];
    nomination.candidate = candidate;

    if (!candidate) {
      failures.add(`Row ${i + 2} has invalid email`);
    }

    if (!elections.includes(nomination.election)) {
      failures.add(`Row ${i + 2} has invalid election id`);
    }

    if (!constituencies.includes(nomination.constituency)) {
      failures.add(`Row ${i + 2} has invalid constituency id`);
    }

    if (nomination.party && !parties.includes(nomination.party)) {
      failures.add(`Row ${i + 2} has invalid party id`);
    }

    if (nominationUIDs.includes(nominationUID)) {
      failures.add(`Rows ${nominationUIDs.indexOf(nominationUID) + 2} and ${i + 2} has same email, election, constituency and party`);
    }
    nominationUIDs.push(nominationUID);
  }

  return [...failures.values()];
};

const createOrUpdateCandidate = async (data) => {
  const relationName = CANDIDATE_API;
  const publishedAt = data.published.toLowerCase() === 'true' ? new Date() : undefined;

  const where = { email: data.email };

  let [candidate] = await strapi.db.query(relationName).findMany({ where });

  if (!candidate) {
    // const registrationKey = data.registrationKey ?? crypto.randomUUID();
    candidate = await strapi.db.query(relationName).create({ data: { ...data, publishedAt } });
  } else {
    candidate = await strapi.db.query(relationName).update({ where, data: { ...data, publishedAt } });
  }

  // Add possible question answers
  const answers = {};
  for (const [field, value] of Object.entries(data)) {
    const res = parseQuestionField(field);
    if (!res) continue;
    const { question, info } = res;
    answers[question] ??= {
      openAnswer: null,
      value: null,
    };
    if (info) {
      answers[question].openAnswer = value;
    } else { 
      answers[question].value = value;
    }
  }
  for (const [question, answer] of Object.entries(answers)) {
    await createOrUpdateAnswer({ question, candidate, ...answer });
  }

  // Add possible nomination
  if (data.election && data.constituency) await createOrUpdateNomination({ ...data, candidate }, );

  return candidate;
};

const createOrUpdateAnswer = async (data) => {
  const relationName = ANSWER_API;

  const where = { 
    candidate: data.candidate,
    question: data.question,
  };

  let [answer] = await strapi.db.query(relationName).findMany({ where });

  if (!answer) {
    // const registrationKey = data.registrationKey ?? crypto.randomUUID();
    answer = await strapi.db.query(relationName).create({ data });
  } else {
    answer = await strapi.db.query(relationName).update({ where, data });
  }

  return answer;
};

const createOrUpdateNomination = async (data) => {
  const relationName = NOMINATION_API;
  const publishedAt = data.published.toLowerCase() === 'true' ? new Date() : undefined;

  const where = {
    election: data.election,
    constituency: data.constituency,
    candidate: data.candidate,
    party: data.party ? data.party : { $null: true },
  };

  let [nomination] = await strapi.db.query(relationName).findMany({ where });

  if (!nomination) {
    nomination = await strapi.db.query(relationName).create({ data: { ...data, publishedAt } });
  } else {
    nomination = await strapi.db.query(relationName).update({ where, data: { ...data, publishedAt } });
  }

  return nomination;
};




/**
 * Update or create entries for a given model.
 * @param {Object} user - User importing the data.
 * @param {string} slug - Slug of the model.
 * @param {Object} data - Data to update/create entries from.
 * @param {string} idField - Field used as unique identifier.
 * @returns Updated/created entry.
 */
const updateOrCreate = async (user, slug, data, idField = 'id') => {
  const relationAttributes = getModelAttributes(slug, { filterType: ['component', 'dynamiczone', 'media', 'relation'] });
  for (let attribute of relationAttributes) {
    data[attribute.name] = await updateOrCreateRelation(user, attribute, data[attribute.name]);
  }

  let entry;
  const model = getModel(slug);
  if (model.kind === 'singleType') {
    entry = await updateOrCreateSingleType(user, slug, data, idField);
  } else {
    entry = await updateOrCreateCollectionType(user, slug, data, idField);
  }
  return entry;
};

const updateOrCreateCollectionType = async (user, slug, data, idField) => {
  const whereBuilder = new ObjectBuilder();
  if (data[idField]) {
    whereBuilder.extend({ [idField]: data[idField] });
  }
  const where = whereBuilder.get();

  // Prevent strapi from throwing a unique constraint error on id field.
  if (idField !== 'id') {
    delete data.id;
  }

  let entry;
  if (!where[idField]) {
    entry = await strapi.db.query(slug).create({ data });
  } else {
    entry = await strapi.db.query(slug).update({ where, data });

    if (!entry) {
      entry = await strapi.db.query(slug).create({ data });
    }
  }

  return entry;
};

const updateOrCreateSingleType = async (user, slug, data, idField) => {
  delete data.id;

  let [entry] = await strapi.db.query(slug).findMany();
  if (!entry) {
    entry = await strapi.db.query(slug).create({ data });
  } else {
    entry = await strapi.db.query(slug).update({ where: { id: entry.id }, data });
  }

  return entry;
};

/**
 * Update or create a relation.
 * @param {Object} user
 * @param {Attribute} rel
 * @param {number | Object | Array<Object>} relData
 */
const updateOrCreateRelation = async (user, rel, relData) => {
  if (relData == null) {
    return null;
  }

  if (['createdBy', 'updatedBy'].includes(rel.name)) {
    return user.id;
  } else if (rel.type === 'dynamiczone') {
    const components = [];
    for (const componentDatum of relData || []) {
      let component = await updateOrCreate(user, componentDatum.__component, componentDatum);
      component = { ...component, __component: componentDatum.__component };
      components.push(component);
    }
    return components;
  } else if (rel.type === 'component') {
    relData = toArray(relData);
    relData = rel.repeatable ? relData : relData.slice(0, 1);
    const entryIds = [];
    for (const relDatum of relData) {
      if (typeof relDatum === 'number') {
        entryIds.push(relDatum);
      } else if (isObjectSafe(relDatum)) {
        const entry = await updateOrCreate(user, rel.component, relDatum);
        if (entry?.id) {
          entryIds.push(entry.id);
        }
      }
    }
    return rel.repeatable ? entryIds : entryIds?.[0] || null;
  } else if (rel.type === 'media') {
    relData = toArray(relData);
    relData = rel.multiple ? relData : relData.slice(0, 1);
    const entryIds = [];
    for (const relDatum of relData) {
      const media = await findOrImportFile(relDatum, user, { allowedFileTypes: rel.allowedTypes ?? ['any'] });
      if (media?.id) {
        entryIds.push(media.id);
      }
    }
    return rel.multiple ? entryIds : entryIds?.[0] || null;
  } else if (rel.type === 'relation') {
    const isMultiple = isArraySafe(relData);
    relData = toArray(relData);
    const entryIds = [];
    for (const relDatum of relData) {
      if (typeof relDatum === 'number') {
        entryIds.push(relDatum);
      } else if (isObjectSafe(relDatum)) {
        const entry = await updateOrCreate(user, rel.target, relDatum);
        if (entry?.id) {
          entryIds.push(entry.id);
        }
      }
    }
    return isMultiple ? entryIds : entryIds?.[0] || null;
  }

  throw new Error(`Could not update or create relation of type ${rel.type}.`);
};

module.exports = {
  importData,
};
