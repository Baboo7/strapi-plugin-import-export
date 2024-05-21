const { readdirSync } = require('fs');

const { setupStrapi, cleanupStrapi, cleanupDatabase, cleanupUploads, setupDatabase } = require('./helpers/strapi');

beforeAll(async () => {
  await setupStrapi();
  await setupDatabase();
});

afterAll(async () => {
  await cleanupStrapi();
});

beforeEach(async () => {
  await cleanupDatabase();
  await cleanupUploads();
});

it('strapi should be defined', () => {
  expect(strapi).toBeDefined();
});

const testFolder = `${__dirname}/specs`;
const testFiles = readdirSync(testFolder);
for (const testFile of testFiles) {
  require(`${testFolder}/${testFile}`);
}
