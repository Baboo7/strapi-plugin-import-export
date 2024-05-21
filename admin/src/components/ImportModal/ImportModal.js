import './style.css';

import { Button, EmptyStateLayout, Flex, Icon, Loader, ModalBody, ModalFooter, ModalHeader, ModalLayout, Portal, Typography } from '@strapi/design-system';
import CheckCircle from '@strapi/icons/CheckCircle';
import IconCode from '@strapi/icons/Code';
import IconFile from '@strapi/icons/File';
import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';

import { api } from '../../api';
import { useAlerts } from '../../hooks/useAlerts';
import { useI18n } from '../../hooks/useI18n';
import { useSlug } from '../../hooks/useSlug';
import { dataFormats } from '../../utils/dataFormats';
import { handleRequestErr } from '../../utils/error';
import { Editor } from '../Editor/Editor';
import { ImportEditor } from './components/ImportEditor';

const ModalState = {
  SUCCESS: 'success',
  PARTIAL: 'partial',
  UNSET: 'unset',
};

export const ImportModal = ({ onClose }) => {
  const { i18n } = useI18n();
  const { slug } = useSlug();
  const { notify } = useAlerts();
  const history = useHistory();

  const [file, setFile] = useState({});
  const [data, setData] = useState('');
  const [options, setOptions] = useState({});
  const [dataFormat, setDataFormat] = useState(dataFormats.CSV);
  const [labelClassNames, setLabelClassNames] = useState('plugin-ie-import_modal_input-label');
  const [uploadSuccessful, setUploadSuccessful] = useState(ModalState.UNSET);
  const [uploadingData, setUploadingData] = useState(false);
  const [importFailuresContent, setImportFailuresContent] = useState('');

  const onDataChanged = (data) => {
    setData(data);
  };

  const onOptionsChanged = (options) => {
    setOptions(options);
  };

  const onReadFile = (e) => {
    const file = e.target.files[0];
    readFile(file);
    setFile(file);
  };

  const readFile = (file) => {
    if (file.type === 'text/csv' || /\.csv$/i.test(file.name)) {
      setDataFormat(dataFormats.CSV);
    } else if (file.type === 'application/json' || /\.json$/i.test(file.name)) {
      setDataFormat(dataFormats.JSON);
    } else {
      throw new Error(`File type ${file.type} not supported.`);
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      setData(text);
    };
    reader.readAsText(file);
  };

  const openCodeEditor = () => {
    setData('{\n\t\n}');
    setDataFormat(dataFormats.JSON);
  };

  const resetDataSource = () => {
    setData('');
    setDataFormat(dataFormats.CSV);
    setFile({});
  };

  const uploadData = async () => {
    setUploadingData(true);
    try {
      const res = await api.importData({
        slug,
        data,
        format: dataFormat,
        ...options,
      });

      const { failures } = res;
      if (!failures.length) {
        setUploadSuccessful(ModalState.SUCCESS);
        notify(i18n('plugin.message.import.success.imported.title'), i18n('plugin.message.import.success.imported.message'), 'success');
        refreshView();
      } else {
        setUploadSuccessful(ModalState.PARTIAL);
        setImportFailuresContent(JSON.stringify(failures, null, '\t'));
        notify(i18n('plugin.message.import.error.imported-partial.title'), i18n('plugin.message.import.error.imported-partial.message'), 'danger');
      }
    } catch (err) {
      handleRequestErr(err, {
        403: () => notify(i18n('plugin.message.import.error.forbidden.title'), i18n('plugin.message.import.error.forbidden.message'), 'danger'),
        413: () => notify(i18n('plugin.message.import.error.payload-too-large.title'), i18n('plugin.message.import.error.payload-too-large.message'), 'danger'),
        default: () => notify(i18n('plugin.message.import.error.unexpected.title'), i18n('plugin.message.import.error.unexpected.message'), 'danger'),
      });
    } finally {
      setUploadingData(false);
    }
  };

  const refreshView = () => {
    history.push('/tmp');
    history.goBack();
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setLabelClassNames([labelClassNames, 'plugin-ie-import_modal_input-label--dragged-over'].join(' '));
  };

  const handleDragLeave = () => {
    setLabelClassNames(labelClassNames.replaceAll('plugin-ie-import_modal_input-label--dragged-over', ''));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleDragLeave();
    const file = e.dataTransfer.files[0];
    readFile(file);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(data);
    notify('Copied', '', 'success');
  };

  const showLoader = uploadingData;
  const showFileDragAndDrop = !uploadingData && uploadSuccessful === ModalState.UNSET && !data;
  const showEditor = !uploadingData && uploadSuccessful === ModalState.UNSET && data;
  const showSuccess = !uploadingData && uploadSuccessful === ModalState.SUCCESS;
  const showPartialSuccess = !uploadingData && uploadSuccessful === ModalState.PARTIAL;

  const showImportButton = showEditor;
  const showRemoveFileButton = showEditor;

  return (
    <Portal>
      <ModalLayout onClose={onClose} labelledBy="title">
        <ModalHeader>
          <Typography fontWeight="bold" textColor="neutral800" as="h2" id="title">
            {i18n('plugin.cta.import')}
          </Typography>
        </ModalHeader>
        <ModalBody className="plugin-ie-import_modal_body">
          {showFileDragAndDrop && (
            <>
              <Typography textColor="neutral800" fontWeight="bold" as="h2">
                {i18n('plugin.import.data-source-step.title')}
              </Typography>
              <Flex gap={4}>
                <label
                  className={`plugin-ie-import_modal_label ${labelClassNames}`}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <span className="plugin-ie-import_modal_label-icon-wrapper">
                    <IconFile />
                  </span>
                  <Typography style={{ fontSize: '1rem', fontWeight: 500 }} textColor="neutral600" as="p">
                    {i18n('plugin.import.drag-drop-file')}
                  </Typography>
                  <input type="file" accept=".csv,.json" hidden="" onChange={onReadFile} />
                </label>
                <label className="plugin-ie-import_modal_label plugin-ie-import_modal_button-label" onClick={openCodeEditor}>
                  <span className="plugin-ie-import_modal_label-icon-wrapper">
                    <IconCode />
                  </span>
                  <Typography style={{ fontSize: '1rem', fontWeight: 500 }} textColor="neutral600" as="p">
                    {i18n('plugin.import.use-code-editor')}
                  </Typography>
                </label>
              </Flex>
            </>
          )}
          {showLoader && (
            <>
              <Flex justifyContent="center">
                <Loader>{i18n('plugin.import.importing-data')}</Loader>
              </Flex>
            </>
          )}
          {showEditor && <ImportEditor file={file} data={data} dataFormat={dataFormat} slug={slug} onDataChanged={onDataChanged} onOptionsChanged={onOptionsChanged} />}
          {showSuccess && (
            <>
              <EmptyStateLayout
                icon={<Icon width="6rem" height="6rem" color="success500" as={CheckCircle} />}
                content={i18n('plugin.message.import.success.imported-successfully')}
                action={
                  <Button onClick={onClose} variant="tertiary">
                    {i18n('plugin.cta.close')}
                  </Button>
                }
              />
            </>
          )}
          {showPartialSuccess && (
            <>
              <Typography textColor="neutral800" fontWeight="bold" as="h2">
                {i18n('plugin.import.partially-failed')}
              </Typography>
              <Typography textColor="neutral800" as="p">
                {i18n('plugin.import.detailed-information')}
              </Typography>
              <Editor content={importFailuresContent} language={'json'} readOnly />
            </>
          )}
        </ModalBody>
        <ModalFooter
          startActions={
            <>
              {showRemoveFileButton && (
                <Button onClick={resetDataSource} variant="tertiary">
                  {i18n('plugin.cta.back-to-data-sources')}
                </Button>
              )}
            </>
          }
          endActions={
            <>
              {showImportButton && <Button onClick={uploadData}>{i18n('plugin.cta.import')}</Button>}
              {showPartialSuccess && (
                <Button variant="secondary" onClick={copyToClipboard}>
                  {i18n('plugin.cta.copy-to-clipboard')}
                </Button>
              )}
            </>
          }
        />
      </ModalLayout>
    </Portal>
  );
};
