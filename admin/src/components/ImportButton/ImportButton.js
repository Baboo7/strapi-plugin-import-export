import { Button } from '@strapi/design-system';
import { CheckPermissions } from '@strapi/helper-plugin';
import Upload from '@strapi/icons/Upload';
import React, { useState } from 'react';
import { useIntl } from 'react-intl';

import { pluginPermissions } from '../../permissions';
import getTrad from '../../utils/getTrad';
import { ImportModal } from '../ImportModal';

export const ImportButton = ({ fullWidth = false }) => {
  const { formatMessage } = useIntl();

  const [importVisible, setImportVisible] = useState(false);

  const openImportModal = () => {
    setImportVisible(true);
  };

  const closeImportModal = () => {
    setImportVisible(false);
  };

  return (
    <CheckPermissions permissions={pluginPermissions.importButton}>
      <Button startIcon={<Upload />} onClick={openImportModal} fullWidth={fullWidth}>
        {formatMessage({ id: getTrad('plugin.cta.import') })}
      </Button>

      {importVisible && <ImportModal onClose={closeImportModal} />}
    </CheckPermissions>
  );
};
