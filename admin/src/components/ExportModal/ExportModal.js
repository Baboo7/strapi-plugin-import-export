import './style.css';

import { Button, Checkbox, Flex, Grid, GridItem, Loader, ModalBody, ModalFooter, ModalHeader, ModalLayout, Option, Portal, Select, Typography } from '@strapi/design-system';
import pick from 'lodash/pick';
import range from 'lodash/range';
import qs from 'qs';
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { api } from '../../api';
import { useAlerts } from '../../hooks/useAlerts';
import { useDownloadFile } from '../../hooks/useDownloadFile';
import { useI18n } from '../../hooks/useI18n';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useSlug } from '../../hooks/useSlug';
import { dataFormatConfigs, dataFormats } from '../../utils/dataFormats';
import { handleRequestErr } from '../../utils/error';
import { Editor } from '../Editor';

const DEFAULT_OPTIONS = {
  exportFormat: dataFormats.JSON_V2,
  applyFilters: false,
  relationsAsId: false,
  deepness: 5,
  exportPluginsContentTypes: false,
};

export const ExportModal = ({ availableExportFormats = [dataFormats.CSV, dataFormats.JSON_V2, dataFormats.JSON], unavailableOptions = [], onClose }) => {
  const { i18n } = useI18n();
  const { search } = useLocation();
  const { downloadFile, withTimestamp } = useDownloadFile();
  const { slug, isSlugWholeDb } = useSlug();
  const { notify } = useAlerts();
  const { getPreferences } = useLocalStorage();

  const [options, setOptions] = useState({ ...DEFAULT_OPTIONS, ...getPreferences() });
  const [data, setData] = useState(null);
  const [fetchingData, setFetchingData] = useState(false);

  const handleSetOption = (optionName) => (value) => {
    setOptions((previous) => ({ ...previous, [optionName]: value }));
  };

  const shouldShowOption = (optionName) => unavailableOptions.indexOf(optionName) === -1;

  const getData = async () => {
    setFetchingData(true);
    try {
      const res = await api.exportData({
        slug,
        search: qs.stringify(pick(qs.parse(search), ['filters', 'sort'])),
        applySearch: options.applyFilters,
        exportFormat: options.exportFormat,
        relationsAsId: options.relationsAsId,
        deepness: options.deepness,
        exportPluginsContentTypes: options.exportPluginsContentTypes,
      });
      setData(res.data);
    } catch (err) {
      handleRequestErr(err, {
        403: () => notify(i18n('plugin.message.export.error.forbidden.title'), i18n('plugin.message.export.error.forbidden.message'), 'danger'),
        default: () => notify(i18n('plugin.message.export.error.unexpected.title'), i18n('plugin.message.export.error.unexpected.message'), 'danger'),
      });
    } finally {
      setFetchingData(false);
    }
  };

  const writeDataToFile = async () => {
    const config = dataFormatConfigs[options.exportFormat];
    if (!config) {
      throw new Error(`File extension ${options.exportFormat} not supported to export data.`);
    }

    const { fileExt, fileContentType } = config;
    const fileName = `export_${slug}.${fileExt}`.replaceAll(':', '-').replaceAll('--', '-');
    downloadFile(data, withTimestamp(fileName), `${fileContentType};charset=utf-8;`);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(data);
    notify(i18n('plugin.export.copied'), '', 'success');
  };

  const clearData = () => {
    setData(null);
  };

  return (
    <Portal>
      <ModalLayout onClose={onClose} labelledBy="title">
        <ModalHeader>
          <Flex gap={2}>
            <Typography fontWeight="bold" textColor="neutral800" as="h2" id="title">
              {i18n('plugin.cta.export', 'Export')}
            </Typography>
            <Typography textColor="neutral800" id="title">
              {isSlugWholeDb ? i18n('plugin.export.whole-database', 'Whole database') : slug}
            </Typography>
          </Flex>
        </ModalHeader>
        <ModalBody className="plugin-ie-export_modal_body">
          {fetchingData && (
            <>
              <Flex justifyContent="center">
                <Loader>{i18n('plugin.export.fetching-data')}</Loader>
              </Flex>
            </>
          )}
          {!data && !fetchingData && (
            <>
              {shouldShowOption('exportFormat') && (
                <Grid gap={8}>
                  <GridItem col={12}>
                    <Select
                      id="export-format"
                      label={i18n('plugin.export.export-format')}
                      required
                      placeholder={i18n('plugin.export.export-format')}
                      value={options.exportFormat}
                      onChange={handleSetOption('exportFormat')}
                    >
                      {availableExportFormats.map((format) => (
                        <Option key={format} value={format}>
                          {i18n(`plugin.data-format.${format}`)}
                        </Option>
                      ))}
                    </Select>
                  </GridItem>
                </Grid>
              )}

              <Flex direction="column" alignItems="start" gap="16px">
                <Typography fontWeight="bold" textColor="neutral800" as="h2">
                  {i18n('plugin.export.options')}
                </Typography>
                {shouldShowOption('relationsAsId') && (
                  <Checkbox value={options.relationsAsId} onValueChange={handleSetOption('relationsAsId')}>
                    {i18n('plugin.export.relations-as-id')}
                  </Checkbox>
                )}
                {shouldShowOption('applyFilters') && (
                  <Checkbox value={options.applyFilters} onValueChange={handleSetOption('applyFilters')}>
                    {i18n('plugin.export.apply-filters-and-sort')}
                  </Checkbox>
                )}
                {shouldShowOption('exportPluginsContentTypes') && (
                  <Checkbox value={options.exportPluginsContentTypes} onValueChange={handleSetOption('exportPluginsContentTypes')}>
                    {i18n('plugin.export.plugins-content-types')}
                  </Checkbox>
                )}
                {shouldShowOption('deepness') && (
                  <Select label={i18n('plugin.export.deepness')} placeholder={i18n('plugin.export.deepness')} value={options.deepness} onChange={handleSetOption('deepness')}>
                    {range(1, 21).map((deepness) => (
                      <Option key={deepness} value={deepness}>
                        {deepness}
                      </Option>
                    ))}
                  </Select>
                )}
              </Flex>
            </>
          )}
          {data && !fetchingData && (
            <>
              <Editor content={data} language={dataFormatConfigs[options.exportFormat].language} />
            </>
          )}
        </ModalBody>
        <ModalFooter
          startActions={
            <>
              {!!data && (
                <Button variant="tertiary" onClick={clearData}>
                  {i18n('plugin.cta.back-to-options')}
                </Button>
              )}
            </>
          }
          endActions={
            <>
              {!data && <Button onClick={getData}>{i18n('plugin.cta.get-data')}</Button>}
              {!!data && (
                <>
                  <Button variant="secondary" onClick={copyToClipboard}>
                    {i18n('plugin.cta.copy-to-clipboard')}
                  </Button>
                  <Button onClick={writeDataToFile}>{i18n('plugin.cta.download-file')}</Button>
                </>
              )}
            </>
          }
        />
      </ModalLayout>
    </Portal>
  );
};
