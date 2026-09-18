import { memo } from 'react';

import Header from '../components/Header';
import Title from './Title';

/**
 * The verification run's report, read beside the conversation or task that
 * produced it.
 *
 * The header used to carry "copy link" / "open in browser" actions pointing at
 * the standalone `/verify/:runId` page. That page was retired with the
 * standalone Acceptance / Verify platform, so the actions had nothing left to
 * reference — the report's destination is this panel.
 */
const VerifyReportHeader = memo(() => <Header title={<Title />} />);

export default VerifyReportHeader;
