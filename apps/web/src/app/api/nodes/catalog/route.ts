import { withRoute } from '../../../../server/http/withRoute.js';
import { defaultNodeRegistry, initializeRegistry } from '@bito/nodes';

export const runtime = 'nodejs';

export const GET = withRoute({ auth: true }, async () => {
  initializeRegistry();
  const catalog = defaultNodeRegistry.getCatalog();
  return { nodes: catalog };
});
