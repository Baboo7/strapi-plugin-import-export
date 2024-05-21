import { Box, Option, Select, Tab, TabGroup, TabPanel, TabPanels, Tabs, Typography } from '@strapi/design-system';
import React, { useEffect, useState } from 'react';

import { api } from '../../../../api';
import { useForm } from '../../../../hooks/useForm';
import { useI18n } from '../../../../hooks/useI18n';
import { Editor } from '../../../Editor/Editor';

export const ImportEditor = ({ file, data, dataFormat, slug, onDataChanged, onOptionsChanged }) => {
  const { i18n } = useI18n();
  const [attributeNames, setAttributeNames] = useState([]);

  const { options, getOption, setOption } = useForm({ idField: 'id' });

  useEffect(() => {
    const fetchAttributeNames = async () => {
      const attributeNames = await api.getModelAttributes({ slug });
      setAttributeNames(attributeNames);
    };
    fetchAttributeNames();
  }, []);

  useEffect(() => {
    onOptionsChanged(options);
  }, [options]);

  return (
    <>
      <TabGroup label="Import editor" variant="simple">
        <Tabs>
          <Tab>{i18n('plugin.import.tab.file')}</Tab>
          <Tab>{i18n('plugin.import.tab.options')}</Tab>
        </Tabs>

        <TabPanels>
          <TabPanel>
            <Box style={{ display: 'flex', flexDirection: 'column', gap: 8 }} color="neutral800" paddingTop={4} paddingBottom={4} background="neutral0">
              {file?.name && (
                <Box style={{ display: 'flex', gap: 8 }} paddingTop={2} paddingBottom={2}>
                  <Typography fontWeight="bold" as="p">
                    {i18n('plugin.import.file-name')} :
                  </Typography>
                  <Typography as="p">{file.name}</Typography>
                </Box>
              )}
              <Editor content={data} language={dataFormat} onChange={onDataChanged} />
            </Box>
          </TabPanel>
          <TabPanel>
            <Box color="neutral800" paddingTop={4} paddingBottom={4} background="neutral0">
              <Select
                label={i18n('plugin.form.field.id-field.label')}
                hint={i18n('plugin.form.field.id-field.hint')}
                onClear={() => setOption('idField', 'id')}
                value={getOption('idField')}
                onChange={(value) => setOption('idField', value)}
              >
                {attributeNames.map((name) => (
                  <Option key={name} value={name}>
                    {name}
                  </Option>
                ))}
              </Select>
            </Box>
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </>
  );
};
