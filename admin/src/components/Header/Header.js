import { BaseHeaderLayout, Box } from '@strapi/design-system';
import React from 'react';

import { useI18n } from '../../hooks/useI18n';

export const Header = () => {
  const { i18n } = useI18n();

  return (
    <Box background="neutral100">
      <BaseHeaderLayout
        title={i18n('plugin.name', 'Import Export')}
        subtitle={i18n('plugin.description', 'Import/Export data from and to your database in just few clicks')}
        as="h2"
      />
    </Box>
  );
};
