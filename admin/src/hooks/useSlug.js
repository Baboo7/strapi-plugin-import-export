import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppInfo } from '@strapi/helper-plugin';
import semver from 'semver';

const SLUG_WHOLE_DB = 'custom:db';

export const useSlug = () => {
  const { pathname } = useLocation();
  const { strapiVersion } = useAppInfo();

  const slug = useMemo(() => {
    const contentTypeTypography = semver.lt(strapiVersion, '4.17.0') ?  "collectionType|singleType" : "collection-types|single-types";

    const matches = pathname.match(new RegExp(`content-manager\/(${contentTypeTypography})\/([a-zA-Z0-9\-:_.]*)`));
    return matches?.[2] ? matches[2] : SLUG_WHOLE_DB;
  }, [pathname]);

  const isSlugWholeDb = useMemo(() => slug === SLUG_WHOLE_DB, [slug]);

  return {
    slug,
    isSlugWholeDb,
  };
};
