const Strapi = require('@strapi/strapi');
const fs = require('fs');
const path = require('path');
const { PATH_TO_UPLOADS_FOLDER } = require('../constants');

const ENABLE_DELETE_DB_BEFORE_SETUP = true;
const ENABLE_DELETE_DB_AFTER_ALL = false;

const ENABLE_CLEANUP_DB = true;
const ENABLE_CLEANUP_UPLOADS = true;

const PATH_TO_DB_FILE = `${__dirname}/test-app/data/data.sqlite`;

const LOCALES = [
  { code: 'fr', name: 'French (fr)' },
  { code: 'it', name: 'Italian (it)' },
];

let instance;

async function setupStrapi() {
  if (ENABLE_DELETE_DB_BEFORE_SETUP) {
    deleteDatabaseFile(PATH_TO_DB_FILE);
  }

  if (!instance) {
    await Strapi({
      appDir: `${__dirname}/test-app`,
      serveAdminPanel: false,
      autoReload: false,
    }).load();
    instance = strapi;

    await instance.server.mount();
  }

  return instance;
}

async function cleanupStrapi() {
  //close server to release the db-file
  await strapi.server.httpServer.close();

  if (ENABLE_DELETE_DB_AFTER_ALL) {
    deleteDatabaseFile(PATH_TO_DB_FILE);
  }

  // close the connection to the database
  await strapi.db.connection.destroy();
}

function deleteDatabaseFile(pathToDbFile) {
  if (pathToDbFile) {
    if (fs.existsSync(pathToDbFile)) {
      fs.unlinkSync(pathToDbFile);
    }
  }
}

async function setupDatabase() {
  for (const locale of LOCALES) {
    const entry = await strapi.plugin('i18n').service('locales').findByCode(locale.code);
    if (!entry) {
      console.log(`Created locale: ${locale.name}`);
      await strapi.query('plugin::i18n.locale').create({ data: { ...locale } });
    }
  }
}

/**
 * Cleans database.
 * @param {Object} options
 * @param {boolean} options.broadCleaning
 */
async function cleanupDatabase(options = {}) {
  if (ENABLE_CLEANUP_DB) {
    const cleaningCollections = Array.from(strapi.db.metadata)
      .filter(shouldCleanCollection(options))
      .map(([collectionName, { tableName }]) =>
        Promise.all([
          strapi.db.query(collectionName).deleteMany({
            where: {
              id: { $gte: 0 },
            },
          }),
          // Reset auto increment sequence
          strapi.db.connection.raw(`DELETE FROM "sqlite_sequence" WHERE "name" = '${tableName}'`),
        ]),
      );

    await Promise.all(cleaningCollections);
  }
}

async function cleanupUploads() {
  if (ENABLE_CLEANUP_UPLOADS) {
    fs.readdirSync(PATH_TO_UPLOADS_FOLDER).forEach((fileName) => {
      fs.unlinkSync(path.join(PATH_TO_UPLOADS_FOLDER, fileName));
    });
  }
}

const shouldCleanCollection = ({ broadCleaning = false } = {}) => {
  return ([collectionName]) => {
    if (broadCleaning) {
      return collectionName.startsWith('admin::') || collectionName.startsWith('api::') || collectionName.startsWith('plugin::') || isComponent(collectionName);
    }

    return collectionName.startsWith('api::') || isComponent(collectionName);
  };
};

const isComponent = (collectionName) => Object.keys(strapi.components).indexOf(collectionName) > -1;

module.exports = {
  setupDatabase,
  cleanupDatabase,
  setupStrapi,
  cleanupStrapi,
  cleanupUploads,
};
