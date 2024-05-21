import { Box, Divider, Flex, Typography } from '@strapi/design-system';
import { CheckPermissions } from '@strapi/helper-plugin';
import React from 'react';
import { useIntl } from 'react-intl';

import { pluginPermissions } from '../../permissions';
import getTrad from '../../utils/getTrad';
import { ExportButton } from '../ExportButton';
import { ImportButton } from '../ImportButton';

export const InjectedImportExportSingleType = () => {
  const { formatMessage } = useIntl();

  return (
    <CheckPermissions permissions={pluginPermissions.main}>
      <Box background="neutral0" hasRadius shadow="filterShadow" paddingTop={6} paddingBottom={4} paddingLeft={3} paddingRight={3}>
        <Typography variant="sigma" textColor="neutral600">
          {formatMessage({ id: getTrad('plugin.name') })}
        </Typography>
        <Box paddingTop={2} paddingBottom={6}>
          <Divider />
        </Box>

        <Box paddingBottom={1}>
          <Flex direction="column" gap={2}>
            <ImportButton fullWidth />
            <ExportButton fullWidth unavailableOptions={['exportPluginsContentTypes']} />
          </Flex>
        </Box>
      </Box>
    </CheckPermissions>
  );
};
