import {
  Globe02Icon,
  Image02Icon,
  Link01Icon,
  TextIcon,
} from '@hugeicons/core-free-icons';

import { Accent, ChatWindow, LinkCard, Outgoing } from '@/components/chat';
import { IconTile, type TileTone } from '@/components/icon-tile';
import { PhotoArt } from '@/components/photo-art';
import { SectionHeading } from '@/components/section-heading';

const kinds: {
  icon: typeof TextIcon;
  tone: TileTone;
  title: string;
  text: string;
}[] = [
  {
    icon: TextIcon,
    tone: 'orange',
    title: 'Selected text',
    text: 'Keeps its line breaks. Longer selections are split into several messages automatically.',
  },
  {
    icon: Link01Icon,
    tone: 'blue',
    title: 'Links',
    text: 'Go as they are, with Telegram’s preview under them.',
  },
  {
    icon: Image02Icon,
    tone: 'pink',
    title: 'Images',
    text: 'Arrive as photos. One Telegram can’t fetch comes as a file, then as a link, so a send never disappears.',
  },
  {
    icon: Globe02Icon,
    tone: 'green',
    title: 'The page',
    text: 'Goes as a link with its title. Add a note or a hashtag from the popup.',
  },
];

export function Kinds() {
  return (
    <section
      aria-labelledby="features"
      className="page grid items-center gap-12 py-24 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-24"
    >
      <div className="flex flex-col gap-10">
        <SectionHeading id="features" title="Whatever you right-click">
          The menu offers what’s under the pointer, and each kind arrives the
          way Telegram shows it best.
        </SectionHeading>
        <ul className="flex flex-col gap-6">
          {kinds.map((kind) => (
            <li key={kind.title} className="flex gap-4">
              <IconTile icon={kind.icon} tone={kind.tone} />
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold">{kind.title}</h3>
                <p className="text-sm text-muted-foreground">{kind.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="h-144">
        <ChatWindow
          label="A chat with a quote, a link with its preview, a photo, and a page sent with a note and #recipes"
          name="Me"
          tone="blue"
          pattern="doodles"
        >
          <Outgoing time="10:02" button="Open page">
            {'Measure twice,\ncut once.'}
          </Outgoing>
          <Outgoing
            time="10:05"
            card={
              <LinkCard site="maps.example" title="Coffee near the station" />
            }
          >
            <Accent>maps.example/coffee</Accent>
          </Outgoing>
          <Outgoing
            time="10:11"
            media={<PhotoArt scene="dusk" className="aspect-3/2" />}
          />
          <Outgoing
            time="10:17"
            card={
              <LinkCard
                site="bakehouse.example"
                title="A weeknight country loaf"
              />
            }
          >
            {'Try this on Sunday '}
            <Accent>#recipes</Accent>
            {'\n'}
            <Accent>bakehouse.example/country-loaf</Accent>
          </Outgoing>
        </ChatWindow>
      </div>
    </section>
  );
}
