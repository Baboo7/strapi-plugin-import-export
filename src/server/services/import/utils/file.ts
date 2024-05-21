import { Entry, MediaEntry, User } from '../../../types';
import { FileEntry } from '../types';
import fs from 'fs';
import fse from 'fs-extra';
import last from 'lodash/last';
import trim from 'lodash/trim';
import os from 'os';
import path from 'path';
import fetch from 'node-fetch';
import { isObjectSafe } from '../../../../libs/objects';
const { nameToSlug } = require('@strapi/utils');

export { findOrImportFile };

module.exports = {
  findOrImportFile,
};

type AllowedMediaTypes = keyof typeof fileTypeCheckers;
type FileEntryMedia = {
  id: string;
  hash: string;
  name: string;
  url: string;
  alternativeText: string;
  caption: string;
};

async function findOrImportFile(fileEntry: FileEntry, user: User, { allowedFileTypes }: { allowedFileTypes: AllowedMediaTypes[] }): Promise<Entry | null> {
  let obj: Partial<FileEntryMedia> = {};
  if (typeof fileEntry === 'string') {
    obj.url = fileEntry;
  } else if (isObjectSafe(fileEntry)) {
    obj = fileEntry;
  } else {
    throw new Error(`Invalid data format '${typeof fileEntry}' to import media. Only 'string', 'number', 'object' are accepted.`);
  }

  if (obj.url) {
    const fileData = getFileDataFromRawUrl(obj.url);
    if (!obj.name) {
      obj.name = fileData.name;
    }
    if (!obj.hash) {
      obj.hash = fileData.hash;
    }
  }

  let file: MediaEntry | null = await findFile(obj, user, allowedFileTypes);

  if (file && !isExtensionAllowed(file.ext.substring(1), allowedFileTypes)) {
    file = null;
  }

  return file;
}

const findFile = async ({ hash, name, url, alternativeText, caption }: Partial<FileEntryMedia>, user: User, allowedFileTypes: AllowedMediaTypes[]): Promise<MediaEntry | null> => {
  let file = null;

  if (!file && hash) {
    [file] = await strapi.entityService.findMany('plugin::upload.file', {
      filters: {
        hash: {
          $startsWith: hash,
        },
      },
      limit: 1,
    });
  }
  if (!file && name) {
    [file] = await strapi.entityService.findMany('plugin::upload.file', { filters: { name }, limit: 1 });
  }
  if (!file && url) {
    const checkResult = isValidFileUrl(url, allowedFileTypes);
    if (checkResult.isValid) {
      file = await findFile({ hash: checkResult.fileData.hash, name: checkResult.fileData.fileName }, user, allowedFileTypes);

      if (!file) {
        file = await importFile({ url: checkResult.fileData.rawUrl, name: name!, alternativeText: alternativeText!, caption: caption! }, user);
      }
    }
  }

  return file;
};

const importFile = async ({ url, name, alternativeText, caption }: { url: string; name: string; alternativeText: string; caption: string }, user: User): Promise<MediaEntry> => {
  let file;
  try {
    file = await fetchFile(url);

    let [uploadedFile] = await strapi
      .plugin('upload')
      .service('upload')
      .upload(
        {
          files: {
            name: file.name,
            type: file.type,
            size: file.size,
            path: file.path,
          },
          data: {
            fileInfo: {
              name: name || file.name,
              alternativeText: alternativeText || '',
              caption: caption || '',
            },
          },
        },
        { user },
      );

    return uploadedFile;
  } catch (err) {
    strapi.log.error(err);
    throw err;
  } finally {
    if (file?.path) {
      deleteFileIfExists(file?.path);
    }
  }
};

const fetchFile = async (
  url: string,
): Promise<{
  name: string;
  type: string;
  size: number;
  path: string;
}> => {
  try {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type')?.split(';')?.[0] || '';
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10) || 0;
    const buffer = await response.buffer();
    const fileData = getFileDataFromRawUrl(url);
    const filePath = await writeFile(fileData.name, buffer);
    return {
      name: fileData.name,
      type: contentType,
      size: contentLength,
      path: filePath,
    };
  } catch (error: any) {
    throw new Error(`Tried to fetch file from url ${url} but failed with error: ${error.message}`);
  }
};

const writeFile = async (name: string, content: Buffer): Promise<string> => {
  const tmpWorkingDirectory = await fse.mkdtemp(path.join(os.tmpdir(), 'strapi-upload-'));

  const filePath = path.join(tmpWorkingDirectory, name);
  try {
    fs.writeFileSync(filePath, content);
    return filePath;
  } catch (err) {
    strapi.log.error(err);
    throw err;
  }
};

const deleteFileIfExists = (filePath: string): void => {
  if (filePath && fs.existsSync(filePath)) {
    fs.rmSync(filePath);
  }
};

const isValidFileUrl = (
  url: string,
  allowedFileTypes: AllowedMediaTypes[],
): {
  isValid: boolean;
  fileData: {
    hash: string;
    fileName: string;
    rawUrl: string;
  };
} => {
  try {
    const fileData = getFileDataFromRawUrl(url);

    return {
      isValid: isExtensionAllowed(fileData.extension, allowedFileTypes),
      fileData: {
        hash: fileData.hash,
        fileName: fileData.name,
        rawUrl: url,
      },
    };
  } catch (err) {
    strapi.log.error(err);
    return {
      isValid: false,
      fileData: {
        hash: '',
        fileName: '',
        rawUrl: '',
      },
    };
  }
};

const isExtensionAllowed = (ext: string, allowedFileTypes: AllowedMediaTypes[]) => {
  const checkers = allowedFileTypes.map(getFileTypeChecker);
  return checkers.some((checker) => checker(ext));
};

const ALLOWED_AUDIOS = ['mp3', 'wav', 'ogg'];
const ALLOWED_IMAGES = ['png', 'gif', 'jpg', 'jpeg', 'svg', 'bmp', 'tif', 'tiff'];
const ALLOWED_VIDEOS = ['mp4', 'avi'];

/** See Strapi file allowedTypes for object keys. */
const fileTypeCheckers = {
  any: (ext: string) => true,
  audios: (ext: string) => ALLOWED_AUDIOS.includes(ext),
  files: (ext: string) => true,
  images: (ext: string) => ALLOWED_IMAGES.includes(ext),
  videos: (ext: string) => ALLOWED_VIDEOS.includes(ext),
} as const;

const getFileTypeChecker = (type: AllowedMediaTypes) => {
  const checker = fileTypeCheckers[type];
  if (!checker) {
    throw new Error(`Strapi file type ${type} not handled.`);
  }
  return checker;
};

const getFileDataFromRawUrl = (
  rawUrl: string,
): {
  hash: string;
  name: string;
  extension: string;
} => {
  const parsedUrl = new URL(decodeURIComponent(rawUrl));

  const name = trim(parsedUrl.pathname, '/').replace(/\//g, '-');
  const extension = parsedUrl.pathname.split('.').pop()?.toLowerCase() || '';
  const hash = nameToSlug(name.slice(0, -(extension!.length + 1)) || '', { separator: '_', lowercase: false });

  return {
    hash,
    name,
    extension,
  };
};
