import '@/lib/preview';
import '@/styles.css';

import { mount } from '@/lib/mount';

import { Welcome } from './welcome';

await mount(() => <Welcome />);
