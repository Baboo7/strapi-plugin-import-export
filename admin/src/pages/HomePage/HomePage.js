import { Box, Checkbox, ContentLayout, Flex, Link, Option, Select, Typography } from '@strapi/design-system';
import { CheckPagePermissions } from '@strapi/helper-plugin';
import range from 'lodash/range';
import React, { memo, useState } from 'react';

import { ExportButton } from '../../components/ExportButton';
import { Header } from '../../components/Header';
import { ImportButton } from '../../components/ImportButton';
import { Alerts } from '../../components/Injected/Alerts';
import { useI18n } from '../../hooks/useI18n';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { pluginPermissions } from '../../permissions';
import { dataFormats } from '../../utils/dataFormats';

const HomePage = () => {
  const { i18n } = useI18n();
  const { getPreferences, updatePreferences } = useLocalStorage();

  const [preferences, setPreferences] = useState(getPreferences());

  const handleUpdatePreferences = (key, value) => {
    updatePreferences({ [key]: value });
    setPreferences(getPreferences());
  };

  return (
    <CheckPagePermissions permissions={pluginPermissions.main}>
      <Header />

      <ContentLayout>
        <Flex direction="column" alignItems="start" gap={8}>
          <Box style={{ alignSelf: 'stretch' }} background="neutral0" padding="32px" hasRadius={true}>
            <Flex direction="column" alignItems="start" gap={6}>
              <Typography variant="alpha">{i18n('plugin.page.homepage.section.quick-actions.title', 'Quick Actions')}</Typography>

              <Box>
                <Flex direction="column" alignItems="start" gap={4}>
                  <Flex gap={4}>
                    <ImportButton />
                    <ExportButton availableExportFormats={[dataFormats.JSON_V2]} />
                  </Flex>
                </Flex>
              </Box>
            </Flex>
          </Box>

          <Box style={{ alignSelf: 'stretch' }} background="neutral0" padding="32px" hasRadius={true}>
            <Flex direction="column" alignItems="start" gap={6}>
              <Typography variant="alpha">{i18n('plugin.page.homepage.section.preferences.title', 'Preferences')}</Typography>

              <Box>
                <Flex direction="column" alignItems="start" gap={4}>
                  <Flex justifyContent="space-between">
                    <Checkbox value={preferences.applyFilters} onValueChange={(value) => handleUpdatePreferences('applyFilters', value)}>
                      <Typography>{i18n('plugin.export.apply-filters-and-sort', 'Apply filters and sort to exported data')}</Typography>
                    </Checkbox>
                  </Flex>
                  <Flex justifyContent="space-between">
                    <Select
                      label={i18n('plugin.export.deepness', 'Deepness')}
                      placeholder={i18n('plugin.export.deepness', 'Deepness')}
                      value={preferences.deepness}
                      onChange={(value) => handleUpdatePreferences('deepness', value)}
                    >
                      {range(1, 21).map((deepness) => (
                        <Option key={deepness} value={deepness}>
                          {deepness}
                        </Option>
                      ))}
                    </Select>
                  </Flex>
                </Flex>
              </Box>
            </Flex>
          </Box>

          <Box style={{ alignSelf: 'stretch' }} background="neutral0" padding="32px" hasRadius={true}>
            <Flex direction="column" alignItems="start" gap={6}>
              <Typography variant="alpha">{i18n('plugin.page.homepage.section.need-help.title', 'Feature Request / Bug Report')}</Typography>

              <Box>
                <Flex direction="column" alignItems="start" gap={4}>
                  <Typography>{i18n('plugin.page.homepage.section.need-help.description', 'Feel free to reach out on the product roadmap, discord or github ✌️')}</Typography>
                  <Flex gap={4}>
                    <Link href="https://strapi-import-export-entries.canny.io" isExternal>
                      {i18n('plugin.page.homepage.section.need-help.product-roadmap', 'Product Roadmap')}
                    </Link>
                    <Link href="https://discord.gg/dcqCAFFdP8" isExternal>
                      {i18n('plugin.page.homepage.section.need-help.discord', 'Discord')}
                    </Link>
                    <Link href="https://github.com/Baboo7/strapi-plugin-import-export-entries/issues" isExternal>
                      {i18n('plugin.page.homepage.section.need-help.github', 'GitHub')}
                    </Link>
                  </Flex>
                </Flex>
              </Box>
            </Flex>
          </Box>
        </Flex>
      </ContentLayout>

      <Alerts />
    </CheckPagePermissions>
  );
};

export default memo(HomePage);
