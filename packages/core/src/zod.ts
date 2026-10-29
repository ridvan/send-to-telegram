import { z } from 'zod';

// Extension pages and Cloudflare Workers both forbid eval, so zod's compiled
// parsers can never run there. Opting out skips its `new Function` probe.
z.config({ jitless: true });
