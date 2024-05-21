import { Button } from '@strapi/design-system';
import { CheckPermissions } from '@strapi/helper-plugin';
import Download from '@strapi/icons/Download';
import React, { useState } from 'react';
import { useIntl } from 'react-intl';

import { pluginPermissions } from '../../permissions';
import getTrad from '../../utils/getTrad';
import { ExportModal } from '../ExportModal';

export const ExportButton = ({ availableExportFormats, unavailableOptions, fullWidth = false }) => {
  const { formatMessage } = useIntl();

  const [exportVisible, setExportVisible] = useState(false);

  const openExportModal = () => {
    setExportVisible(true);
  };

  const closeExportModal = () => {
    setExportVisible(false);
  };

  return (
    <CheckPermissions permissions={pluginPermissions.exportButton}>
      <Button startIcon={<Download />} onClick={openExportModal} fullWidth={fullWidth}>
        {formatMessage({ id: getTrad('plugin.cta.export') })}
      </Button>

      {exportVisible && <ExportModal availableExportFormats={availableExportFormats} unavailableOptions={unavailableOptions} onClose={closeExportModal} />}
    </CheckPermissions>
  );
};
