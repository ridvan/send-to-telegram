import '@/lib/preview';
import '@/styles.css';

import { mount } from '@/lib/mount';

import { loadPage } from './page';
import { Popup } from './popup';

const page = await loadPage();

await mount(() => <Popup page={page} />);
