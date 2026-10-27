import '../net-dispatcher.ts';

import { Mastra } from '@mastra/core';
import { MastraCompositeStore } from '@mastra/core/storage';
import { LibSQLStore } from '@mastra/libsql';
import { MastraEditor } from '@mastra/editor';
import { sropAgent, sropRoute } from './agents/srop-agent.ts';
import { classificarOcorrenciaWorkflow } from './workflows/classificar-ocorrencia.ts';


export const mastra = new Mastra({
  agents: {
    sropAgent,
  },
  workflows: {
    classificarOcorrenciaWorkflow,
  },
  server: {
    apiRoutes: [sropRoute],
  },
  storage: new MastraCompositeStore({
    id: 'mastra-storage',
    default: new LibSQLStore({
      id: 'mastra-default',
      url: 'file:./mastra.db',
    }),
    editor: new LibSQLStore({
      id: 'mastra-editor',
      url: 'file:./editor.db',
    }),
  }),

  editor: new MastraEditor(),
});